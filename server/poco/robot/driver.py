"""Drives the robot: Poco's servos and the belly matrix.

`servos/` and `led_matrix/` already do the hard part - keyframed gestures, pose
calibration, the NeoPixel driver. This is the glue between them and a
PocoAction, and it exists to hold three things that are easy to get wrong:

Nothing here blocks the caller. A gesture takes up to nine seconds, and the
social loop runs at 30 fps with a face to keep track of; a blocking play() would
drop about 270 frames of the conversation Poco is supposed to be watching. Each
device gets its own worker thread.

The belly and the servos are two separate Arduinos on two serial ports, so the
belly is never made to wait behind a running gesture. Either can be missing
independently.

A gesture that arrives while one is already playing is dropped, not queued. By
the time a nine-second sway finishes, a reaction to what someone said before it
started is no longer a reaction to anything.
"""

from __future__ import annotations

import math
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# servos/ and led_matrix/ are plain directories at the repo root rather than
# installed packages - their own scripts run from inside them - so they are put
# on the path here rather than importing them as `poco.servos`.
REPO_ROOT = Path(__file__).resolve().parents[3]
for _part in ("servos", "led_matrix"):
    _dir = REPO_ROOT / _part
    if _dir.is_dir() and str(_dir) not in sys.path:
        sys.path.append(str(_dir))


# Poco breathing. Each part drifts on its own slow sine, and the periods are
# deliberately not multiples of each other - 9, 11, 13 and 17 seconds - so the
# combination never quite repeats and it reads as alive rather than as a loop.
# The feet and the two arms run half a cycle apart, which gives a gentle rock
# rather than both sides moving together.
#
# name: (amplitude in microseconds, period in seconds, phase 0..1)
IDLE_MOTION = {
    "left_leg": (130, 5.0, 0.0),
    "right_leg": (130, 5.0, 0.5),
    "head_roll": (140, 7.0, 0.25),
    "left_arm_pitch": (110, 9.0, 0.0),
    "right_arm_pitch": (110, 9.0, 0.5),
    "left_arm_roll": (90, 11.0, 0.3),
    "right_arm_roll": (90, 11.0, 0.8),
}

# How long each idle glide takes. Also the longest a gesture can be kept
# waiting, since the idle is only interrupted between glides.
IDLE_STEP = 0.45


class Robot:
    """The physical Poco, or a convincing absence of one.

        robot = Robot()
        robot.connect()          # says what it found; never raises
        robot.perform("listen", "worried")
        robot.close()

    With no hardware attached every call still works and prints what would have
    happened, so the rest of the system can be developed and demonstrated
    without the robot on the desk.
    """

    def __init__(
        self,
        servo_port: str | None = None,
        led_port: str | None = None,
        speed: float = 1.0,
        amount: float = 1.0,
        brightness: int = 30,
        quiet: bool = False,
        idle: bool = True,
    ):
        """
        speed/amount: passed to Poco - 0.7 and 0.6 are the app's "Gentle".
        brightness:   0..255 for the belly. 30 is bright enough through fabric.
        quiet:        stop printing what would have happened when not connected.
        idle:         keep Poco gently moving whenever he is not doing anything
                      else. A robot that is completely still between actions
                      reads as switched off.
        """
        self.servo_port = servo_port
        self.led_port = led_port
        self.speed = speed
        self.amount = amount
        self.brightness = brightness
        self.quiet = quiet

        self._board = None
        self._board_port: str | None = None
        self._io = threading.Lock()  # shared: one port, two protocols
        self._poco = None
        self._link = None
        self._poses: dict = {}
        self._gestures: dict = {}
        self._matrix = None
        self._show_face = None

        self.idle = idle
        self._idle_thread: threading.Thread | None = None
        self._idle_stop = threading.Event()
        self._moves = ThreadPoolExecutor(max_workers=1, thread_name_prefix="servos")
        self._belly = ThreadPoolExecutor(max_workers=1, thread_name_prefix="belly")
        self._moving = threading.Event()
        self.last_error: str | None = None
        # Consecutive serial failures. The board reboots when it is replugged
        # or when the servo supply sags, and the handle we hold is then dead -
        # every command times out and nothing recovers until the process is
        # restarted, which is a poor way to lose a session.
        self._fails = 0
        self._reconnecting = threading.Lock()

    # -- state -------------------------------------------------------------

    @property
    def servos_ready(self) -> bool:
        return self._poco is not None

    @property
    def belly_ready(self) -> bool:
        return self._matrix is not None

    @property
    def moving(self) -> bool:
        return self._moving.is_set()

    def _note_failure(self, what: str, exc: Exception) -> None:
        self.last_error = f"{what}: {exc}"
        self._fails += 1
        self._say(f"{what} failed: {exc}")
        if self._fails >= 3:
            self._reconnect()

    def _reconnect(self) -> None:
        """Re-open the board after it has gone away and come back."""
        if not self._reconnecting.acquire(blocking=False):
            return  # another thread is already doing it
        try:
            self._say("board stopped answering - reconnecting")
            self.stop_idle()
            try:
                if self._board is not None:
                    self._board.close()
            except Exception:
                pass
            self._board = None
            self._poco = self._link = self._matrix = None
            time.sleep(2.0)  # the Uno reboots when the port is opened again
            self._open_board()
            self._connect_belly()
            self._connect_servos()
            self._fails = 0
            if self.idle and self.servos_ready:
                self.start_idle()
            self._say(f"reconnected: servos={self.servos_ready} belly={self.belly_ready}")
        finally:
            self._reconnecting.release()

    def _say(self, message: str) -> None:
        if not self.quiet:
            print(f"  [robot] {message}", flush=True)

    # -- connecting --------------------------------------------------------

    def connect(self) -> bool:
        """Attach to whatever is plugged in. Returns True if anything was.

        Never raises: a missing robot is the normal case during development, and
        it should not take the conversation down with it.
        """
        # Poco is one Arduino running poco_firmware.ino, which answers both
        # the servo commands and the belly commands on one port. So the port is
        # opened once here and handed to both halves, with a lock they share -
        # two independently-opened connections to the same device would read
        # each other's replies.
        self._open_board()
        self._connect_belly()
        self._connect_servos()
        if not (self.servos_ready or self.belly_ready):
            self._say("no robot found - running without one")
        if self.idle and self.servos_ready:
            self.start_idle()
        return self.servos_ready or self.belly_ready

    # -- never quite still --------------------------------------------------

    def start_idle(self) -> None:
        if self._idle_thread is not None or not self.servos_ready:
            return
        self._idle_stop.clear()
        self._idle_thread = threading.Thread(target=self._idle_loop, daemon=True)
        self._idle_thread.start()
        self._say("idle motion on")

    def stop_idle(self) -> None:
        self._idle_stop.set()
        if self._idle_thread is not None:
            self._idle_thread.join(timeout=IDLE_STEP * 3)
            self._idle_thread = None

    def _idle_loop(self) -> None:
        home = self._pm.home_pose()
        parts = {n: v for n, v in IDLE_MOTION.items() if n in home}
        if not parts:
            self._say("no home positions recorded - idle motion off")
            return

        # Work out which way each servo can actually travel. Poco rests with
        # his arms down, which puts the arm servos hard against a stop - the
        # roll servos sit past the safety margin at home - so a symmetric swing
        # gets clamped flat on one side and the arm barely moves. Anything
        # short of room on both sides drifts inward instead, away from the stop.
        plan = {}
        for name, (amp, period, phase) in parts.items():
            lo, hi = self._pm.safe_range(name)
            rest = min(max(home[name], lo), hi)     # home itself may be outside
            up, down = hi - rest, rest - lo
            if up >= amp and down >= amp:
                plan[name] = (rest, amp, period, phase, True)      # rock both ways
            else:
                reach = min(amp, max(up, down))
                plan[name] = (rest, reach if up >= down else -reach,
                              period, phase, False)                # drift inward
        moving = [n for n, v in plan.items() if abs(v[1]) > 5]
        self._say(f"idle motion on ({len(moving)} of {len(parts)} servos have room)")
        while not self._idle_stop.is_set():
            if self._moving.is_set():
                # A real gesture owns the servos; it also ends at home, so the
                # drift picks up again from wherever it left him.
                time.sleep(0.15)
                continue
            try:
                t = time.monotonic()
                targets = {}
                for name, (rest, reach, period, phase, both) in plan.items():
                    turn = 2 * math.pi * (t / period + phase)
                    # Both ways: a sine centred on rest. One way: a raised
                    # cosine, which leaves rest and returns to it rather than
                    # trying to push through the stop.
                    offset = (reach * math.sin(turn) if both
                              else reach * (0.5 - 0.5 * math.cos(turn)))
                    targets[name] = self._pm.clamp(name, rest + offset)
                self._poco.move(targets, IDLE_STEP)
            except Exception as exc:
                # Idle drift is not worth taking the robot down for.
                self.last_error = f"idle: {exc}"
                time.sleep(1.0)

    def _connect_servos(self) -> None:
        try:
            import poco_motion as pm
            from gestures import GESTURES
            from servo_link import ServoLink

            if self._board is None:
                raise RuntimeError("no board")
            # Adopts the connection opened in _open_board, sharing its lock with
            # the belly. Opening the port a second time would leave two readers
            # on one device, each swallowing the other's replies.
            self._link = ServoLink(ser=self._board, lock=self._io)
            self._poco = pm.Poco(self._link, speed=self.speed, amount=self.amount)
            self._gestures = GESTURES
            self._poses = pm.load_poses()
            self._pm = pm
            missing = {
                name for name, steps in GESTURES.items()
                if pm.missing_poses(steps, self._poses)
            }
            self._say(f"servos on {self._link.port}")
            if missing:
                # Worth saying out loud: the gesture will be skipped at the
                # moment it is wanted, which looks like the robot ignoring you.
                self._say(f"{len(missing)} gesture(s) need poses recorded: "
                          f"{', '.join(sorted(missing))}")
        except Exception as exc:
            self.last_error = f"servos: {exc}"
            self._say(f"no servos ({type(exc).__name__}: {exc})")

    def _open_board(self) -> None:
        """Open the one board and wait out its boot, once."""
        import serial
        from servo_link import BAUD, find_ports

        port = self.servo_port or self.led_port
        if port is None:
            found = find_ports()
            if not found:
                self._say("no Arduino-looking serial port")
                return
            port = found[0].device
        try:
            self._board = serial.Serial(port, BAUD, timeout=2)
            # Opening resets the Uno. Read its banner rather than sleeping a
            # fixed interval: the servo half prints READY when the PCA9685 has
            # been probed, and that probe is the thing worth waiting for.
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                line = self._board.readline().decode("ascii", "replace").strip()
                if not line:
                    continue
                if line.startswith("#"):
                    self._say(line[1:].strip())
                if line == "READY":
                    break
            self._board_port = port
            self._say(f"board on {port}")
        except Exception as exc:
            self.last_error = f"board: {exc}"
            self._say(f"no board ({type(exc).__name__}: {exc})")

    def _belly_port(self) -> str | None:
        try:
            return self._matrix.ser.port if self._matrix is not None else None
        except Exception:
            return None

    def _connect_belly(self) -> None:
        try:
            from emotions import show_face
            from led_matrix import LedMatrix

            if self._board is None:
                raise RuntimeError("no board")
            self._matrix = LedMatrix(ser=self._board, lock=self._io,
                                     brightness=self.brightness)
            self._show_face = show_face
            self._say("belly connected")
        except Exception as exc:
            self.last_error = f"belly: {exc}"
            self._say(f"no belly ({type(exc).__name__}: {exc})")

    # -- doing things ------------------------------------------------------

    def perform(self, move: str, feeling: str | None = None) -> None:
        """Play a movement and set the belly. Returns immediately."""
        if feeling:
            self.show(feeling)
        if not move:
            return
        if self._moving.is_set():
            self._say(f"still moving - dropped {move}")
            return
        self._moving.set()
        self._moves.submit(self._play, move)

    def draw(self, pattern: list[str], color: str, brightness: float = 1.0) -> None:
        """Draw the face the app sent, rather than looking one up by name.

        The app owns the faces - including ones the adult drew themselves, which
        have no name to look up - so it sends the grid and the colour and this
        just renders them. It also means the 8x8 faces are not maintained in a
        third place.
        """
        self._belly.submit(self._draw_frame, list(pattern), color, brightness)

    @staticmethod
    def _to_led(color: str, brightness: float) -> tuple[int, int, int]:
        """Screen hex -> raw LED value.

        emotions.ts stores each colour already gamma-corrected for a screen
        (255 * (led/255) ** (1/2.2)), so the robot side has to undo exactly that
        or every face comes out washed out and pale. Checked against
        led_matrix/emotions.py: happy round-trips to (255,159,0) against its
        (255,160,0), sad to (0,59,255) against (0,60,255).

        Neutral is the one that does not, landing at (88,88,79) instead of
        (150,150,140), because emotions.ts deliberately darkens it so it reads
        on a white screen. That makes the neutral face dimmer on the robot than
        intended. If that matters, the fix belongs in emotions.ts - a separate
        LED colour beside the screen one - not in a special case here.
        """
        h = color.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        try:
            parts = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
        except (ValueError, IndexError):
            parts = [232, 131, 58]  # Poco's orange, if the hex is unreadable
        scale = max(0.0, min(1.0, brightness))
        return tuple(int(255 * (v / 255) ** 2.2 * scale) for v in parts)

    def _draw_frame(self, pattern: list[str], color: str, brightness: float) -> None:
        try:
            if self._matrix is None:
                lit = sum(row.count("#") for row in pattern)
                self._say(f"would draw {lit}-pixel face in {color}")
                return
            from poco.bridge import DOT_COLORS

            on = self._to_led(color, brightness)
            off = (0, 0, 0)
            # A dot is either the picture's own colour ('#') or names its own
            # ('r', 'y', 'g', 'b'). The rainbow in Party Lights is the second
            # kind, and treating those letters as unlit left the belly blank
            # while the app showed every colour.
            named = {ch: self._to_led(hexcol, brightness)
                     for ch, hexcol in DOT_COLORS.items()}
            h, w = self._matrix.height, self._matrix.width
            frame = []
            for y in range(h):
                row = pattern[y] if y < len(pattern) else ""
                frame.append([
                    named.get(row[x].lower(), on) if x < len(row) and row[x] != "."
                    else off
                    for x in range(w)
                ])
            self._matrix.draw(frame)
        except Exception as exc:
            self._note_failure("draw", exc)

    def set_brightness(self, value: int) -> None:
        """0..255 for the belly. The app's comfort slider is 0..100."""
        self.brightness = max(0, min(255, int(value)))
        if self._matrix is not None:
            self._belly.submit(self._set_brightness, self.brightness)

    def _set_brightness(self, value: int) -> None:
        try:
            self._matrix.set_brightness(value)
        except Exception as exc:
            self._say(f"brightness failed: {exc}")

    def set_speed(self, speed: float, amount: float | None = None) -> None:
        """Comfort speed. Poco reads these per gesture, so this takes effect on
        the next one rather than needing the link rebuilt."""
        self.speed = speed
        if amount is not None:
            self.amount = amount
        if self._poco is not None:
            self._poco.speed = self.speed
            self._poco.amount = self.amount

    def show(self, feeling: str) -> None:
        """Set the belly face. Returns immediately."""
        self._belly.submit(self._draw, feeling)

    def _play(self, move: str) -> None:
        try:
            if self._poco is None:
                self._say(f"would play {move}")
                return
            steps = self._gestures.get(move)
            if steps is None:
                self._say(f"no gesture named {move}")
                return
            if self._pm.missing_poses(steps, self._poses):
                self._say(f"{move} needs poses recorded - skipped")
                return
            self._poco.play(steps, self._poses)
            self._fails = 0
        except Exception as exc:
            # A sagging servo supply reboots the Uno mid-gesture. Poco going
            # quiet is better than the conversation stopping.
            self._note_failure(f"play {move}", exc)
        finally:
            self._moving.clear()

    def _draw(self, feeling: str) -> None:
        try:
            if self._matrix is None:
                self._say(f"would show {feeling}")
                return
            # show_face picks the emotion's own raw LED colour. The app's hex is
            # the same colour gamma-corrected for a screen, so passing it here
            # would wash the belly out.
            self._show_face(self._matrix, feeling)
        except Exception as exc:
            self._note_failure(f"show {feeling}", exc)

    # -- stopping ----------------------------------------------------------

    def stop(self) -> None:
        """Go limp and dark. Matches the app's Stop Poco."""
        self.stop_idle()
        try:
            if self._poco is not None:
                self._poco.release()
            if self._matrix is not None:
                self._matrix.clear()
                self._matrix.show()
        except Exception as exc:
            self._say(f"stop failed: {exc}")

    def close(self) -> None:
        # Drain first: shutting down without waiting closed the serial port
        # while queued belly frames were still being drawn, and every one of
        # them failed with "port that is not open".
        self._moves.shutdown(wait=True)
        self._belly.shutdown(wait=True)
        self.stop()
        try:
            # One shared connection, so it is closed once here rather than by
            # each half in turn.
            if self._board is not None:
                self._board.close()
        except Exception:
            pass

    def __enter__(self) -> "Robot":
        self.connect()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

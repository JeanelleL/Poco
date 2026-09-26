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

import sys
import threading
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
    ):
        """
        speed/amount: passed to Poco - 0.7 and 0.6 are the app's "Gentle".
        brightness:   0..255 for the belly. 30 is bright enough through fabric.
        quiet:        stop printing what would have happened when not connected.
        """
        self.servo_port = servo_port
        self.led_port = led_port
        self.speed = speed
        self.amount = amount
        self.brightness = brightness
        self.quiet = quiet

        self._poco = None
        self._link = None
        self._poses: dict = {}
        self._gestures: dict = {}
        self._matrix = None
        self._show_face = None

        self._moves = ThreadPoolExecutor(max_workers=1, thread_name_prefix="servos")
        self._belly = ThreadPoolExecutor(max_workers=1, thread_name_prefix="belly")
        self._moving = threading.Event()
        self.last_error: str | None = None

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

    def _say(self, message: str) -> None:
        if not self.quiet:
            print(f"  [robot] {message}", flush=True)

    # -- connecting --------------------------------------------------------

    def connect(self) -> bool:
        """Attach to whatever is plugged in. Returns True if anything was.

        Never raises: a missing robot is the normal case during development, and
        it should not take the conversation down with it.
        """
        self._connect_servos()
        self._connect_belly()
        if not (self.servos_ready or self.belly_ready):
            self._say("no robot found - running without one")
        return self.servos_ready or self.belly_ready

    def _connect_servos(self) -> None:
        try:
            import poco_motion as pm
            from gestures import GESTURES
            from servo_link import ServoLink

            self._link = ServoLink(self.servo_port)
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

    def _connect_belly(self) -> None:
        try:
            from emotions import show_face
            from led_matrix import LedMatrix

            self._matrix = LedMatrix(port=self.led_port, brightness=self.brightness)
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
        except Exception as exc:
            # A sagging servo supply reboots the Uno mid-gesture. Poco going
            # quiet is better than the conversation stopping.
            self.last_error = f"play {move}: {exc}"
            self._say(f"play {move} failed: {exc}")
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
            self.last_error = f"show {feeling}: {exc}"
            self._say(f"show {feeling} failed: {exc}")

    # -- stopping ----------------------------------------------------------

    def stop(self) -> None:
        """Go limp and dark. Matches the app's Stop Poco."""
        try:
            if self._poco is not None:
                self._poco.release()
            if self._matrix is not None:
                self._matrix.clear()
                self._matrix.show()
        except Exception as exc:
            self._say(f"stop failed: {exc}")

    def close(self) -> None:
        self._moves.shutdown(wait=False)
        self._belly.shutdown(wait=False)
        self.stop()
        try:
            if self._matrix is not None:
                self._matrix.close()
            if self._link is not None:
                self._link.close()
        except Exception:
            pass

    def __enter__(self) -> "Robot":
        self.connect()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

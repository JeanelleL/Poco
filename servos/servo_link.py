"""Serial link to the Arduino servo firmware.

The Arduino runs servo_test/servo_test.ino and speaks a line protocol: one
command in, one "OK ..." or "ERR ..." line out. This module wraps that in a
blocking request/response client, so calling code never has to think about
framing, and a dropped or malformed reply raises instead of passing silently.

    with ServoLink() as link:
        link.angle(0, 90)

This is the hardware layer -- vision code should import it rather than
touching pyserial directly.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import serial
from serial.tools import list_ports

# 500000, matching the belly half of poco_firmware.ino - they share one board
# and therefore one baud rate. It is also the more accurate of the two on a
# 16 MHz AVR: 500000 divides exactly, 115200 carries about 2% clock error.
BAUD = 500000

# USB vendor IDs seen on Uno boards and the common clones. Genuine Arduino
# is 0x2341; clones ship a CH340 (0x1A86), an FTDI (0x0403), or a
# relabelled 0x2A03 from the Arduino.org split.
_ARDUINO_VIDS = {0x2341, 0x2A03, 0x1A86, 0x0403}


class ServoError(RuntimeError):
    """The firmware answered with ERR, or did not answer at all."""


@dataclass
class Port:
    device: str
    description: str

    def __str__(self) -> str:
        return f"{self.device} ({self.description})"


def find_ports() -> list[Port]:
    """Serial ports that look like an Arduino, best guess first.

    Bluetooth virtual COM ports are the usual false positive on Windows and
    are filtered out -- opening one blocks for seconds and then times out.
    """
    hits, maybes = [], []
    for p in list_ports.comports():
        desc = p.description or ""
        if "Bluetooth" in desc:
            continue
        if p.vid in _ARDUINO_VIDS or "Arduino" in desc or "CH340" in desc:
            hits.append(Port(p.device, desc))
        else:
            maybes.append(Port(p.device, desc))
    return hits + maybes


class ServoLink:
    def __init__(self, port: str | None = None, timeout: float = 2.0,
                 ser=None, lock=None):
        """Open the link. Pass port=None to autodetect.

        Opening the port resets the Uno (the USB adapter toggles DTR), so
        the constructor waits for the firmware's READY line rather than
        sleeping a fixed interval and hoping.

        `ser` adopts an already-open connection instead, for when the servos
        and the belly are the same board: whoever opened it has already taken
        the reset and the READY line, so neither happens again here. `lock` is
        then shared with the belly so a servo command cannot land in the middle
        of a 192-byte frame.
        """
        self._lock = lock
        if ser is not None:
            self.ser = ser
            self.port = getattr(ser, "port", "shared")
            self.banner = []
            return
        if port is None:
            candidates = find_ports()
            if not candidates:
                raise ServoError(
                    "no serial ports found that look like an Arduino. "
                    "Check the USB cable and that the board has a driver."
                )
            port = candidates[0].device

        self.port = port
        try:
            self.ser = serial.Serial(port, BAUD, timeout=timeout)
        except serial.SerialException as e:
            if "Access is denied" in str(e) or "PermissionError" in str(e):
                raise ServoError(
                    f"{port} is in use by another program -- quit any other "
                    "Poco script (calibrate_limits, set_home, pose_editor) "
                    "and close the Arduino Serial Monitor."
                ) from None
            raise
        self.banner: list[str] = []
        self._wait_for_ready()

    # --- plumbing ----------------------------------------------------

    def _wait_for_ready(self, boot_timeout: float = 12.0) -> None:
        # Opening the port resets the Uno; allow well over its boot delay.
        deadline = time.time() + boot_timeout
        while time.time() < deadline:
            line = self.ser.readline().decode("utf-8", "replace").strip()
            if not line:
                continue
            if line == "READY":
                return
            self.banner.append(line)
        raise ServoError(
            f"{self.port} never sent READY. Wrong port, or the board is not "
            f"running servo_test.ino. Saw: {self.banner or 'nothing'}"
        )

    def command(self, line: str) -> str:
        """Send one command, return its OK payload. Raises on ERR."""
        if self._lock is not None:
            with self._lock:
                return self._command(line)
        return self._command(line)

    def _command(self, line: str) -> str:
        self.ser.reset_input_buffer()
        self.ser.write((line + "\n").encode())
        self.ser.flush()

        while True:
            reply = self.ser.readline().decode("utf-8", "replace").strip()
            if not reply:
                raise ServoError(f"timed out waiting for a reply to {line!r}")
            if reply.startswith("#"):
                continue                      # informational, keep reading
            if reply.startswith("ERR"):
                raise ServoError(f"{line!r} rejected: {reply[4:]}")
            if reply.startswith("OK"):
                return reply[3:]
            raise ServoError(f"unparseable reply to {line!r}: {reply!r}")

    # --- commands ----------------------------------------------------

    def ping(self) -> bool:
        return self.command("ping") == "pong"

    def angle(self, channel: int, degrees: float) -> int:
        """Move a servo to an angle. Returns the pulse width actually sent."""
        # reply payload is "a <ch> <deg> <us>"
        reply = self.command(f"a {channel} {round(degrees)}")
        return int(reply.split()[3])

    def pulse(self, channel: int, microseconds: int) -> None:
        """Send a raw pulse width, bypassing the angle mapping."""
        self.command(f"u {channel} {round(microseconds)}")

    def pulses(self, targets: dict[int, int]) -> None:
        """Set several channels' pulse widths in one command (one round trip).

        Needs the "m" command, added to the firmware alongside this method.
        """
        pairs = " ".join(f"{ch} {round(us)}" for ch, us in targets.items())
        self.command(f"m {pairs}")

    def off(self, channel: int) -> None:
        """Stop pulsing a channel. The servo goes limp and stops drawing."""
        self.command(f"off {channel}")

    def set_range(self, min_us: int, max_us: int) -> None:
        """Set the pulse widths that 0 and 180 degrees map to."""
        self.command(f"range {round(min_us)} {round(max_us)}")

    def sweep(self, on: bool = True) -> None:
        """Hand the sweep back to the firmware, or take it back."""
        self.command(f"sweep {1 if on else 0}")

    def selftest(self) -> None:
        """One slow demo sweep on channel 0, run by the firmware.

        Blocks for a few seconds. Useful for confirming the hardware without
        host logic in the picture; it does NOT run automatically on connect.
        """
        self.command("selftest")

    # --- lifecycle ---------------------------------------------------

    def close(self) -> None:
        if self.ser.is_open:
            self.ser.close()

    def __enter__(self) -> "ServoLink":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

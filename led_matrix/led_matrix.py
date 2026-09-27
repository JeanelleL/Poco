"""
Control a NeoPixel LED matrix on an Arduino from Python over USB serial.

Setup:
    uv pip install pyserial
    Upload matrix_firmware.ino to the Arduino first.
    Close the Arduino IDE Serial Monitor (only one program can use the port).

Usage:
    from led_matrix import LedMatrix
    with LedMatrix() as m:
        m.set_pixel(0, 0, (255, 0, 0))
        m.show()

Nothing appears on the LEDs until you call show(). Drawing calls only
change a buffer on your computer; show() sends the whole frame at once.
"""

import colorsys
import time

import serial
from serial.tools import list_ports

ACK = b"K"
READY = b"R"


def find_arduino_port():
    """Guess which serial port is the Arduino."""
    ports = list(list_ports.comports())
    if not ports:
        raise RuntimeError("No serial ports found. Is the Arduino plugged in?")

    keywords = ("arduino", "ch340", "usb serial", "usb-serial", "usbmodem", "usbserial", "wchusb")
    for p in ports:
        text = f"{p.device} {p.description} {p.manufacturer or ''}".lower()
        if any(k in text for k in keywords):
            return p.device

    if len(ports) == 1:
        return ports[0].device

    names = ", ".join(f"{p.device} ({p.description})" for p in ports)
    raise RuntimeError(f"Couldn't tell which port is the Arduino. Pass port='...'. Found: {names}")


def _rgb(color):
    """(r, g, b) as 3 bytes, each clamped to 0-255."""
    return bytes(max(0, min(255, int(c))) for c in color)


class LedMatrix:
    def __init__(self, port=None, width=8, height=8, baud=500000, brightness=30,
                 column_major=True, serpentine=True, flip_x=False, flip_y=False,
                 ser=None, lock=None):
        """
        port:        e.g. "COM3" (Windows) or "/dev/cu.usbmodem1101" (Mac). None = auto-detect.
        width/height: matrix size. width * height must equal NUM_LEDS in the sketch.
        baud:        must match BAUD in the sketch.
        column_major: True if the strip runs down columns, False if it runs along rows.
        serpentine:  True if every other column (or row) runs in the opposite direction.
        flip_x/y:    use these if the layout test shows the image mirrored.

        The defaults match this project's 8x8 panel: the strip starts at the top-left,
        runs down column 0, up column 1, down column 2, and so on.
        """
        self.width = width
        self.height = height
        self.num_leds = width * height
        self.column_major = column_major
        self.serpentine = serpentine
        self.flip_x = flip_x
        self.flip_y = flip_y
        self._buf = bytearray(self.num_leds * 3)
        self._shown = bytes(self.num_leds * 3)   # what's currently on the LEDs, for fades

        # `ser` adopts an already-open connection, for when the belly and the
        # servos are the same board. The opener has already taken the board's
        # reset and its READY byte, so the handshake is not repeated. `lock` is
        # shared with the servo link so a servo command cannot arrive in the
        # middle of a frame - show() disables interrupts and the byte would
        # simply be lost.
        self._lock = lock
        if ser is not None:
            self.ser = ser
        else:
            self.ser = serial.Serial(port or find_arduino_port(), baud, timeout=1)
            self._connect()
        self.set_brightness(brightness)

    # ---------- connection ----------

    def _connect(self):
        # Opening the port resets most Arduinos. Wait for the sketch's boot 'R'.
        deadline = time.time() + 3
        while time.time() < deadline:
            if self.ser.read(1) == READY:
                break
        self.ser.reset_input_buffer()

        # Ping to confirm the sketch is running and the LED count matches.
        self.ser.write(b"?")
        reply = self.ser.read(3)
        if len(reply) != 3 or reply[0:1] != READY:
            raise RuntimeError(
                "Arduino didn't respond. Check that matrix_firmware.ino is uploaded, "
                "the baud rates match, and the Serial Monitor is closed."
            )
        board_leds = (reply[1] << 8) | reply[2]
        if board_leds != self.num_leds:
            raise RuntimeError(
                f"Sketch has NUM_LEDS={board_leds} but Python has {self.width}x{self.height}={self.num_leds}."
            )

    def _send(self, packet):
        if self._lock is not None:
            with self._lock:
                return self._send_locked(packet)
        return self._send_locked(packet)

    def _send_locked(self, packet):
        self.ser.write(packet)
        if self.ser.read(1) != ACK:
            # Glitch: let the Arduino drain, clear our side, and carry on.
            print("warning: Arduino didn't acknowledge, resyncing")
            time.sleep(0.1)
            self.ser.reset_input_buffer()
            return False
        return True

    # ---------- drawing ----------

    def _index(self, x, y):
        if self.flip_x:
            x = self.width - 1 - x
        if self.flip_y:
            y = self.height - 1 - y
        if self.column_major:
            if self.serpentine and x % 2 == 1:
                y = self.height - 1 - y
            return x * self.height + y
        if self.serpentine and y % 2 == 1:
            x = self.width - 1 - x
        return y * self.width + x

    def set_pixel(self, x, y, color):
        """Set pixel (x, y) to (r, g, b). (0, 0) is the top-left. Out-of-range pixels are ignored."""
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        i = self._index(x, y) * 3
        self._buf[i:i + 3] = _rgb(color)

    def fill(self, color):
        self._buf[:] = _rgb(color) * self.num_leds

    def clear(self):
        self.fill((0, 0, 0))

    def draw(self, frame):
        """Draw a whole image. frame[y][x] = (r, g, b). Works with nested lists or a numpy array (H, W, 3)."""
        for y in range(self.height):
            row = frame[y]
            for x in range(self.width):
                self.set_pixel(x, y, row[x])
        self.show()

    def show(self):
        """Send the buffer to the matrix."""
        self._shown = bytes(self._buf)
        return self._send(b"F" + self._buf)

    def show_fade(self, duration=0.5, fps=30):
        """Like show(), but fades smoothly from what's on the LEDs now to the buffer."""
        start, target = self._shown, bytes(self._buf)
        steps = max(1, round(duration * fps))
        for step in range(1, steps + 1):
            t = step / steps
            self._buf[:] = bytes(round(a + (b - a) * t) for a, b in zip(start, target))
            self.show()
            if step < steps:
                time.sleep(1 / fps)

    def set_brightness(self, value):
        """0-255. 64 LEDs at full white can pull ~3.8 A, so keep this low unless your supply can handle it."""
        value = max(0, min(255, int(value)))
        return self._send(b"B" + bytes([value]))

    # ---------- cleanup ----------

    def close(self):
        if self.ser.is_open:
            self.clear()
            self.show()
            self.ser.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


# ---------- demo ----------

if __name__ == "__main__":
    with LedMatrix() as m:
        print("Connected. Blinking red/green (your original sketch)...")
        for _ in range(2):
            m.fill((255, 0, 0)); m.show(); time.sleep(1)
            m.fill((0, 255, 0)); m.show(); time.sleep(1)

        print("Layout test: a blue dot should sweep left to right, row by row, starting top-left.")
        for y in range(m.height):
            for x in range(m.width):
                m.clear()
                m.set_pixel(x, y, (0, 0, 255))
                m.show()
                time.sleep(0.15)

        print("Rainbow. Press Ctrl+C to stop.")
        t = 0.0
        try:
            while True:
                for y in range(m.height):
                    for x in range(m.width):
                        hue = ((x + y) / (m.width + m.height) + t) % 1.0
                        r, g, b = colorsys.hsv_to_rgb(hue, 1.0, 1.0)
                        m.set_pixel(x, y, (r * 255, g * 255, b * 255))
                m.show()
                t += 0.01
                time.sleep(1 / 30)
        except KeyboardInterrupt:
            pass
    print("Done.")

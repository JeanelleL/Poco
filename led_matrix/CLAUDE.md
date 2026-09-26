# LED Matrix: Python control of an Arduino NeoPixel matrix

## Goal
Drive a WS2812B/NeoPixel LED matrix from Python on a Windows laptop, over USB serial to an Arduino. The Arduino runs a fixed "dumb display" sketch; all features (animations, text, images, reacting to other data) get added in Python, not C++.

Purpose: a tool to help autistic students learn and practice emotions. Features: ten preset emotions (color + face each), a solid color of any choice, and special modes (music, bedtime, sun, dance, count, breathe, quiet). Scope decision: the user dropped showing arbitrary emoji (the converter was removed) in favor of a few presets that each look really good and obvious; favor hand-drawn presets over automatic conversion.
- Sensory-friendly by default: low brightness, no flashing, and changes fade in (~0.5 s) rather than switching instantly. Keep new features consistent with this.

## Hardware (as currently configured)
- Arduino board: Arduino Uno R3 (ATmega328P, 16 MHz, 2 KB RAM, 32 KB flash). Its USB chip is an ATmega16U2, which handles 500000 baud cleanly.
- Matrix: 8x8 = 64 LEDs, data pin D6, `NEO_GRB + NEO_KHZ800`. (Earlier notes assumed 16x16; that was wrong.)
- Wiring (from the layout test): strip index 0 is top-left, runs down column 0, up column 1, down column 2, etc. (column-major serpentine). Settings: `column_major=True, serpentine=True, flip_x=False, flip_y=False`, which are the defaults.
- Brightness defaults to 30/255. 64 LEDs at full white can draw ~3.8 A, so keep brightness low unless the power supply is known to handle it.
- 500000 baud works.
- The user's original test sketch (solid red/green blink) worked, so wiring and the Adafruit_NeoPixel library are confirmed good.
- The matrix will likely sit behind (probably white) fabric so the electronics aren't visible. Fabric diffuses each LED into a soft glow and unlit pixels look like fabric, not black. Design rules that follow: lit features on an unlit background, and at least one dark pixel (including diagonals) between separate features so they don't merge.

## Files
- `matrix_firmware.ino`: Arduino sketch. Must live in a folder named `matrix_firmware/` for the Arduino IDE. Uploaded via the Arduino IDE (Adafruit NeoPixel library already installed there).
- `led_matrix.py`: Python module with the `LedMatrix` class plus a demo in `__main__` (red/green blink, layout test, rainbow).
- `text.py`: scrolling text with a built-in 5x7 ASCII font (no dependencies). `scroll_text(m, text, color, speed=8, scale=1, y=None, background, loop=False)`; speed is pixels/second, letters are 6 px wide including spacing. `scale=2` only suits matrices 14+ px tall. Lower-level `text_columns()` / `draw_columns()` draw text into the buffer without calling `show()`, for combining with other effects. CLI: `uv run text.py "message"`.
- `emotions.py`: the preset emotions (happy, sad, angry, scared, surprised, neutral, excited, tired, worried, silly). `EMOTIONS` = name -> `color` + 8-row `face` (`X` = emotion color, `.` = off). No head outline (the user's choice; earlier filled and ring-outline styles were dropped). Faces, chosen by comparing variants with a fabric simulation: happy = 2x2 eyes + big open grin with raised corners; sad = eyes + frown; angry = eyes slanted down toward the middle (brows fused into the eyes) + frown; scared = worried brows slanting up toward the middle + 2x2 eyes + open (filled 4x2) mouth; surprised = eyes + round O mouth; neutral = eyes + straight mouth with the ends tipped up one pixel (very slight smile). User feedback that shaped these: no tear on sad; a wobbly-mouth scared face was confusing; happy should be a little happier; neutral should have a very slight smile. excited, tired and worried were supplied by the user as 7x7 pictures and must stay exactly as designed: copied dot for dot (read from the images by brightness) into the top-left 7x7, right column and bottom row dark. Their colors are the pictures' screen colors gamma-corrected (2.2) and scaled: excited orange (255,77,6), tired muted grey-blue (103,140,170, deliberately dimmer), worried blue-violet (93,48,255). silly was described by the user in words (1-based rows/columns): row 6 all lit (mouth), rows 7-8 columns 5-6 (tongue; "the second and last row" read as second-to-last and last), row 3 columns 6-8 (wink), rows 2-3 column 2 (open eye). The user asked for pink; it's bubblegum pink (255,60,170) to stay distinguishable from surprised's pink (255,0,120). Colors: happy yellow, sad blue, angry red, scared purple, surprised pink, neutral soft white (these six are Claude's choice, not a curriculum requirement). `show_color(m, name, fade=0.5)`, `show_face(m, name, color=None, fade=0.5)`, `draw_face(m, name, color=None)` (buffer only). CLI: `uv run emotions.py` cycles all; `uv run emotions.py happy [color]`.
- `solid.py`: whole matrix one color, any color. `parse_color()` accepts a preset name (`PRESETS` = the emotion colors, always synced from emotions.py, plus red, orange, yellow, green, teal, blue, purple, pink, white, warm white), a hex code (`FF8800` or `#FF8800`), `r,g,b` / `r g b` text, or a tuple. `show_solid(m, color, fade=0.5)`. `pick_color()` opens the Windows color picker (tkinter colorchooser). CLI: `uv run solid.py <preset | RRGGBB | R G B | pick>`; `pick` loops: pick, OK shows it, Cancel ends. In PowerShell `#` starts a comment, so hex codes on the command line go without `#`.
- `modes.py`: special modes, each a hand-drawn icon (`MODES[name]` = `palette` of raw LED colors + 8-row `icon`) with a gentle animation computed by `frame(name, t)` (t=None = still icon). music: beamed notes (violet) bob down one pixel and back, crossfaded, 1.6 s (the user loves this one). bedtime: dim crescent moon cradling a big blue Z that breathes in/out every 4 s; the user asked that the moon clearly mean bedtime, which a moon with stars didn't (user liked the result). sun: small round center (bright 2x2 core `D`, softer edge `d`), a dark gap, then orange rays `R` in 8 directions; a ring of light travels outward (brightness = wave in time minus distance from center, new ring every 1.6 s), so light radiates from the center along the rays. The user asked for a smaller center and outward-radiating rays; earlier versions (pulsing rays, then straight/diagonal rays taking turns) were not liked. Rays touching the center blurred into a plus sign behind fabric, so the gap matters. dance: rainbow arcs (6 bands) whose hues flow through the bands every 4 s, for dance breaks. Calming modes: count = big two-pixel-stroke numbers 1 to 5 in soft teal (`COUNT_DIGITS`), each `COUNT_STEP` 2 s with a 0.35 s fade in/out through dark, the 5 held an extra `COUNT_REST` 2 s, then it loops; breathe = computed blue orb (`_orb`: brighter center, soft anti-aliased edge, radius 1.2-4.3) following `_breath(t)`: `BREATHE_IN` 3 s grow, `BREATHE_HOLD` 0.5 s, `BREATHE_OUT` 3 s shrink, `BREATHE_REST` 0.5 s (7 s per breath; the first version's 4/1/4/1 was too slow for a real breathing exercise; the user likes the orb's large max size), eased; quiet = still purple-blue crescent moon like the phone do-not-disturb symbol. count and breathe have `icon: None` (their frames are computed). All animation is smooth blending, no flashing. `show_icon(m, name)`, `draw_icon(m, name, t=None)`, `run_mode(m, name, duration=None)` (30 fps, fades in; runs until Ctrl+C when duration is None). CLI: `uv run modes.py <mode> [still]`.

## Serial protocol
Baud 500000 on both sides (fall back to 115200 in BOTH files if acks fail). Every command gets a 1-byte reply.

| Command | Payload | Reply |
|---|---|---|
| `F` | NUM_LEDS*3 bytes, R,G,B per LED in strip order | `K` after `show()` |
| `B` | 1 byte brightness 0-255 | `K` |
| `?` | none | `R` + NUM_LEDS as 2 bytes (big endian) |

- On boot the sketch sends `R`. Python waits up to 3 s for it (opening the port resets most Arduinos), then pings `?` and verifies NUM_LEDS matches `width * height`.
- On a short/timed-out packet the sketch replies `E` and drains input until 50 ms of silence.
- Python waits for `K` after every packet before sending more. This is required: `matrix.show()` disables interrupts (~2 ms for 64 LEDs) and incoming serial bytes would be dropped otherwise. Don't remove this handshake.
- Firmware reads pixels 3 bytes at a time into `setPixelColor` rather than keeping a second frame buffer, to stay within Uno RAM.

## Python design
- `LedMatrix(port=None, width=8, height=8, baud=500000, brightness=30, column_major=True, serpentine=True, flip_x=False, flip_y=False)`
- Port auto-detected via `serial.tools.list_ports` keyword match (arduino, ch340, usb serial, etc.); pass `port="COM3"` style if ambiguous.
- Drawing methods (`set_pixel`, `fill`, `clear`) only modify a local `bytearray`; `show()` sends the full frame and remembers it; `show_fade(duration=0.5, fps=30)` fades from what's on the LEDs to the buffer. `draw(frame)` takes `frame[y][x] = (r, g, b)`, nested lists or numpy `(H, W, 3)`, and calls `show()`.
- (x, y) to strip index mapping lives in Python (`_index`), handling column/row-major order, serpentine wiring and flips. (0, 0) is top-left.
- Out-of-range `set_pixel` calls are silently ignored (convenient for animations). Color values are clamped to 0-255.
- Throughput: a frame is 193 bytes (~4 ms at 500000 baud) plus ~2 ms for `show()`, so frames go out far faster than the eye needs. Animations must pace themselves with `time.sleep` (the demo and `scroll_text` do); otherwise they fly by.
- Feature code goes in its own module (like `text.py`) that takes a `LedMatrix`; keep `led_matrix.py` as the driver.
- A missed ack prints a warning and resyncs instead of raising, so animation loops keep going.
- Context manager: `close()` blanks the matrix and closes the port.

## Environment (Windows, PowerShell)
- Project folder: `C:\Users\luc24\MyDownloads\Poco\led_matrix`, the `led_matrix/` subfolder of the shared Poco repo (github.com/JeanelleL/Poco). Run scripts from inside this folder and keep plain imports (`from led_matrix import ...`), never `from Poco.led_matrix import ...`.
- `pip` is not on PATH. Python is uv-managed, so global installs are blocked (externally-managed-environment). Use a project venv via uv:
  ```
  uv venv
  uv pip install pyserial
  uv run led_matrix.py
  ```
- Add new dependencies with `uv pip install <pkg>`, never `pip install` or `--break-system-packages`.
- The Arduino IDE Serial Monitor must be closed while Python holds the port.
- Don't create a file named `serial.py` (shadows pyserial).
- Dependencies: pyserial only (tkinter ships with Python). Pillow and numpy are still installed in the venv from the removed emoji converter; project code doesn't use them.
- When Python output is piped (not a real console) it uses cp1252, so printing non-ASCII text (like emoji) crashes; avoid it or call `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`.

## Status / next steps
1. Done: sketch uploaded, demo connects and runs.
2. Done: matrix is 8x8, sketch re-uploaded with NUM_LEDS 64, orientation confirmed.
3. Done: board is an Arduino Uno R3.
4. Done: scrolling text works on hardware; readable, good speed. Some letters touch the top row; the user is fine with that.
5. Done: modes work on hardware; music and bedtime approved by the user.
6. Done: six emotion presets, `solid.py` (the user likes the color picker). Angry and surprised approved as-is.
7. Revised happy, sad, scared and neutral faces and the radiating sun; checked offline only. Confirm on hardware.
8. Done: count, breathe and quiet modes work on hardware; the user is happy with count and quiet. Breathe sped up to 7 s per breath; confirm the new pace.
9. Added excited, tired and worried from the user's designs, and silly from the user's description; checked offline only. Confirm on hardware, including that the tongue reading of silly is what the user meant.
10. Next features: not decided yet.

## Working preferences
- Give one clear recommendation rather than a list of options.
- No em dashes in written output.

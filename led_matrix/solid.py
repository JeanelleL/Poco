"""
Fill the whole matrix with one solid color: any color you like.

A color can be:
    a preset name       happy, sad, ... (the emotion colors), red, orange, teal, ...
    a hex code          FF8800  (or #FF8800)
    red, green, blue    255,128,0  (or 255 128 0), each 0-255

Usage:
    from led_matrix import LedMatrix
    from solid import show_solid
    with LedMatrix() as m:
        show_solid(m, "teal")
        show_solid(m, "#FF8800")
        show_solid(m, (255, 128, 0))

From the command line:
    uv run solid.py                 # list the preset colors
    uv run solid.py teal            # show a preset
    uv run solid.py FF8800          # show a hex color (in PowerShell, leave off the #:
                                    # it starts a comment there)
    uv run solid.py 255 128 0       # show a red, green, blue color
    uv run solid.py pick            # choose colors with the Windows color picker

Colors fade in over half a second, like everything else.
"""

import re
import sys
import time

import emotions

# Preset colors (raw LED values). The emotion colors come first and always match
# emotions.py; the rest are general-purpose extras.
PRESETS = {name: e["color"] for name, e in emotions.EMOTIONS.items()}
PRESETS.update({
    "red": (255, 0, 0),
    "orange": (255, 60, 0),
    "yellow": (255, 160, 0),
    "green": (0, 200, 0),
    "teal": (0, 160, 120),
    "blue": (0, 60, 255),
    "purple": (140, 0, 255),
    "pink": (255, 0, 120),
    "white": (150, 150, 150),
    "warm white": (200, 120, 40),
})


def parse_color(color):
    """Turn a preset name, hex code, "r,g,b" text, or (r, g, b) tuple into an (r, g, b) tuple."""
    if not isinstance(color, str):
        r, g, b = (int(v) for v in color)
    else:
        text = color.strip().lower()
        if text in PRESETS:
            return PRESETS[text]
        hex_match = re.fullmatch(r"#?([0-9a-f]{6})", text)
        parts = re.split(r"[,\s]+", text)
        if hex_match:
            v = hex_match.group(1)
            r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
        elif len(parts) == 3 and all(p.isdigit() for p in parts):
            r, g, b = (int(p) for p in parts)
        else:
            raise ValueError(
                f"Don't know the color {color!r}. Use a preset ({', '.join(PRESETS)}), "
                "a hex code like FF8800, or red,green,blue numbers like 255,128,0."
            )
    if not all(0 <= v <= 255 for v in (r, g, b)):
        raise ValueError(f"Color values must be 0-255, got {(r, g, b)}")
    return (r, g, b)


def show_solid(m, color, fade=0.5):
    """Fill the whole matrix with one color. fade = seconds (0 = instant)."""
    m.fill(parse_color(color))
    m.show_fade(fade) if fade else m.show()


def pick_color(initial=(255, 128, 0)):
    """Open the Windows color picker. Returns (r, g, b), or None if cancelled."""
    import tkinter
    from tkinter import colorchooser

    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)      # make the picker appear in front
    rgb, _ = colorchooser.askcolor(color="#%02x%02x%02x" % tuple(initial),
                                   title="Pick a color for the LED matrix", parent=root)
    root.destroy()
    return tuple(int(v) for v in rgb) if rgb else None


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print("Presets:", ", ".join(PRESETS))
        print("Usage: uv run solid.py <preset | RRGGBB | R G B | pick>")
        sys.exit()

    picking = args[0].lower() == "pick"
    if not picking:
        try:
            color = parse_color(" ".join(args))    # check before connecting
        except ValueError as err:
            sys.exit(str(err))

    from led_matrix import LedMatrix

    with LedMatrix() as m:
        if picking:
            print("Pick a color and press OK to show it. Press Cancel when you're done.")
            color = (255, 128, 0)
            while True:
                chosen = pick_color(color)
                if chosen is None:
                    break
                color = chosen
                show_solid(m, color)
                print(f"  showing {color[0]},{color[1]},{color[2]}  (#%02X%02X%02X)" % color)
        else:
            show_solid(m, color)
            print(f"Showing {color[0]},{color[1]},{color[2]}. Press Ctrl+C to stop.")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass

"""
The preset emotions: a color and a face for each.

    happy, sad, angry, scared, surprised, neutral, excited, tired, worried, silly

Usage:
    from led_matrix import LedMatrix
    from emotions import show_color, show_face
    with LedMatrix() as m:
        show_color(m, "happy")   # whole matrix turns the emotion's color
        show_face(m, "sad")      # the emotion's face in its color

From the command line:
    uv run emotions.py              # cycle through every emotion
    uv run emotions.py happy        # show the happy face
    uv run emotions.py happy color  # show the happy color

Changes fade in over half a second instead of switching instantly,
to avoid sudden flashes of light.
"""

import sys
import time

# To change a color or redraw a face, edit this table.
# Faces are 8 rows of 8: X = lit in the emotion's color, . = off.
# There's no head outline, so the eyes and mouth can be big, and features are
# kept at least one dark pixel apart so they stay separate behind fabric.
EMOTIONS = {
    "happy": {
        "color": (255, 160, 0),     # yellow
        "face": [                   # big open grin with raised corners
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "X......X",
            "XXXXXXXX",
            ".XXXXXX.",
            "..XXXX..",
            "........",
        ],
    },
    "sad": {
        "color": (0, 60, 255),      # blue
        "face": [                   # frown
            "........",
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "..XXXX..",
            ".X....X.",
            "X......X",
            "........",
        ],
    },
    "angry": {
        "color": (255, 0, 0),       # red
        "face": [                   # eyes slanted down toward the middle, frown
            "........",
            "XX....XX",
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "..XXXX..",
            ".X....X.",
            "........",
        ],
    },
    "scared": {
        "color": (140, 0, 255),     # purple
        "face": [                   # worried brows (slanting up toward the middle), wide eyes, open mouth
            "..X..X..",
            ".X....X.",
            "........",
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "..XXXX..",
            "..XXXX..",
        ],
    },
    "surprised": {
        "color": (255, 0, 120),     # pink
        "face": [                   # round "O" mouth
            "........",
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "...XX...",
            "..X..X..",
            "..X..X..",
            "...XX...",
        ],
    },
    "neutral": {
        "color": (150, 150, 140),   # soft white
        "face": [                   # straight mouth, ends tipped up a little
            "........",
            ".XX..XX.",
            ".XX..XX.",
            "........",
            "X......X",
            ".XXXXXX.",
            "........",
            "........",
        ],
    },
    # The next three were supplied by the user as 7x7 designs. They're copied exactly,
    # in the top-left 7x7 (right column and bottom row left dark). Colors are the
    # pictures' colors converted for LEDs so they keep the same hue.
    "excited": {
        "color": (255, 77, 6),      # orange
        "face": [
            ".X...X..",
            "X.X.X.X.",
            "........",
            "XXXXXXX.",
            "X.....X.",
            ".X...X..",
            "..XXX...",
            "........",
        ],
    },
    "tired": {
        "color": (103, 140, 170),   # muted grey-blue, a bit dimmer
        "face": [
            "........",
            "........",
            "XXX.XXX.",
            ".X...X..",
            "........",
            "..XXX...",
            "........",
            "........",
        ],
    },
    "worried": {
        "color": (93, 48, 255),     # blue-violet
        "face": [
            ".X...X..",
            "X.....X.",
            "........",
            ".X...X..",
            "........",
            ".XXXXX..",
            "X.....X.",
            "........",
        ],
    },
    "silly": {
        # Designed by the user: an open eye, a wink, and a tongue sticking out.
        "color": (255, 60, 170),    # bubblegum pink (a different pink from surprised)
        "face": [
            "........",
            ".X......",
            ".X...XXX",
            "........",
            "........",
            "XXXXXXXX",
            "....XX..",
            "....XX..",
        ],
    },
}

def _lookup(name):
    try:
        return EMOTIONS[name.strip().lower()]
    except KeyError:
        raise ValueError(f"Unknown emotion {name!r}. Choose from: {', '.join(EMOTIONS)}") from None


def show_color(m, name, fade=0.5):
    """Fill the whole matrix with the emotion's color. fade = seconds (0 = instant)."""
    m.fill(_lookup(name)["color"])
    m.show_fade(fade) if fade else m.show()


def draw_face(m, name, color=None):
    """Draw the emotion's face into the buffer without showing it. color overrides the emotion's color."""
    emotion = _lookup(name)
    color = color or emotion["color"]
    m.clear()
    for y, row in enumerate(emotion["face"]):
        for x, cell in enumerate(row):
            if cell == "X":
                m.set_pixel(x, y, color)


def show_face(m, name, color=None, fade=0.5):
    """Show the emotion's face. fade = seconds (0 = instant)."""
    draw_face(m, name, color)
    m.show_fade(fade) if fade else m.show()


if __name__ == "__main__":
    args = [a.lower() for a in sys.argv[1:]]
    if args and args[0] not in EMOTIONS:     # fail before connecting if the name is wrong
        sys.exit(f"Unknown emotion {args[0]!r}. Choose from: {', '.join(EMOTIONS)}")

    from led_matrix import LedMatrix

    with LedMatrix() as m:
        if args:
            name = args[0]
            if "color" in args[1:]:
                show_color(m, name)
            else:
                show_face(m, name)
            print(f"Showing {name}. Press Ctrl+C to stop.")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
        else:
            print("Cycling through emotions. Press Ctrl+C to stop.")
            try:
                while True:
                    for name in EMOTIONS:
                        print(f"  {name}")
                        show_color(m, name)
                        time.sleep(2)
                        show_face(m, name)
                        time.sleep(3)
            except KeyboardInterrupt:
                pass

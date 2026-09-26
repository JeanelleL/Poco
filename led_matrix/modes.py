"""
Special display modes, each a hand-drawn icon with a gentle animation:

    music    - two beamed music notes that gently bob up and down
    bedtime  - a dim crescent moon with a "Z" that glows in and out like slow breathing
    sun      - a sun with rings of light radiating outward along its rays
    dance    - a rainbow whose colors flow through the arcs (for dance breaks)
    count    - calm-down counting: big numbers 1 to 5, one every 2 seconds, then again
    breathe  - breathing exercise: a glowing blue orb grows (breathe in) and shrinks
               (breathe out)
    quiet    - quiet time: a still purple-blue "do not disturb" moon

Animations blend smoothly between frames (no flashing), to stay sensory-friendly.
Counting and breathing speeds are set just below the MODES table.

Usage:
    from led_matrix import LedMatrix
    from modes import run_mode, show_icon
    with LedMatrix() as m:
        show_icon(m, "sun")                  # still icon
        run_mode(m, "dance", duration=30)    # animate for 30 seconds

From the command line:
    uv run modes.py                  # list the modes
    uv run modes.py dance            # animate until Ctrl+C
    uv run modes.py bedtime still    # still icon, no animation
"""

import colorsys
import math
import sys
import time

# Icons: 8 rows of 8. "." is off; letters are colors from the icon's palette.
# Colors are raw LED values, like the emotion colors.
MODES = {
    "music": {
        "palette": {"N": (120, 40, 255)},    # violet notes
        "icon": [
            "..NNNNNN",
            "..N....N",
            "..N....N",
            "..N....N",
            ".NN...NN",
            "NNN..NNN",
            "NN...NN.",
            "........",
        ],
    },
    "bedtime": {
        # Dimmer than the other modes on purpose: it's for winding down.
        # Crescent moon cradling a big Z: "sleep" at a glance.
        "palette": {"M": (150, 110, 30), "Z": (60, 80, 190)},   # soft moon, calm blue Z
        "icon": [
            "....ZZZZ",
            ".M.....Z",
            "MM....Z.",
            "MM...Z..",
            "MM..ZZZZ",
            "MMM.....",
            "MMMMMM..",
            ".MMMM...",
        ],
    },
    "sun": {
        # Small round center (bright 2x2 core D, softer edge d) and orange rays R in
        # 8 directions, with a dark gap so it still reads as a sun behind fabric.
        "palette": {"D": (255, 150, 0), "d": (220, 110, 0), "R": (255, 70, 0)},
        "icon": [
            "R..RR..R",
            ".R....R.",
            "...dd...",
            "R.dDDd.R",
            "R.dDDd.R",
            "...dd...",
            ".R....R.",
            "R..RR..R",
        ],
    },
    "dance": {
        # Digits are rainbow bands, outermost 0 (red) to innermost 5 (violet).
        "palette": {"0": (255, 0, 0), "1": (255, 50, 0), "2": (255, 150, 0),
                    "3": (0, 200, 0), "4": (0, 60, 255), "5": (140, 0, 255)},
        "icon": [
            ".000000.",
            "01111110",
            "12222221",
            "22333322",
            "23444432",
            "34555543",
            "345..543",
            "45....54",
        ],
    },
    "count": {
        # Still icon is the "1"; the animation uses COUNT_DIGITS below.
        "palette": {"X": (0, 170, 120)},     # calm soft teal
        "icon": None,
    },
    "breathe": {
        # The orb is computed (see _orb), so there's no fixed icon.
        "palette": {"center": (60, 150, 255), "edge": (0, 40, 255)},
        "icon": None,
    },
    "quiet": {
        # Big crescent moon, like the phone "do not disturb" symbol. No animation.
        "palette": {"Q": (70, 40, 210)},     # purple-blue
        "icon": [
            "..QQ....",
            ".QQ.....",
            "QQQ.....",
            "QQQ.....",
            "QQQ.....",
            "QQQQ...Q",
            ".QQQQQQ.",
            "..QQQQ..",
        ],
    },
}

# Counting: seconds each number is shown, its fade in/out, and extra time on the 5.
COUNT_STEP = 2.0
COUNT_FADE = 0.35
COUNT_REST = 2.0
# Big numbers with two-pixel strokes, so they stay readable behind fabric.
COUNT_DIGITS = [
    ["...XX...", "..XXX...", "...XX...", "...XX...", "...XX...", "...XX...", "...XX...", "..XXXX.."],
    ["..XXXX..", ".XX..XX.", ".....XX.", "....XX..", "...XX...", "..XX....", ".XX.....", ".XXXXXX."],
    ["..XXXX..", ".XX..XX.", ".....XX.", "...XXX..", ".....XX.", ".....XX.", ".XX..XX.", "..XXXX.."],
    ["....XX..", "...XXX..", "..XXXX..", ".XX.XX..", ".XXXXXX.", "....XX..", "....XX..", "....XX.."],
    [".XXXXXX.", ".XX.....", ".XX.....", ".XXXXX..", ".....XX.", ".....XX.", ".XX..XX.", "..XXXX.."],
]

# Breathing, in seconds: breathe in (orb grows), hold, breathe out (orb shrinks), rest.
BREATHE_IN = 3.0
BREATHE_HOLD = 0.5
BREATHE_OUT = 3.0
BREATHE_REST = 0.5

FPS = 30


def _lookup(name):
    try:
        return MODES[name.lower()]
    except KeyError:
        raise ValueError(f"Unknown mode {name!r}. Choose from: {', '.join(MODES)}") from None


def _scale(color, k):
    return tuple(c * k for c in color)


def _blend(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _wave(t, period, phase=0.0):
    """Smooth 0..1..0 wave with the given period in seconds."""
    return 0.5 - 0.5 * math.cos(2 * math.pi * (t / period + phase))


def _ease(k):
    """Smooth start and finish for a 0..1 progress value."""
    k = min(max(k, 0.0), 1.0)
    return k * k * (3 - 2 * k)


def _breath(t):
    """How full the breath is at time t: 0 = empty (small orb), 1 = full (big orb)."""
    p = t % (BREATHE_IN + BREATHE_HOLD + BREATHE_OUT + BREATHE_REST)
    if p < BREATHE_IN:
        return _ease(p / BREATHE_IN)
    p -= BREATHE_IN
    if p < BREATHE_HOLD:
        return 1.0
    p -= BREATHE_HOLD
    if p < BREATHE_OUT:
        return 1 - _ease(p / BREATHE_OUT)
    return 0.0


def _orb(fullness, palette):
    """A glowing orb, brighter in the middle, with a soft edge so it grows smoothly
    instead of jumping a pixel at a time. fullness 0..1 sets its size."""
    radius = 1.2 + 3.1 * fullness
    glow = 0.45 + 0.55 * fullness          # a little brighter when full
    out = []
    for y in range(8):
        line = []
        for x in range(8):
            dist = math.hypot(x + 0.5 - 4, y + 0.5 - 4)
            cover = min(max(radius - dist + 0.5, 0.0), 1.0)
            color = _blend(palette["center"], palette["edge"], min(dist / radius, 1.0))
            line.append(_scale(color, cover * glow))
        out.append(line)
    return out


def frame(name, t=None):
    """The mode's picture at time t seconds, as 8 rows of 8 (r, g, b).
    t=None gives the still icon."""
    mode = _lookup(name)
    palette = mode["palette"]
    off = (0, 0, 0)

    if name == "breathe":
        return _orb(0.75 if t is None else _breath(t), palette)

    if name == "count":
        if t is None:
            index, k = 0, 1.0
        else:
            # Each number fades in, holds, and fades out; the 5 stays a little longer.
            p = t % (len(COUNT_DIGITS) * COUNT_STEP + COUNT_REST)
            index = min(int(p // COUNT_STEP), len(COUNT_DIGITS) - 1)
            local = p - index * COUNT_STEP
            length = COUNT_STEP + (COUNT_REST if index == len(COUNT_DIGITS) - 1 else 0)
            k = _ease(min(local, length - local) / COUNT_FADE)
        lit = _scale(palette["X"], k)
        return [[lit if c == "X" else off for c in row] for row in COUNT_DIGITS[index]]

    icon = mode["icon"]
    still = [[palette[c] if c != "." else off for c in row] for row in icon]
    if t is None:
        return still

    if name == "music":
        # Bob down one pixel and back, blending between the two positions.
        k = _wave(t, 1.6)
        down = [[off] * 8] + still[:-1]
        return [[_blend(still[y][x], down[y][x], k) for x in range(8)] for y in range(8)]

    if name == "bedtime":
        # The Z glows in and fades out like one slow sleepy breath every 4 seconds.
        k = 0.15 + 0.85 * _wave(t, 4.0)
        return [[_scale(palette["Z"], k) if c == "Z" else still[y][x] for x, c in enumerate(row)]
                for y, row in enumerate(icon)]

    if name == "sun":
        # A ring of light travels outward from the center: the center's edge glows,
        # then the inner ray pixels, then the ray tips. A new ring every 1.6 seconds.
        out = []
        for y, row in enumerate(icon):
            line = []
            for x, c in enumerate(row):
                if c in "dR":
                    dist = math.hypot(x + 0.5 - 4, y + 0.5 - 4)     # from the center
                    k = _wave(t, 1.6, -dist / 4.0) ** 2               # crest moves outward
                    low = 0.55 if c == "d" else 0.12                   # the center never goes dark
                    line.append(_scale(palette[c], low + (1 - low) * k))
                else:
                    line.append(still[y][x])
            out.append(line)
        return out

    if name == "dance":
        # Hues flow outward through the bands; one full cycle every 4 seconds.
        out = []
        for row in icon:
            line = []
            for c in row:
                if c == ".":
                    line.append(off)
                else:
                    hue = (int(c) / 6 - t / 4) % 1.0
                    line.append(tuple(v * 255 for v in colorsys.hsv_to_rgb(hue, 1.0, 1.0)))
            out.append(line)
        return out

    return still


def draw_icon(m, name, t=None):
    """Draw the mode's picture into the buffer without showing it."""
    for y, row in enumerate(frame(name, t)):
        for x, color in enumerate(row):
            m.set_pixel(x, y, color)


def show_icon(m, name, fade=0.5):
    """Show the mode's still icon. fade = seconds (0 = instant)."""
    draw_icon(m, name)
    m.show_fade(fade) if fade else m.show()


def run_mode(m, name, duration=None):
    """Animate a mode. Runs for duration seconds, or until Ctrl+C if duration is None."""
    _lookup(name)
    draw_icon(m, name, 0.0)
    m.show_fade(0.5)
    start = time.perf_counter()
    next_frame = start
    while duration is None or time.perf_counter() - start < duration:
        draw_icon(m, name, time.perf_counter() - start)
        m.show()
        next_frame += 1 / FPS
        delay = next_frame - time.perf_counter()
        if delay > 0:
            time.sleep(delay)


if __name__ == "__main__":
    args = [a.lower() for a in sys.argv[1:]]
    if not args:
        print("Modes:", ", ".join(MODES))
        print("Usage: uv run modes.py <mode> [still]")
        sys.exit()
    name = args[0]
    if name not in MODES:               # fail before connecting if the name is wrong
        sys.exit(f"Unknown mode {name!r}. Choose from: {', '.join(MODES)}")

    from led_matrix import LedMatrix

    with LedMatrix() as m:
        print(f"{name} mode. Press Ctrl+C to stop.")
        try:
            if "still" in args[1:]:
                show_icon(m, name)
                while True:
                    time.sleep(1)
            else:
                run_mode(m, name)
        except KeyboardInterrupt:
            pass

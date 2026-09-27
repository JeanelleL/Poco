"""Translates Poco's perception into the shapes the iPad app expects.

The app talks to Poco through one interface, `src/poco/pocoClient.ts`, and this
server is the other end of it. Everything here is a port of that file rather
than a design of its own - the id strings travel unchanged from the camera to
the belly LEDs, so when the two disagree the TypeScript wins.

Direction: the camera and microphone face the FRIEND, and everything Poco does
comes out at the CHILD. `PocoEvent.feeling` is the friend's expression, `said`
is what Poco told the child, and `why` is the reason shown in the teacher's log.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field

# --- ported from src/poco/pocoClient.ts -------------------------------------

# Every movement the servos can actually perform, with how long it takes at
# normal speed. These are the gestures in servos/gestures.py; a name that is not
# here is a dead moment in the middle of a conversation.
POCO_MOVES: dict[str, int] = {
    # Feelings
    "happy": 4600, "sad": 8800, "surprised": 2800, "worried": 6500,
    "calm": 9500, "tired": 7800, "shy": 6300, "frustrated": 5100,
    # Moments
    "hello": 6200, "goodbye": 4800, "happy_dance": 8600, "good_job": 3400,
    "breathe": 36000,
    # Basics
    "yes": 2200, "no": 2900, "curious": 3700, "look_around": 5400,
    "listen": 5900, "look_there": 6000, "wave_right": 4400, "wave_left": 4400,
    "flap": 3300, "sway": 8900,
}

# Which movement goes with a feeling the camera read. From EMOTIONS in
# emotions.ts: angry and neutral have no movement of their own yet.
FEELING_MOVE = {
    "happy": "happy",
    "sad": "sad",
    "angry": "frustrated",
    "surprised": "surprised",
    "worried": "worried",
    "neutral": "calm",
}

# Every face the robot can draw by name, from led_matrix/emotions.py. This is
# what Poco can SHOW, which is a wider set than the six a camera can READ off
# someone else's face - he can look excited or tired without anybody having to
# look excited or tired at him first. The app also knows calm, silly, shy and
# frustrated, but the matrix has no face for those, so Poco cannot choose them.
BELLY_FACES = ["happy", "sad", "angry", "scared", "surprised", "neutral",
               "excited", "tired", "worried"]

# Screen colours from emotions.ts. The robot side undoes the gamma to get back
# to raw LED values, so these stay exactly as the app has them.
EMOTION_COLORS = {
    "happy": "#FFCE00",
    "sad": "#0084FF",
    "angry": "#FF0000",
    "surprised": "#FF00B5",
    "worried": "#A177FF",
    "neutral": "#9E9E96",
}
# The wider set, for faces Poco shows that the camera never reads. Values are
# led_matrix/emotions.py's raw LED colours converted for a screen.
EMOTION_COLORS.update({
    "scared": "#C400FF",
    "excited": "#FF942E",
    "tired": "#A9C2D4",
})
ORANGE = "#E8833A"  # Poco's default when the feeling is unknown

# Per-pixel colours, from DOT_COLORS in src/poco/patterns.ts. A pattern row is
# usually '#' and '.', but some pictures - the rainbow the Party Lights routine
# uses - spell out a colour per dot instead. Without these the robot treated
# every letter as unlit and showed an empty belly where the app showed a
# rainbow.
DOT_COLORS = {
    "r": "#FF3B30",
    "y": "#FFC800",
    "g": "#34C759",
    "b": "#2F80FF",
}

# The app's comfort speeds.
SPEED = {"Gentle": 1.6, "Normal": 1.0, "Lively": 0.7}

# Moves too long to drop into a live conversation. Only `breathe` qualifies, at
# 36 seconds: it is a regulation exercise the adult chooses to run, not a
# reaction to someone looking tense. The rest are expressive rather than
# blocking - `sad` takes 8.8s and `calm` 9.5s, which is slow but is the robot
# being sad at you, not the robot being unavailable.
SLOW_MOVES = {m for m, ms in POCO_MOVES.items() if ms >= 15000}


@dataclass
class PocoEvent:
    """Something Poco noticed and decided on their own (Social Mode).

    Mirrors the PocoEvent interface in pocoClient.ts, which the app shows in the
    teacher's log: what Poco noticed, what they did, and why.
    """

    feeling: str  # the friend's expression
    said: str | None = None  # what Poco told the child; None = stayed quiet
    why: str | None = None  # the reason, in plain words, for the log
    at: int = field(default_factory=lambda: int(time.time() * 1000))
    type: str = "noticed"

    def to_json(self) -> dict:
        d = asdict(self)
        # Both are optional in the TS interface; omit rather than send null.
        for key in ("said", "why"):
            if d[key] is None:
                del d[key]
        return d


def move_for(feeling: str) -> str:
    return FEELING_MOVE.get(feeling, "calm")


def belly_for(feeling: str, brightness: float = 1.0) -> dict:
    """A BellyFrame minus the pattern.

    The 8x8 faces live in the app's patterns.ts and in led_matrix/emotions.py.
    They are deliberately not copied a third time here: three hand-maintained
    sets of the same grids will drift until Poco shows a face the app never
    drew. The robot driver reads led_matrix/emotions.py directly.
    """
    return {
        "color": EMOTION_COLORS.get(feeling, ORANGE),
        "brightness": max(0.0, min(1.0, brightness)),
    }


def action_for(move: str, feeling: str, say: str | None = None,
               brightness: float = 1.0) -> dict:
    """A PocoAction: what the robot should do."""
    action: dict = {
        "move": move if move in POCO_MOVES else "calm",
        "belly": belly_for(feeling, brightness),
    }
    if say:
        action["say"] = say
    return action


def event_for(feeling: str, said: str | None = None,
              why: str | None = None) -> PocoEvent:
    return PocoEvent(feeling=feeling, said=said, why=why)


def move_seconds(move: str, speed: str = "Normal") -> float:
    """How long a move occupies the robot, so nothing is sent on top of it."""
    return POCO_MOVES.get(move, 0) / 1000 * SPEED.get(speed, 1.0)

"""Mix your own: the app's steps of simple commands, as servo motion.

A mix is `{"steps": [{head?, leftArm?, rightArm?, feet?, times?}, ...]}` (see
MoveMix in src/poco/pocoClient.ts). Every part named in a step moves at the same
time; a part left out holds still. Each play of a step takes STEP_S at normal
speed, and every command starts and ends at home, so steps chain without a
glide in between. Left and right are Poco's own, like servo_limits.py.

The named gestures in servos/gestures.py are sequences of poses, which cannot
say "head nods twice while the right arm waves three times". So a mix is built
here instead, as one curve per servo over the step: home + (target - home) *
shape(u), u running 0..1. The targets come from the recorded poses, so a mix
reaches the same places the calibrated gestures do.
"""

from __future__ import annotations

import math

# One play of a step, in seconds at normal speed. STEP_MS in pocoClient.ts.
STEP_S = 2.0
MAX_STEPS = 5
MAX_TIMES = 3


def bump(u: float) -> float:
    """0 -> 1 -> 0 once, easing at both ends."""
    return (1 - math.cos(2 * math.pi * u)) / 2


def pulses(n: int):
    """0 -> 1 -> 0, n times."""
    return lambda u: (1 - math.cos(2 * math.pi * n * u)) / 2


def either_way(n: int):
    """-1 .. 1, n times, starting and ending at 0: a nod or a head shake."""
    return lambda u: math.sin(2 * math.pi * n * u) * math.sin(math.pi * u)


# A command is a list of (servo, pose name, shape). Shape values in 0..1 head
# toward the pose; for an either_way shape, negative values head toward the
# second pose name instead (given as "a|b").
_HEAD = {
    "nod": [("head_pitch", "yes_b|yes_a", either_way(2))],
    "shake": [("head_turret", "no_a|no_b", either_way(2))],
    "tilt": [("head_roll", "tilt_left", bump)],
    "look_up": [("head_pitch", "look_up", bump)],
    "look_down": [("head_pitch", "look_down", bump)],
    "look_left": [("head_turret", "look_left", bump)],
    "look_right": [("head_turret", "look_right", bump)],
}

_FEET = {
    "lift_left": [("left_leg", "left_foot_up", bump), ("right_leg", "left_foot_up", bump)],
    "lift_right": [("left_leg", "right_foot_up", bump), ("right_leg", "right_foot_up", bump)],
    # Both feet up together, twice. There is no pose for it; "~up" is a nudge
    # toward the servo's up stop (see _target).
    "up_down": [("left_leg", "~up", pulses(2)), ("right_leg", "~up", pulses(2))],
    # One foot, then the other: sway's rock, once.
    "alternate": [("left_leg", "left_foot_up|right_foot_up", either_way(1)),
                  ("right_leg", "left_foot_up|right_foot_up", either_way(1))],
}


def _arm(side: str, cmd: str) -> list:
    """An arm command for side 'left' or 'right' (Poco's own)."""
    pitch, roll, elbow = f"{side}_arm_pitch", f"{side}_arm_roll", f"{side}_arm_elbow"
    wave, low = f"{side}_wave", f"{side}_wave_low"
    if cmd == "up":
        return [(pitch, wave, bump)]
    if cmd == "down":
        # Home already has the arms down against their stops, so down is a
        # small press further in rather than a real travel.
        return [(pitch, "~down", bump)]
    if cmd == "wave":
        # Raise as for a wave, and swing the elbow between the wave's top and
        # bottom three times while it is up.
        return [(pitch, wave, bump), (roll, wave, bump),
                (elbow, f"{wave}~{low}", lambda u: bump(u) * pulses(3)(u))]
    if cmd == "flap":
        return [(roll, "flap_out", pulses(4))]
    if cmd == "out":
        return [(roll, "flap_out", bump)]
    if cmd == "bend":
        return [(elbow, "~bend", bump)]
    return []


# How far a "~direction" nudge goes, in microseconds from home.
NUDGE_US = {"up": 300, "down": 150, "bend": 400}


def _target(servo: str, spec: str, poses: dict, pm) -> float | None:
    """Where a servo is heading for one end of a command, or None if unknown."""
    if spec.startswith("~"):
        try:
            direction = spec[1:]
            return pm.toward(servo, direction, NUDGE_US[direction])
        except (KeyError, TypeError):
            return None
    return poses.get(spec, {}).get(servo)


def step_curves(step: dict, poses: dict, pm) -> tuple[dict, list[str]]:
    """{servo: f(u) -> us} for one step, and the parts that could not be built.

    pm is servos/poco_motion, passed in so this module imports without the
    robot's code on the path.
    """
    home = poses.get("home", {})
    commands = []
    if step.get("head") in _HEAD:
        commands += _HEAD[step["head"]]
    for key, side in (("leftArm", "left"), ("rightArm", "right")):
        if step.get(key):
            commands += _arm(side, step[key])
    if step.get("feet") in _FEET:
        commands += _FEET[step["feet"]]

    curves, missing = {}, []
    for servo, spec, shape in commands:
        if servo not in home:
            missing.append(servo)
            continue
        rest = home[servo]
        if "~" in spec[1:]:
            # "a~b": oscillate between two poses, shape scaled by an envelope
            # that starts and ends at home.
            a, b = spec.split("~", 1)
            ta, tb = _target(servo, a, poses, pm), _target(servo, b, poses, pm)
            if ta is None or tb is None:
                missing.append(spec)
                continue
            curves[servo] = (lambda u, r=rest, ta=ta, tb=tb, s=shape:
                             r + bump(u) * (ta - r) + s(u) * (tb - ta))
        elif "|" in spec:
            a, b = spec.split("|", 1)
            ta, tb = _target(servo, a, poses, pm), _target(servo, b, poses, pm)
            if ta is None or tb is None:
                missing.append(spec)
                continue
            curves[servo] = (lambda u, r=rest, ta=ta, tb=tb, s=shape:
                             r + (s(u) * (ta - r) if s(u) >= 0 else -s(u) * (tb - r)))
        else:
            t = _target(servo, spec, poses, pm)
            if t is None:
                missing.append(spec)
                continue
            curves[servo] = lambda u, r=rest, t=t, s=shape: r + s(u) * (t - r)
    return curves, missing


def clean(mix) -> list[dict]:
    """The steps of a mix from the app, each repeated `times`, capped."""
    steps = (mix or {}).get("steps") if isinstance(mix, dict) else None
    if not isinstance(steps, list):
        return []
    out = []
    for s in steps[:MAX_STEPS]:
        if not isinstance(s, dict):
            continue
        times = s.get("times", 1)
        times = times if isinstance(times, int) and 1 <= times <= MAX_TIMES else 1
        out += [s] * times
    return out

"""Smooth multi-servo motion for Poco: poses, gestures, and the limits that
keep every move inside the measured hard stops.

A pose is a set of servo targets (raw pulse widths) saved by name in
poses.json. Poses are partial -- a pose only moves the servos it was saved
with -- so a head pose and an arm pose can be combined in one step.

Pose specs, as used in gestures.py:
    "look_left"                  a whole pose
    "rest:head"                  only the head servos of a pose
    "rest:head,legs"             several groups
    ["look_left", "right_arm_up"] several poses at once
"""

import ast
import json
import math
import time
from pathlib import Path

import servo_limits

POSES_FILE = Path(__file__).with_name("poses.json")
HOME_FILE = Path(__file__).with_name("servo_home.py")
MARGIN_US = 20            # never drive closer than this to a hard stop
FRAME_S = 0.01            # target update step (100 Hz; ~240 cmds/s over serial)
ENGAGE_STAGGER_S = 0.1    # gap between servos waking up, spares the supply
ARM_LOWER_MAX_S = 0.7     # arms coming down never take longer than this:
                          # lowered slowly under gravity they slip and catch
                          # in tiny steps (servo deadband) and look jerky

CHANNELS = {name: ch for ch, name in servo_limits.SERVOS.items()}

GROUPS = {
    "head": ["head_turret", "head_roll", "head_pitch"],
    "left_arm": ["left_arm_pitch", "left_arm_roll", "left_arm_elbow"],
    "right_arm": ["right_arm_pitch", "right_arm_roll", "right_arm_elbow"],
    "legs": ["right_leg", "left_leg"],
}
GROUPS["arms"] = GROUPS["left_arm"] + GROUPS["right_arm"]
GROUPS["all"] = list(CHANNELS)

# Which recorded stop each direction heads toward, found by live probes.
# Directions are from Poco's own point of view. Arm pitch "up" comes from
# the wave (raising the right arm moved it toward stop1). Arm roll "out" was
# inferred (homes sit on stop1, arms resting at the sides) and confirmed by
# the flap. Elbow "bend" was probed on the right arm with the arm raised;
# the left is its mirror.
DIRECTIONS = {
    "left_leg": {"up": "stop1", "down": "stop2"},
    "right_leg": {"up": "stop1", "down": "stop2"},
    "head_pitch": {"down": "stop1", "up": "stop2"},
    "head_turret": {"right": "stop1", "left": "stop2"},
    "head_roll": {"left": "stop1", "right": "stop2"},
    "right_arm_pitch": {"up": "stop1", "down": "stop2"},
    "left_arm_pitch": {"up": "stop1", "down": "stop2"},
    "right_arm_roll": {"in": "stop1", "out": "stop2"},
    "left_arm_roll": {"in": "stop1", "out": "stop2"},
    "right_arm_elbow": {"straight": "stop1", "bend": "stop2"},
    "left_arm_elbow": {"straight": "stop1", "bend": "stop2"},
}


def safe_range(name):
    lo, hi = servo_limits.pulse_range(CHANNELS[name])
    return lo + MARGIN_US, hi - MARGIN_US


def clamp(name, us):
    lo, hi = safe_range(name)
    return max(lo, min(hi, round(us)))


def expand(words):
    """Group and/or servo names -> list of servo names, order kept."""
    names = []
    for w in words:
        if w in GROUPS:
            names += GROUPS[w]
        elif w in CHANNELS:
            names.append(w)
        else:
            raise KeyError(f"unknown group or servo {w!r}. "
                           f"groups: {', '.join(GROUPS)}")
    return list(dict.fromkeys(names))


# --- poses ---------------------------------------------------------------

def read_homes():
    """{servo_name: us or None} from servo_home.py.

    Parsed as text rather than imported: set_home.py rewrites the file many
    times a second, faster than Python's import cache notices a change.
    """
    homes = {n: None for n in CHANNELS}
    if HOME_FILE.exists():
        for line in HOME_FILE.read_text().splitlines():
            var, eq, value = line.partition(" = ")
            name = var.removesuffix("_home")
            if eq and var.endswith("_home") and name in homes:
                homes[name] = ast.literal_eval(value)
    return homes


def home_pose():
    """{servo_name: us} for every servo with a home set."""
    return {n: us for n, us in read_homes().items() if us is not None}


def _recorded_poses():
    return json.loads(POSES_FILE.read_text()) if POSES_FILE.exists() else {}


def load_poses():
    """Recorded poses, plus "home" built from servo_home.py."""
    poses = _recorded_poses()
    home = home_pose()
    if home:
        poses["home"] = home
    return poses


RESERVED = {"wait", "swing", "slow", "home"}   # step keywords and the built-in pose


def save_pose(name, targets):
    if name in RESERVED:
        raise ValueError(f"{name!r} is reserved in gestures.py -- pick another name")
    poses = _recorded_poses()
    poses[name] = targets
    POSES_FILE.write_text(json.dumps(poses, indent=2) + "\n")


def resolve(spec, poses):
    """A pose spec (see module docstring) -> {servo_name: us}."""
    if isinstance(spec, (list, tuple)):
        merged = {}
        for s in spec:
            merged.update(resolve(s, poses))
        return merged
    pose_name, _, groups = spec.partition(":")
    if pose_name not in poses:
        raise KeyError(f"no pose named {pose_name!r} -- record it in pose_editor.py")
    pose = poses[pose_name]
    if not groups:
        return dict(pose)
    keep = set(expand(groups.split(",")))
    return {n: us for n, us in pose.items() if n in keep}


def mirror(pose):
    """Swap a pose to the other side: right_* <-> left_*.

    Poco's sides are mounted as mirror images, so a servo at 20% of its safe
    range on one side is at 80% on the other. Servos with no counterpart
    (the head) are kept as they are.
    """
    out = {}
    for n, us in pose.items():
        if n.startswith("right_"):
            other = "left_" + n[len("right_"):]
        elif n.startswith("left_"):
            other = "right_" + n[len("left_"):]
        else:
            out[n] = us
            continue
        lo, hi = safe_range(n)
        olo, ohi = safe_range(other)
        frac = (clamp(n, us) - lo) / (hi - lo)
        out[other] = round(ohi - frac * (ohi - olo))
    return out


def toward(name, direction, us):
    """Pulse for a servo moved us microseconds from home toward direction.

    Using a fixed distance rather than a fraction of the range keeps
    left/right moves the same size even when home is off-centre.
    """
    home = home_pose()[name]
    stop = servo_limits.LIMITS[CHANNELS[name]][DIRECTIONS[name][direction]]
    return clamp(name, home + us * (1 if stop > home else -1))


def missing_poses(steps, poses):
    """Pose names a gesture uses that have not been recorded yet."""
    missing = []
    for step in steps:
        if step[0] == "slow":
            step = step[1:]
        if step[0] == "wait":
            continue
        specs = step[1:3] if step[0] == "swing" else [step[0]]
        for s in [x for sp in specs
                  for x in (sp if isinstance(sp, (list, tuple)) else [sp])]:
            name = s.partition(":")[0]
            if name not in poses and name not in missing:
                missing.append(name)
    return missing


# --- motion --------------------------------------------------------------

def _lowering_arm(name, start, goal):
    """True if an arm servo is moving down (pitch) or in (roll)."""
    d = DIRECTIONS.get(name, {})
    key = d.get("down") or d.get("in")
    if "arm" not in name or key is None or start == goal:
        return False
    stop = servo_limits.LIMITS[CHANNELS[name]][key]
    return (goal - start) * (stop - start) > 0


def ease(t):
    """Smoothstep: gentle start and stop, kinder to gears and the supply."""
    return t * t * (3 - 2 * t)


class Poco:
    def __init__(self, link, speed=1.0, amount=1.0):
        """speed scales every duration (0.7 = 30% slower); amount scales how
        far each target sits from home (0.6 = smaller moves). Together they
        are "gentle mode"."""
        self.link = link
        self.speed = speed
        self.amount = amount
        self.home = home_pose()
        # None = not being driven. A servo can't report where it is, so the
        # first command to a limp servo is a jump, not an interpolated move.
        self.pos = {name: None for name in CHANNELS}

    def _scaled(self, targets):
        """Shrink each target's distance from home by self.amount."""
        if self.amount == 1.0:
            return targets
        return {n: (self.home[n] + (us - self.home[n]) * self.amount
                    if n in self.home else us)
                for n, us in targets.items()}

    def set(self, name, us):
        us = clamp(name, us)
        self.link.pulse(CHANNELS[name], us)
        self.pos[name] = us
        return us

    def _send(self, targets):
        """Set several servos in one serial round trip.

        One command per frame instead of one per servo is what keeps
        multi-servo gestures smooth: per-servo commands cost ~4 ms each, so
        six moving servos only got ~40 updates a second.
        """
        if not targets:
            return
        if hasattr(self.link, "pulses"):
            self.link.pulses({CHANNELS[n]: us for n, us in targets.items()})
            self.pos.update(targets)
        else:
            for n, us in targets.items():
                self.set(n, us)

    def _engage(self, targets):
        """Wake limp servos one at a time -- a jump, since their position is unknown."""
        for n, us in targets.items():
            if self.pos[n] is None:
                self.set(n, us)
                time.sleep(ENGAGE_STAGGER_S)

    def _animate(self, secs, frame):
        """Drive servos along frame(elapsed_secs) -> {name: us} for secs."""
        t0 = time.perf_counter()
        while True:
            frame_t0 = time.perf_counter()
            elapsed = min(secs, frame_t0 - t0)
            changed = {}
            for n, us in frame(elapsed).items():
                us = clamp(n, us)
                if us != self.pos[n]:
                    changed[n] = us
            self._send(changed)
            if elapsed >= secs:
                return
            time.sleep(max(0.0, FRAME_S - (time.perf_counter() - frame_t0)))

    def move(self, targets, secs, fast_lower=True):
        """Glide every servo in targets to its pulse width over secs.

        Arms that are lowering finish within ARM_LOWER_MAX_S even when the
        rest of the move is slower -- see ARM_LOWER_MAX_S. fast_lower=False
        turns that off for moves that must stay slow (breathing).
        """
        targets = {n: clamp(n, us) for n, us in self._scaled(targets).items()}
        secs /= self.speed
        self._engage(targets)
        start = {n: self.pos[n] for n in targets}
        dur = {n: min(secs, ARM_LOWER_MAX_S)
                  if fast_lower and _lowering_arm(n, start[n], g) else secs
               for n, g in targets.items()}

        def frame(e):
            return {n: start[n] + (g - start[n])
                       * (ease(min(1.0, e / dur[n])) if dur[n] > 0 else 1.0)
                    for n, g in targets.items()}
        self._animate(secs, frame)

    def swing(self, a, b, period, cycles, blend=0.0):
        """Oscillate smoothly a -> b -> a, cycles times, period secs each.

        One continuous cosine rather than a chain of separate moves, so the
        only slow-downs are the natural ones at each end of the swing. Only
        b's servos oscillate; the rest of a is held.

        blend > 0 fades in from wherever the servos are over the first blend
        secs while the swing is already running, so a raise flows straight
        into the swing with no stop. blend == 0 glides to a first.
        """
        a = {n: clamp(n, us) for n, us in self._scaled(a).items()}
        b = {n: clamp(n, us) for n, us in self._scaled(b).items()}
        period /= self.speed
        blend /= self.speed
        for n in b:
            a.setdefault(n, self.pos[n] if self.pos[n] is not None else b[n])
        self._engage(a)
        if blend <= 0 and any(self.pos[n] != us for n, us in a.items()):
            self.move(a, period / 2 * self.speed)   # move() re-applies speed
        start = {n: self.pos[n] for n in a}

        def frame(e):
            osc = (1 - math.cos(2 * math.pi * e / period)) / 2
            w = ease(min(1.0, e / blend)) if blend > 0 else 1.0
            out = {}
            for n, home in a.items():
                target = home + (b[n] - home) * osc if n in b else home
                out[n] = start[n] + (target - start[n]) * w
            return out
        self._animate(period * cycles, frame)

    def play(self, steps, poses=None, on_step=None):
        """Run a gesture -- see gestures.py for the step formats."""
        poses = load_poses() if poses is None else poses
        for i, step in enumerate(steps):
            if on_step:
                on_step(i, step[0])
            if step[0] == "swing":
                _, a, b, period, cycles, *blend = step
                self.swing(resolve(a, poses), resolve(b, poses), period, cycles,
                           *blend)
                continue
            fast_lower = True
            if step[0] == "slow":
                step, fast_lower = step[1:], False
            spec, secs, *hold = step
            if spec == "wait":
                time.sleep(secs / self.speed)
                continue
            self.move(resolve(spec, poses), secs, fast_lower)
            if hold:
                time.sleep(hold[0] / self.speed)

    def release(self, names=None):
        for n in names or list(CHANNELS):
            self.link.off(CHANNELS[n])
            self.pos[n] = None

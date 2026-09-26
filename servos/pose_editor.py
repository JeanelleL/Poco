"""Pose Poco by hand, save poses by name, and try gestures out live.

    python pose_editor.py
    python pose_editor.py --port COM6
    python pose_editor.py --servos right_arm      only these servos on Left/Right

Nothing moves on startup. A servo stays limp until you press Up/Down on it;
that first press puts it at its home (servo_home.py), or the middle of its
range if it has none. Loading a pose or playing a gesture wakes the servos it
uses, one at a time.

Keys:
    Left / Right  select servo
    Up / Down     move the selected servo (always kept inside its stops)
    + / -         bigger / smaller step
    s             save a pose (asks for a name and which servos to include)
    l             load a pose (glides there)
    g             play a gesture from gestures.py (re-read on every play)
    r             release the selected servo (limp)
    h             glide the selectable servos to home
    x             release every servo
    q / Esc       release everything and quit

When saving, list groups and/or servo names to include, e.g. "head" or
"right_arm head_pitch". Just Enter saves every servo currently being driven.
Groups: head, left_arm, right_arm, arms, legs, all.
"""

import argparse
import importlib
import msvcrt

import gestures
import poco_motion as pm
from servo_link import ServoLink, ServoError

STEPS = [1, 5, 10, 25, 50, 100]
LOAD_SECS = 0.8
ARROWS = {"H": "UP", "P": "DOWN", "K": "LEFT", "M": "RIGHT"}


def read_key():
    k = msvcrt.getwch()
    if k in ("\x00", "\xe0"):
        return ARROWS.get(msvcrt.getwch(), "")
    return k


def status(name, poco, step):
    us = poco.pos[name]
    lo, hi = pm.safe_range(name)
    driven = sum(v is not None for v in poco.pos.values())
    pos = f"{us:>4} us" if us is not None else "limp   "
    line = (f"ch {pm.CHANNELS[name]:>2} {name:<16} {pos}  "
            f"[{lo}-{hi}]  step {step:>3}  driven {driven}/{len(poco.pos)}")
    print(f"\r{line:<79}", end="", flush=True)


def ask(prompt):
    print()
    return input(f"  {prompt}").strip()


def save(poco):
    name = ask("pose name: ")
    if not name:
        print("  cancelled")
        return
    words = ask("servos (groups/names, Enter = all driven): ").split()
    try:
        chosen = pm.expand(words) if words else list(pm.CHANNELS)
    except KeyError as e:
        print(f"  {e}")
        return
    limp = [n for n in chosen if poco.pos[n] is None]
    targets = {n: poco.pos[n] for n in chosen if poco.pos[n] is not None}
    if words and limp:
        print(f"  skipped (limp, no position): {', '.join(limp)}")
    if not targets:
        print("  nothing to save -- no chosen servo is being driven")
        return
    existed = name in pm.load_poses()
    try:
        pm.save_pose(name, targets)
    except ValueError as e:
        print(f"  {e}")
        return
    print(f"  {'overwrote' if existed else 'saved'} {name!r}: "
          f"{len(targets)} servos -> {pm.POSES_FILE.name}")


def load(poco):
    poses = pm.load_poses()
    if not poses:
        print("\n  no poses saved yet")
        return
    print(f"\n  poses: {', '.join(poses)}")
    spec = ask("load: ")
    if not spec:
        return
    try:
        poco.move(pm.resolve(spec, poses), LOAD_SECS)
    except KeyError as e:
        print(f"  {e}")


def play(poco):
    importlib.reload(gestures)
    print(f"\n  gestures: {', '.join(gestures.GESTURES)}")
    name = ask("play: ")
    if not name:
        return
    if name not in gestures.GESTURES:
        print(f"  no gesture named {name!r}")
        return
    steps = gestures.GESTURES[name]
    missing = pm.missing_poses(steps, pm.load_poses())
    if missing:
        print(f"  can't play yet, record these poses first: {', '.join(missing)}")
        return
    poco.play(steps)
    print(f"  played {name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default=None)
    ap.add_argument("--servos", nargs="+", default=["all"],
                    help="groups/servo names to select between, e.g. right_arm")
    args = ap.parse_args()

    names = pm.expand(args.servos)
    idx = 0
    step_i = STEPS.index(10)

    with ServoLink(args.port) as link:
        poco = pm.Poco(link)
        print(f"connected on {link.port} -- nothing is being driven yet")
        print("Left/Right select  Up/Down move  +/- step  h home  s save  l load  "
              "g gesture  r/x release  q quit\n")
        try:
            while True:
                name = names[idx]
                status(name, poco, STEPS[step_i])
                key = read_key()

                if key in ("LEFT", "RIGHT"):
                    idx = (idx + (1 if key == "RIGHT" else -1)) % len(names)
                elif key in ("UP", "DOWN"):
                    if poco.pos[name] is None:
                        home = pm.read_homes()[name]
                        lo, hi = pm.safe_range(name)
                        poco.set(name, home if home is not None else (lo + hi) // 2)
                    else:
                        d = STEPS[step_i] if key == "UP" else -STEPS[step_i]
                        poco.set(name, poco.pos[name] + d)
                elif key in ("+", "="):
                    step_i = min(len(STEPS) - 1, step_i + 1)
                elif key in ("-", "_"):
                    step_i = max(0, step_i - 1)
                elif key == "s":
                    save(poco)
                elif key == "l":
                    load(poco)
                elif key == "g":
                    play(poco)
                elif key == "r":
                    poco.release([name])
                elif key == "h":
                    home = pm.home_pose()
                    poco.move({n: home[n] for n in names if n in home}, LOAD_SECS)
                elif key == "x":
                    poco.release()
                elif key in ("q", "\x1b", "\x03"):
                    break
        except ServoError as e:
            print(f"\n\nserial error: {e}")
            if "READY" in str(e):
                print("the Uno rebooted mid-command -- the servo supply sagged "
                      "(too many servos moving at once for the supply).")
        finally:
            try:
                poco.release()
            except ServoError:
                pass
            print("\n\nall servos released")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted")

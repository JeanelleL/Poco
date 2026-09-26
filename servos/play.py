"""Play Poco's gestures from gestures.py.

    python play.py --list               show gestures and any missing poses
    python play.py wave                 play one
    python play.py nod wave waddle      play several in a row
    python play.py wave --loop          repeat until ctrl-C
    python play.py wave --hold          stay powered at the end (default: go limp)
    python play.py wave --delay 5       count down first (time to start a video)
    python play.py --all --announce 3   every gesture, name shown 3 s before each
    python play.py wave --speed 0.7 --amount 0.6    gentle mode: slower, smaller

Servos that are limp when a gesture starts jump to their first position,
one at a time, before the smooth motion begins.
"""

import argparse
import time

import poco_motion as pm
from gestures import GESTURES
from servo_link import ServoLink, ServoError


def announce(name, i, total, secs):
    """Big, readable 'up next' banner, then a countdown."""
    label = name.replace("_", " ").upper()
    bar = "=" * (len(label) + 8)
    print(f"\n  {bar}\n      {label}\n  {bar}   ({i}/{total})", flush=True)
    for left in range(round(secs), 0, -1):
        print(f"      in {left}...", flush=True)
        time.sleep(1)
    print("      >> playing", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gestures", nargs="*")
    ap.add_argument("--port", default=None)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--all", action="store_true",
                    help="play every gesture in gestures.py, in order")
    ap.add_argument("--announce", type=float, default=0.0,
                    help="show each gesture's name this many seconds before it plays")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--hold", action="store_true",
                    help="keep servos powered when finished")
    ap.add_argument("--gap", type=float, default=0.5,
                    help="seconds between gestures")
    ap.add_argument("--speed", type=float, default=1.0,
                    help="scale gesture speed, e.g. 0.7 for gentle mode")
    ap.add_argument("--amount", type=float, default=1.0,
                    help="scale how far moves go from home, e.g. 0.6")
    ap.add_argument("--delay", type=float, default=0.0,
                    help="seconds to wait before starting (time to hit record)")
    args = ap.parse_args()

    poses = pm.load_poses()

    if args.all:
        args.gestures = [g for g in GESTURES if g != "home"]

    if args.list or not args.gestures:
        for name, steps in GESTURES.items():
            missing = pm.missing_poses(steps, poses)
            state = f"needs: {', '.join(missing)}" if missing else "ready"
            print(f"  {name:<12} {state}")
        return 0

    for name in args.gestures:
        if name not in GESTURES:
            print(f"no gesture named {name!r}. try --list")
            return 1
        missing = pm.missing_poses(GESTURES[name], poses)
        if missing:
            print(f"{name}: record these poses first: {', '.join(missing)}")
            return 1

    with ServoLink(args.port) as link:
        poco = pm.Poco(link, speed=args.speed, amount=args.amount)
        print(f"connected on {link.port}")
        for left in range(round(args.delay), 0, -1):
            print(f"  starting in {left}...", flush=True)
            time.sleep(1)
        try:
            while True:
                for i, name in enumerate(args.gestures, 1):
                    if args.announce:
                        announce(name, i, len(args.gestures), args.announce)
                    else:
                        print(f"  {name}")
                    poco.play(GESTURES[name], poses)
                    time.sleep(args.gap)
                if not args.loop:
                    break
        except KeyboardInterrupt:
            print("\nstopping")
        except ServoError as e:
            print(f"\nserial error: {e}")
            if "READY" in str(e):
                print("the Uno rebooted mid-gesture -- the servo supply sagged.")
            return 1
        finally:
            if not args.hold:
                try:
                    poco.release()
                    print("servos released")
                except ServoError:
                    pass
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ServoError as e:
        print(f"error: {e}")
        raise SystemExit(1)

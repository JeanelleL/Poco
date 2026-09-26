"""Set each servo's home position by hand, one servo at a time.

    python set_home.py              start at the first servo
    python set_home.py --ch 5       start at a specific channel

Nothing moves on startup; every servo stays limp until you press an arrow
on it. The first press puts it at its saved home, or the middle of its
range if it has none yet. After that, wherever you leave it IS its home:
every move is saved straight to servo_home.py as <servo name>_home.

Keys:
    Up / Down     move the servo (kept inside its hard stops)
    + / -         bigger / smaller step
    n / p         release this servo, go to the next / previous one
    r             release this servo (limp) without moving on
    q / Esc       release everything and quit
"""

import argparse
import msvcrt

import poco_motion as pm
import servo_limits
from servo_link import ServoLink, ServoError

STEPS = [1, 5, 10, 25, 50, 100]

HEADER = '''"""Home position of every servo, in pulse microseconds.

Written by set_home.py on every move -- edit by hand only when it is not
running. None means not set yet. The "home" pose in poco_motion is built
from these.
"""

'''


def save_homes(homes):
    lines = [f"{name}_home = {homes[name]}\n" for name in pm.CHANNELS]
    pm.HOME_FILE.write_text(HEADER + "".join(lines))


def read_key():
    k = msvcrt.getwch()
    if k in ("\x00", "\xe0"):
        return {"H": "UP", "P": "DOWN"}.get(msvcrt.getwch(), "")
    return k


def status(ch, name, pos, step, home):
    lo, hi = pm.safe_range(name)
    p = f"{pos:>4} us" if pos is not None else "limp   "
    h = home if home is not None else "-"
    line = (f"ch {ch:>2} {name:<16} pos {p}  [{lo}-{hi}]  "
            f"step {step:>3}  home {h:>4}")
    print(f"\r{line:<79}", end="", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default=None)
    ap.add_argument("--ch", type=int, default=None, help="channel to start on")
    args = ap.parse_args()

    channels = list(servo_limits.SERVOS)
    homes = pm.read_homes()
    idx = channels.index(args.ch) if args.ch is not None else 0
    step_i = STEPS.index(10)
    pos = None

    with ServoLink(args.port) as link:
        print(f"connected on {link.port} -- nothing is being driven yet")
        print("Up/Down move  +/- step  n/p next/prev  r release  q quit")
        print("wherever you leave a servo is saved as its home\n")

        def release(ch):
            try:
                link.off(ch)
            except ServoError as e:
                print(f"\n  release failed on ch {ch}: {e}")

        try:
            while True:
                ch = channels[idx]
                name = servo_limits.SERVOS[ch]
                status(ch, name, pos, STEPS[step_i], homes[name])
                key = read_key()

                if key in ("UP", "DOWN"):
                    if pos is None:
                        lo, hi = pm.safe_range(name)
                        pos = homes[name] if homes[name] is not None \
                            else (lo + hi) // 2
                    else:
                        pos += STEPS[step_i] if key == "UP" else -STEPS[step_i]
                    pos = pm.clamp(name, pos)
                    link.pulse(ch, pos)
                    homes[name] = pos
                    save_homes(homes)

                elif key in ("+", "="):
                    step_i = min(len(STEPS) - 1, step_i + 1)
                elif key in ("-", "_"):
                    step_i = max(0, step_i - 1)

                elif key in ("n", "p"):
                    release(ch)
                    if pos is not None:
                        print(f"\n  {name}_home = {pos} saved")
                    idx = (idx + (1 if key == "n" else -1)) % len(channels)
                    pos = None

                elif key == "r":
                    release(ch)
                    pos = None

                elif key in ("q", "\x1b", "\x03"):
                    break
        finally:
            for c in channels:
                release(c)
            print("\n\nall servos released. home positions:")
            for n in pm.CHANNELS:
                print(f"  {n}_home = {homes[n]}")
            print(f"saved in {pm.HOME_FILE.name}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted")

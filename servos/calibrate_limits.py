"""Find each servo's physical hard stops by hand, one servo at a time.

    python calibrate_limits.py              start at the first servo
    python calibrate_limits.py --ch 3       start at a specific channel
    python calibrate_limits.py --port COM6

Nothing moves on startup. Every channel stays limp until you press an arrow
key on it. A hobby servo has no position feedback, so that first press has
to pick a pulse to send: it goes to the midpoint of the stops already
recorded for that servo, or --start (1500 us, centre) if there are none.
Every press after that steps from there.

Keys:
    Up / Down     step the pulse width up / down
    + / -         bigger / smaller step size
    1             record current pulse as the FIRST hard stop
    2             record current pulse as the SECOND hard stop
    n             release this servo, go to the next one
    p             release this servo, go to the previous one
    r             release this servo (limp) without moving on
    q / Esc       release everything and quit

Recorded stops are written to servo_limits.py immediately, so a crash or
ctrl-C never loses them.

At a hard stop the servo stalls: it buzzes and draws stall current. Creep
up to the stop with a small step, record it the moment it touches, and back
off -- do not leave it pushing into the stop.
"""

import argparse
import msvcrt
import pprint
from pathlib import Path

import servo_limits
from servo_link import ServoLink, ServoError

LIMITS_FILE = Path(__file__).with_name("servo_limits.py")
PULSE_FLOOR, PULSE_CEIL = 400, 2600     # what the firmware will accept
STEPS = [1, 5, 10, 25, 50, 100]

# msvcrt returns arrow keys as a two-char sequence: a prefix, then a code.
ARROW_PREFIXES = ("\x00", "\xe0")
ARROW_UP, ARROW_DOWN = "H", "P"


def save_limits(limits):
    """Rewrite servo_limits.py with the current LIMITS, keeping the rest."""
    src = LIMITS_FILE.read_text()
    head, rest = src.split("LIMITS = {", 1)
    tail = rest.split("\n}\n", 1)[1]
    body = "".join(f"    {ch}: {pprint.pformat(lim, sort_dicts=False)},\n"
                   for ch, lim in limits.items())
    LIMITS_FILE.write_text(f"{head}LIMITS = {{\n{body}}}\n{tail}")


def read_key():
    """Block for one keypress; arrows come back as 'UP' / 'DOWN'."""
    k = msvcrt.getwch()
    if k in ARROW_PREFIXES:
        code = msvcrt.getwch()
        return {ARROW_UP: "UP", ARROW_DOWN: "DOWN"}.get(code, "")
    return k


def status(ch, name, us, step, lim):
    pos = f"{us:>4} us" if us is not None else "limp   "
    s1 = lim["stop1"] if lim["stop1"] is not None else "-"
    s2 = lim["stop2"] if lim["stop2"] is not None else "-"
    line = (f"ch {ch} {name:<16} pos {pos}  step {step:>3}  "
            f"stop1 {s1:>4}  stop2 {s2:>4}")
    print(f"\r{line:<79}", end="", flush=True)


def note(msg):
    print(f"\n  {msg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default=None)
    ap.add_argument("--ch", type=int, default=None, help="channel to start on")
    ap.add_argument("--start", type=int, default=1500,
                    help="first pulse for a servo with no recorded stops")
    args = ap.parse_args()

    channels = list(servo_limits.SERVOS)
    limits = {ch: dict(servo_limits.LIMITS[ch]) for ch in channels}
    idx = channels.index(args.ch) if args.ch is not None else 0
    step_i = STEPS.index(10)
    pos = None                  # None = this servo has not been driven yet

    with ServoLink(args.port) as link:
        print(f"connected on {link.port} -- nothing is being driven yet")
        for b in link.banner:
            print(f"  {b}")
        print("Up/Down move  +/- step  1/2 record stop  n/p next/prev  "
              "r release  q quit\n")

        def release(ch):
            try:
                link.off(ch)
            except ServoError as e:
                note(f"release failed on ch {ch}: {e}")

        try:
            while True:
                ch = channels[idx]
                name = servo_limits.SERVOS[ch]
                lim = limits[ch]
                status(ch, name, pos, STEPS[step_i], lim)
                key = read_key()

                if key in ("UP", "DOWN"):
                    if pos is None:
                        known = [v for v in lim.values() if v is not None]
                        pos = (sum(known) // len(known)) if len(known) == 2 \
                            else args.start
                    else:
                        delta = STEPS[step_i] if key == "UP" else -STEPS[step_i]
                        pos = max(PULSE_FLOOR, min(PULSE_CEIL, pos + delta))
                    link.pulse(ch, pos)

                elif key in ("+", "="):
                    step_i = min(len(STEPS) - 1, step_i + 1)
                elif key in ("-", "_"):
                    step_i = max(0, step_i - 1)

                elif key in ("1", "2"):
                    if pos is None:
                        note("servo is limp -- move it with the arrows first")
                        continue
                    lim[f"stop{key}"] = pos
                    save_limits(limits)
                    note(f"{name}: stop{key} = {pos} us, saved")

                elif key in ("n", "p"):
                    release(ch)
                    idx = (idx + (1 if key == "n" else -1)) % len(channels)
                    pos = None
                    nxt = channels[idx]
                    note(f"released {name}; now on ch {nxt} "
                         f"{servo_limits.SERVOS[nxt]} (limp until you press an arrow)")

                elif key == "r":
                    release(ch)
                    pos = None

                elif key in ("q", "\x1b", "\x03"):
                    break
        finally:
            for c in channels:
                release(c)
            print("\n\nall servos released. recorded limits:")
            for c in channels:
                l = limits[c]
                print(f"  ch {c} {servo_limits.SERVOS[c]:<16} "
                      f"stop1 {l['stop1']}  stop2 {l['stop2']}")
            print(f"saved in {LIMITS_FILE.name}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted")

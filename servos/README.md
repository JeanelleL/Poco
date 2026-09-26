# servos: Poco's motors and gestures

Python control of Poco's 11 servos through an Arduino Uno and a PCA9685
16-channel PWM shield. The Uno only follows serial commands; all motion
logic lives in Python, so the laptop server can import it directly.

| File | What it is |
| --- | --- |
| `servo_test/servo_test.ino` | Firmware. One-line serial commands in, PCA9685 pulses out. No motion on boot. |
| `servo_link.py` | `ServoLink`: blocking serial client. Every call waits for `OK` and raises `ServoError` otherwise. |
| `servo_limits.py` | Channel -> servo name map, plus each servo's measured hard stops (pulse µs). |
| `servo_home.py` | Each servo's home position, as `<servo>_home = <µs>`. |
| `poco_motion.py` | Motion engine: poses, smooth moves, swings, gentle mode, direction table. |
| `poses.json` | Named poses (partial: only the servos listed move). |
| `gestures.py` | Gestures: lists of steps built from poses. |
| `play.py` | Play gestures from the command line. |
| `calibrate_limits.py` | Keyboard tool: jog each servo to its hard stops and record them. |
| `set_home.py` | Keyboard tool: set each servo's home position. |
| `pose_editor.py` | Keyboard tool: pose Poco, save poses, try gestures live. |

The keyboard tools use `msvcrt`, so they run on Windows only.

## Servos

| Ch | Servo | Ch | Servo |
| --- | --- | --- | --- |
| 0 | left_leg | 6 | head_pitch |
| 1 | right_leg | 7 | left_arm_roll |
| 2 | head_turret | 8 | left_arm_elbow |
| 3 | right_arm_pitch | 9 | right_arm_roll |
| 4 | left_arm_pitch | 10 | right_arm_elbow |
| 5 | head_roll | | |

Left and right are from **Poco's** point of view. The two sides are mounted as
mirror images: a servo at 20% of its range on one side matches 80% on the
other (`poco_motion.mirror`). `poco_motion.DIRECTIONS` records which stop is
up/down, left/right, in/out and bend/straight for each servo.

## Setup

1. Python 3 with `pip install pyserial`.
2. Arduino library **Adafruit PWM Servo Driver** (plus Adafruit BusIO).
3. Flash `servo_test/servo_test.ino` to the Uno, e.g. with arduino-cli:

   ```
   arduino-cli compile --fqbn arduino:avr:uno servo_test
   arduino-cli upload -p COM6 --fqbn arduino:avr:uno servo_test
   ```

4. Servo power: 5–6 V into the shield's screw terminal from its own supply.
   The Uno's USB rail cannot power servos; a sagging supply resets the Uno.

Only one program can hold the COM port at a time. Close the Arduino Serial
Monitor and quit the other tools before running a script.

## Play gestures

```
python play.py --list                     every gesture, and any missing poses
python play.py happy                      play one (servos go limp afterwards)
python play.py yes wave_right --hold      several in a row, stay powered at home
python play.py calm --speed 0.7 --amount 0.6    gentle mode: slower, smaller
python play.py --all --announce 3 --delay 5     everything, names shown first
```

| Group | Gestures |
| --- | --- |
| Basics | `home`, `yes`, `no`, `curious`, `look_around`, `wave_right`, `wave_left`, `flap`, `sway`, `happy_dance`, `hello` |
| Emotions | `happy`, `sad`, `surprised`, `worried`, `calm`, `tired`, `shy`, `frustrated` |
| Social | `goodbye`, `listen`, `look_there`, `good_job` |
| Regulation | `breathe` (4 s in, 6 s out, 3 breaths) |

From code:

```python
from servo_link import ServoLink
import poco_motion as pm
from gestures import GESTURES

with ServoLink() as link:                 # autodetects the port
    poco = pm.Poco(link)                  # speed=, amount= for gentle mode
    poco.play(GESTURES["happy"])
    poco.release()                        # go limp
```

## Safety rules the engine enforces

- **Hard stops:** every target is clamped 20 µs inside the stops in
  `servo_limits.py`, so nothing strains against the frame.
- **No motion on connect:** servos stay limp until something moves them. A servo
  can't report its position, so the first command to a limp servo is a jump.
  Servos wake one at a time, 0.1 s apart, to spare the supply.
- **Arm lowering:** arms coming down finish within 0.7 s. Lowered slowly under
  gravity, they slip and catch in the servo deadband and look jerky. A `slow`
  step opts out (used by `breathe`).
- **Batched updates:** each animation frame sends one `m` command for every
  moving servo, about 120 frames/s for 6 servos.

## Writing gestures

Steps in `gestures.py`:

```
("pose", secs)                  glide to a pose
("pose", secs, hold)            ...then hold still
("home:head", secs)             only the head servos of a pose (groups: head,
                                left_arm, right_arm, arms, legs, all)
(["a", "b"], secs)              several poses at once
("swing", "a", "b", period, cycles[, blend])
                                continuous a -> b -> a oscillation; blend fades
                                in while already swinging, so there is no pause
("slow", "pose", secs[, hold])  a move that must stay slow
("wait", secs)                  hold still
```

Poses are easiest to make with `pm.toward(servo, direction, µs)` and
`pm.save_pose(name, {...})`, or by hand in `pose_editor.py`. `wait`, `swing`,
`slow` and `home` are reserved pose names.

Design rules for this project: every gesture starts and ends at home, one
gesture per emotion that never changes, and motion over held poses. Held
single-arm poses (your turn, high five) didn't read well on the robot and
were removed.

## Recalibrating

```
python calibrate_limits.py --ch 9    re-record a servo's stops (1 / 2 keys)
python set_home.py --ch 9            re-set its home
```

Both save as you go. If a servo is swapped or re-horned, redo its stops first,
then its home.

## Serial protocol

115200 baud, newline-terminated, one reply line per command. Lines starting
with `#` are informational. `READY` is sent once after boot.

| Command | Reply |
| --- | --- |
| `ping` | `OK pong` |
| `u <ch> <us>` | `OK u <ch> <us>` |
| `m <ch> <us> [<ch> <us> ...]` | `OK m <count>` (validated before anything moves) |
| `off <ch>` | `OK off <ch>` (limp) |
| `a <ch> <deg>`, `range <min> <max>`, `sweep <0\|1>`, `selftest` | legacy bring-up commands |

Pulses outside 400–2600 µs are rejected.

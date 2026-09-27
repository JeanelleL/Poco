# Poco

Handoff notes for whoever works on this next (human or agent). Read this whole
file before changing code.

> **This replaces the previous README.** That version described the laptop
> server as "not built yet" and had the data flow backwards. Both are fixed
> here. Sections 6, 7, 11 and 12 are this repo's own documentation, kept close
> to the original because they are accurate about the app's code.
>
> Everything now lives in this one repo: the app, the laptop server, and the
> servo and LED drivers.

## 1. What Poco is

**Poco** is a plush robot penguin that helps **autistic children learn to read,
name and regulate emotions**. His belly is an 8x8 NeoPixel matrix showing faces
and emotion colours; he has 11 servos and a speaker, and a camera and
microphone in his head.

**The direction matters, and it is the thing most easily got wrong:**

> Poco's camera and microphone point at **the friend** — the person the child is
> talking to. Everything Poco does comes out at **the child**.

Poco watches the other person's face, listens to what they say, works out how
they are feeling, and quietly tells the child what they might do about it — "You
could ask what part of chemistry is worrying him most." He is a coach for the
child, whispering about someone else. He never addresses the friend and never
narrates them aloud to the room.

This is why the project exists: reading the other person is the hard part, and
Poco does it alongside the child rather than at them.

```
 iPad (web app)                   This laptop                        Poco
 ┌──────────────────────┐  Wi-Fi  ┌───────────────────────────┐ USB  ┌─────────────┐
 │ Adult sets up and    │────────▶│ Python server             │─────▶│ Arduino Uno │
 │ controls Poco        │WebSocket│ camera, mic, emotion, LLM │serial│ motors, LEDs│
 └──────────────────────┘  :8765  │ voice, JSON → serial      │      └─────────────┘
                                  └───────────────────────────┘
                                        ▲            │
                                   the friend    the child
                                   (camera+mic)  (voice+LEDs)
```

- **`src/`** is the iPad app — the adult's remote control, for a teacher,
  therapist or parent, never the child directly. Landscape only. `ios/` wraps
  it as an installed app.
- **`server/`** is the laptop: perception, judgement and voice.
- **`servos/`** and **`led_matrix/`** drive the robot over USB.
- The **Arduino Uno** plugs into the laptop by USB and drives motors and LEDs.

## 2. Status

**Server** — the perception and response pipeline runs end to end:
camera → face → emotion, microphone → transcript, both fused on one timeline →
Claude → spoken reply in Poco's voice. Measured at 30 fps sustained with
everything running. **Not yet connected to the iPad or the Arduino** — sections
4 and 8.

**iPad app** — all 7 onboarding steps work; Teaching, Fun and Social tabs, the
8x8 feeling faces, real servo moves and mix-your-own steps.
`npm run build` passes. Verified in headless Edge at 1180x820, 1024x768 and
1366x1024. Not yet tested on a real iPad.

**Hardware** — `servos/` drives Poco's 11 servos through an Arduino, with
keyframed gestures and a pose editor; `led_matrix/` drives the 8x8 NeoPixel
belly. Both have firmware sketches and both are real, working Python. Not yet
driven by the server. The C270 webcam is away being mounted.

**Runs on macOS (Apple Silicon).** The camera path uses OpenCV's AVFoundation
backend; a move to Windows or a Pi means replacing that backend and redoing
device selection (section 9).

## 3. Setting it up

Poco is three things that have to find each other: the **robot** plugged into
the **laptop** by USB, and the **iPad** talking to the laptop over Wi-Fi.

### Once, on the laptop

Requires Python 3.12, [uv](https://docs.astral.sh/uv/) and Node 18+.

```sh
uv sync --project server     # python side
npm install && npm run build # the app the laptop will serve
```

Put the API keys in `server/.env` (gitignored, `chmod 600`):

```
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
BACKBOARD_API_KEY=...        # only needed with --memory
```

Models download on first use, about 160 MB.

### Every time

**1. Plug the robot in.** One USB cable from the Arduino to the laptop, and the
C270 webcam. Check both are seen:

```sh
ls /dev/cu.usbmodem*                       # the Arduino
cd server && uv run emotion_demo.py --list-cameras
```

The C270 takes camera index 0 when plugged in; without it index 0 is the
MacBook's own camera, so `poco/devices.py` needs checking after any change. The
servos need their own 5-6V supply on the shield's screw terminal - the Uno's USB
rail cannot drive eleven of them and will brown out.

**2. Put the laptop and the iPad on the same Wi-Fi.** Not just any two networks:
they must be able to reach each other. School and venue Wi-Fi usually blocks
device-to-device traffic, in which case use the laptop's hotspot and join the
iPad to that.

**3. Start the server.**

```sh
cd server && uv run run_server.py
```

It prints the address to open. Add `--memory` for Poco to remember people
between sessions, `--no-voice` to keep him silent, `--no-robot` to run without
hardware, `--gentle` for slower, smaller movements.

**4. Install the app on the iPad.** Open the address the server printed -
`http://<laptop-name>.local:8765` - in Safari, then Share -> **Add to Home
Screen**. It then launches full screen from its own icon, and finds the laptop
by name, so nothing has to be typed again. There is no Xcode step: the laptop
serves the app, so the socket connects back to the same origin.

**5. Check it.** Open `http://<laptop-name>.local:8765/debug` on the laptop
while the iPad runs the app. It shows the microphone level, what the camera
reads, what was transcribed and what Poco said, updating five times a second.
That page is the first thing to look at when something seems wrong.

### Running pieces on their own

```sh
cd server
uv run social_demo.py                 # the whole loop, no iPad
uv run social_demo.py --no-llm        # perception only, no API calls
uv run emotion_demo.py                # face + emotion, with live tuning keys
uv run speech_demo.py                 # microphone + transcription
uv run tune_sweep.py session.mp4      # sweep thresholds against a recording
cd ../servos && python play.py happy  # one gesture
cd ../led_matrix && python emotions.py  # cycle the belly faces
```

## 3b. Demo day

```sh
cd server && uv run demo_check.py
```

Checks the board, the camera, the microphone, the speaker, the keys, Claude and
the network, and says what to fix. Run it before presenting rather than finding
out in front of people.

Then, in order:

1. `cd server && uv run run_server.py --memory`
2. On the iPad, open the Poco icon (or Safari to the address it printed)
3. Leave `/debug` open on the laptop - it shows whether Poco is hearing anything

**Showing Play mode** (a child talking to Poco): Fun tab -> Play with Poco ->
Start listening. Say "Poco, can you dance?" - he answers out loud and dances.
Ask him to show a feeling and he teaches it. This is the mode that demos well:
he always replies.

**Showing Social mode** (Poco coaching a conversation): Interacting tab ->
Start, and stay on that screen. Have someone sit in front of Poco and talk
about something they are worried about, pausing properly between sentences.
Poco waits for a real stop and says one quiet thing to the person beside him.
He is mostly silent by design - that is the point, not a fault - so use **Ask
Poco** if you need him to say something at a particular moment.

**Things that have actually gone wrong**, in likelihood order:

- *Poco unplugged and replugged.* He recovers on his own now, within three
  commands, but it takes a few seconds. Do not replug during the demo.
- *Nothing audible.* The speaker follows `SPEAKER` in `poco/devices.py`; check
  the system volume is not at 25, which is where it was found once.
- *Poco says nothing in Social mode.* Usually correct. Use Ask Poco.
- *The iPad cannot find the laptop.* Venue Wi-Fi blocking device-to-device
  traffic. Use the laptop's hotspot - test this before the day.
- *Gestures stop halfway or the board keeps reconnecting.* The servo supply is
  sagging. That is the screw terminal, not the software.

## 4. The contract with the iPad app

The app talks to Poco through one interface, `src/poco/pocoClient.ts`. **That
file is the source of truth for every id string**, and the server mirrors it in
`poco/bridge/events.py`. Feelings, gestures and colours are the
app's, not ours — the same strings travel from the classifier to the LEDs.

```python
PocoEvent  {"type": "noticed", "feeling": "worried", "said": "...",
            "why": "He named a specific worry; a follow-up keeps him talking.",
            "at": 1790462436498}
PocoAction {"move": "listen", "belly": {"color": "#A177FF", "brightness": 1.0},
            "say": "..."}
```

- **Feelings** — the app knows twelve; the camera can tell six apart:
  `happy sad angry surprised worried neutral`. The rest (calm, excited, tired,
  silly, shy, frustrated) are teaching tiles the adult triggers. `calm` in
  particular is a judgement about someone, not an expression, and looks
  identical to `neutral` to a classifier.
  There is no *disgusted*: the model cannot separate disgust from anger (a
  disgusted face scored Anger 56% / Disgust 10%), so Poco would be teaching a
  name it cannot reliably attach to a face. Dropping it is deliberate.
- **Moves** — 23 named movements (`POCO_MOVES`), each a real keyframed gesture
  in `servos/gestures.py` that starts and ends at home. The server offers Claude
  all but `breathe`, which runs 36 seconds and is a regulation exercise the
  adult chooses, not a reaction to someone looking tense. Durations are shown
  to the model so a nine-second sway is chosen knowingly.
- **`PocoEvent.feeling` is the friend's expression.** The app's session history
  therefore records how well Poco read the friend, which is worth keeping — see
  section 5.
- The **8x8 faces** exist twice already — `src/poco/patterns.ts` and
  `led_matrix/emotions.py` — and are deliberately **not** copied a third time
  into `server/`. Three hand-maintained sets of the same grids will drift until
  Poco shows a face the app never drew. `belly_for()` returns colour and
  brightness only; the robot driver should read `led_matrix/emotions.py`.

## 5. How the server works

```
camera ──> EmotionDetector ──> emotion track ──┐
                                               ├─> SocialContext ─> Coach ─> Voice
mic ─────> SpeechListener ──> Utterance ───────┘        │            (Claude)  (11labs)
                                                        └─> Memory (optional)
```

**`poco/vision/emotion.py`** — YuNet finds the largest face, HSEmotion scores it,
scores are smoothed, and an emotion is only announced once it has led for
`hold_seconds`. Defaults (`min_confidence` 0.40, `hold_seconds` 1.6, `smoothing`
0.15) were not guessed: they came from sweeping 300 combinations against a
labelled recording. `min_margin` additionally requires the winner to beat the
runner-up, because a 42%/35% split is a coin toss and silence beats a confident
wrong label.

**`poco/audio/speech.py`** — captures at 16 kHz and uses Silero VAD to find where
utterances start and stop, then Whisper (`base.en`) to transcribe. Endpointing is
Silero's rather than an energy threshold: a threshold has to be calibrated
against a room's noise floor, and a floor estimated during one quiet moment stays
latched on for good. Measured 3% word error rate on speech aimed at the mic;
ambient chatter across a room is far worse.

**`poco/social/context.py`** — fuses the two. `EmotionEvent` is no use here
because it only fires when the stable emotion *changes*, so a whole sentence can
pass without one. Instead every frame's reading goes into a 60-second track, and
when an utterance lands its time window is queried. Both pipelines stamp with
`time.monotonic()`, so they line up for free. Each `Turn` renders as one line —
`(looked calm, then sad) "I'm really stressed about the chemistry one"` — and
comparing the first third of a sentence against the last catches "started fine,
ended upset", which matters more to a coach than either half alone.

**`poco/social/coach.py`** — sends that to Claude (`claude-opus-5`) and gets back
a schema-validated `Suggestion(say, gesture, belly, reason, remember)`. **Silence
is the default**: the system prompt makes `say: null` the right answer whenever
the conversation is fine, nothing has changed, or the model is unsure. The child
is already managing a live conversation and an interruption costs them their
place in it. The prompt also says to treat the face reading as a weak hint and
trust the words when they disagree — which is what produced *"'It's fine' twice.
You could just say: I'm here if you want to talk."*

**`poco/voice/speaker.py`** — ElevenLabs `eleven_v3`, style 1.0, stability 0.5.
It also **deafens the microphone while Poco talks**. This is not optional: Poco
speaks into the room his own mic is listening to, and without the guard Whisper
transcribes him, `SocialContext` files it as something the friend said, and Poco
advises the child about a sentence he made up himself. Demonstrated — without the
guard the transcript came back verbatim; with it, nothing.

**Tuning.** `emotion_demo.py --record --guide` walks someone through each
expression and writes a labelled recording; `tune_sweep.py` decodes it once and
scores hundreds of threshold combinations against the cached probabilities.
Better still, **the app already collects the right data**: `accuracy()` in the
app's Interacting Mode gives "Poco was right X of Y" from adult corrections keyed
by event time. That is real ground truth from real sessions. Wiring it into
`tune_sweep.py` is the best calibration work available and nobody has done it.

## 6. The onboarding flow (7 steps)

Progress labels: You · Child · Support · Comfort · Explore · Connect · Hello.
Each step has a Doto eyebrow "STEP N OF 7", a Sniglet headline, a Lexend helper
line, and Poco says a line in the bubble.

| # | File | Asks / does | Continue enabled when |
|---|---|---|---|
| 1 | Step1You | Adult's name, role pills (Teacher/Therapist/Parent) | name non-empty |
| 2 | Step2Child | Child's first name, pronouns, age, how they communicate | name non-empty |
| 3 | Step3Support | "What works for {name}": favourite things, what calms them, notes | always |
| 4 | Step4Comfort | Volume, belly brightness, movement speed, sound/talk toggles | always |
| 5 | Step5TryPoco | Feelings / Make your own / Modes | always |
| 6 | Step6Connect | Connect → mock connects in 1.6 s, Poco waves; Skip jumps to 7 | connected |
| 7 | Step7Hello | 5-line intro with synced highlighting; Start using Poco | no Continue |

How the answers change Poco — this is the point of asking:

- **Pronouns** → Poco's lines and the talk-aloud example.
- **Favourite things** (first item) → Poco reacts on blur, and script line 3
  becomes "When I think about trains, I feel happy…".
- **Calming** (first item) → `calmingPhrase` ("deep breaths" → "take deep
  breaths"). Tapping Sad/Angry/Scared makes Poco model it. This is the "regulate
  emotions" half of the pitch.
- **Communication** Partially verbal / Nonverbal → script line 5 becomes "You can
  point or tap to answer me."
- **Custom feelings** store their drawn pattern and show it on Poco's belly.

Missing names fall back to "your child" in adult text and "friend" in Poco's
lines (`stepMeta.ts`). Guiding rule: **only ask for something if it changes what
Poco does.** No diagnosis, medical info, photos, birthday or last name.

## 7. The three modes

**Interacting Mode** is where the server does its work. The app only switches it
on and off: `pocoClient.setInteracting(true|false)`, and `onEvent` delivers
`{type:'noticed', feeling, said?}` events for the feed. Poco decides when to
speak; there is no talkativeness setting, because the robot filters its own
chatter.

> **The app's mock is wrong and needs updating.** `MOCK_SAYS` in `pocoClient.ts`
> has Poco saying "You look happy!" — Poco addressing the child about the child.
> It is the other way round: the feeling is the *friend's*, and Poco's line is
> advice to the child. The mock should read more like "Your friend looks happy —
> you could ask what's going on."

**Interacting history.** Each Start → Pause is an `InteractSession` in
`state.sessions` (newest first, max 60 × 300 events; taps under 20 s with nothing
noticed are dropped). Saved on every event, so a reload loses nothing. Only
feeling ids, what Poco said and times are stored. Review is optional: each ended
session has a Give feedback button (rating, note, corrections keyed by event
time). `effectiveEvents()` applies corrections; `accuracy()` gives "Poco was
right X of Y" — see section 5, this is the calibration data.

**Teaching Mode.** Tiles are presets (`teaching/tiles.ts`) plus the adult's own.
Editing a preset saves a custom copy with `replaces: <presetId>` taking the
preset's slot; deleting is "Reset to original". Lessons are presets plus
`lessons` in state; steps are Poco steps (tile + line) or teacher cues. The
player never advances on a timer. Lesson steps reference tiles by id, so edits
are picked up automatically.

**Fun Mode.** Timed routines loop their steps until `seconds` is up. Copy Me is
paced by the adult's Next move. Stop Poco bumps `poco.stopId`; FunScreen watches
it — use the same signal for anything else on timers.

## 8. Next steps

**A. Connect the server to the app (do next).** Add `server/` here: a
`websockets` server on `:8765` that also serves the app's built files, so the
iPad connects back to the host it loaded from and nobody types an IP. Hosting the
app online does not work — an HTTPS page cannot talk to `ws://` on the LAN.
`WsPocoClient` replaces `MockPocoClient` in the app, sending the same objects as
JSON. `poco/bridge/events.py` already emits both shapes.

**B. Drive the robot from the server.** `servos/` and `led_matrix/` already do
the hard part — keyframed gestures, pose calibration, the NeoPixel driver and
both firmware sketches. What is missing is the glue: a driver in `server/` that
takes a `PocoAction` and calls `Poco.play(move)` and `LedMatrix.draw(face)`.
`poco/bridge/events.py` already emits the action; `move_seconds()` says how long
each gesture occupies the robot, so nothing is sent on top of a running one.
The earlier hand-rolled serial protocol below is superseded by those modules:

```
G bounce flap 1.6                 body, flippers, speed multiplier
B <49 bits as hex> E8833A 40      belly pattern, colour, brightness
S 20 40 0                         volume, brightness, speed
PING → PONG 10 49                 handshake: 10 motors, 49 LEDs
```

Gesture keyframes live on the Arduino. Open questions: motor type (servos?), LED
type (NeoPixel/WS2812 or a matrix module), and whether speech comes from the
laptop or a speaker inside Poco. The sketch does not exist yet.

**C. The Connect step should become honest** — two stages, laptop found → Poco
answered, instead of one mock spinner.

**D. Recalibrate when the C270 is mounted.** The current thresholds were tuned
against a desk position that no longer exists, and camera angle matters more than
any of them: the same face at a bad angle read 17% calm, and at a good one 43%.
Two minutes of work, section 5.

## 9. Gotchas

**Server**

- **Camera indices shift when USB devices come and go.** Unplugging the C270
  moved the MacBook's camera from index 1 to 0 and its microphone from 2 to 1.
  Microphones are matched by name and survive this; cameras cannot be, because
  OpenCV has no way to ask a camera its name. Both are pinned in
  `poco/devices.py` — re-check with `--list-cameras` after any hardware change.
- **macOS only.** `cv2.CAP_AVFOUNDATION` is hardcoded in the demos.
- **The first frames off any webcam are black** while auto-exposure ramps. Every
  capture path warms up for 2.5 s first; a snapshot without that is useless for
  identifying a camera.
- **`opencv-python` and `av` ship different ffmpeg builds** and macOS prints a
  duplicate-class warning about "spurious casting failures and mysterious
  crashes". Nothing has crashed across many runs, and Whisper is fed numpy arrays
  rather than files, so `av` is barely exercised. Left alone deliberately — worth
  knowing if something strange happens.
- **Backboard's search score is a distance, not a similarity.** Lower is closer.
  Results come back nearest-first so ordering is fine, but `score > 0.7` keeps
  exactly the wrong facts.

**App**

- Buttons inside the step `<form>` must be `type="button"` or they submit the
  step. Text inputs that shouldn't submit on Enter call `preventDefault`.
- React StrictMode is on; effects run twice in dev, so keep them idempotent.
- iOS only shows `:active` styles because `main.tsx` adds an empty `touchstart`
  listener.
- If state shape or step numbering changes, bump the storage key
  (`poco.onboarding.v2`) or normalize in `load()`.

## 10. What leaves this laptop

The old README said data "stays on the iPad". That was true of the app alone and
is **not** true of the system, so here is the real answer.

| | where it runs | kept |
|---|---|---|
| camera frames, face detection, emotion | this laptop | never stored, never sent |
| speech → text (Whisper + Silero) | this laptop | never stored, never sent |
| transcript → suggestion | Anthropic API | not used for training; transient |
| suggestion → speech audio | ElevenLabs API | transient |
| facts about the friend | Backboard | **stored indefinitely** |

**No audio or video ever leaves the laptop.** Face detection, emotion
classification and transcription are all local. What goes out is text.

**Cross-session memory is off by default** (`--memory` turns it on). Poco's user
is covered by the adult who set him up. The friend is not covered by anyone —
they are sitting in front of a robot because they came to talk to a child, and
"Running in the mornings helps this friend stay calm before stressful days" is a
personal detail about an identifiable person, often another child. Storing that
on a vendor's server should be a decision someone makes on purpose, not a
default. It measurably improves the advice, so it is worth turning on once
somebody has decided that is fine.

If the "everything stays local" answer is wanted back, the honest route is a
local model for the coach and local TTS, and a real drop in quality. Do not claim
it without doing it.

## 11. Design system

**Signature idea:** Poco's belly is a dot-matrix screen and the whole app uses
that language (LED tiles, LED progress dots, Doto numbers). Everything else is
soft, chunky and friendly.

- **Colours** are CSS variables in `tokens.css`. **No gradients. No emoji** — use
  LED patterns or inline SVG.
- **Fonts:** Sniglet (headlines, Poco's speech, tile labels), Lexend (body,
  buttons; chosen to reduce visual stress), Doto (eyebrows, numbers, tags).
- **Shapes:** pill inputs (~60px, radius 999px, 2px border); cards white, radius
  24–28px; buttons have a solid bottom ledge that squishes on `:active`. Primary
  navy, secondary white, orange CTA only for Start on step 7.
- **Layout:** landscape 1180x820 target; must work at 1024x768 and 1366x1024
  without horizontal scroll.
- **Accessibility:** real buttons/inputs/labels; `role=group` + `aria-pressed`
  for pill groups; `role=switch` for toggles; touch targets ≥ 44px; orange focus
  ring on `:focus-visible`; contrast ≥ 4.5:1; **emotion colours always paired
  with a label and a face**, because yellow/orange are low-contrast on white and
  green/orange are close for protan vision; `prefers-reduced-motion` disables all
  animation and the typewriter.

## 12. File map

```
server/                 the laptop: perception, judgement, voice
  poco/devices.py         which camera index and microphone name to use
  poco/vision/emotion.py  YuNet + HSEmotion, smoothing, EmotionEvent
  poco/audio/speech.py    capture, Silero endpointing, Whisper, mic muting
  poco/social/context.py  fuses face + speech on one timeline -> Turn
  poco/social/coach.py    Claude -> Suggestion(say, gesture, belly, reason, remember)
  poco/social/memory.py   Backboard, opt-in, off the critical path
  poco/voice/speaker.py   ElevenLabs v3, plus deafening the mic while speaking
  poco/bridge/events.py   PocoEvent / PocoAction, ported from pocoClient.ts
  emotion_demo.py         vision only; --list-cameras, --record, --guide, tuning keys
  speech_demo.py          microphone only
  social_demo.py          the whole pipeline
  tune_sweep.py           sweep thresholds against a labelled recording

servos/                 Poco's 11 servos
  gestures.py             the 23 keyframed movements, all starting/ending at home
  poco_motion.py          Poco class: poses, easing, speed and amount scaling
  servo_link.py           serial link to the Arduino
  poses.json              calibrated poses; set_home.py / pose_editor.py to edit
  servo_test/             firmware

led_matrix/             the 8x8 NeoPixel belly
  led_matrix.py           LedMatrix: pixels, frames, fades, brightness
  emotions.py             the 8x8 faces and their LED colours
  modes.py, solid.py, text.py
  matrix_firmware/        firmware

src/                    the iPad app
  app/                    AppProvider (state, reducer, persistence), AppShell, PocoStage
  poco/                   PocoCharacter, LedMatrix, LedEditor, patterns.ts, emotions.ts,
                          pocoClient.ts  <- the contract; server/poco/bridge mirrors it
                          serverUrl.ts   <- where the laptop is, for the installed app
  teaching/               tiles.ts, lessons.ts, TeachingScreen + editors
  interacting/            InteractingScreen, SessionSummary, FeedbackForm, sessionStats.ts
  fun/                    funRoutines.ts, FunScreen
  onboarding/             OnboardingLayout, steps/Step1You … Step7Hello
  ui/, styles/

ios/                    Capacitor wrapper: the app as an installed iPad app
```

## 13. Working with this project

- **Talk through bigger changes before writing them** — architecture, new
  features, anything that changes what Poco does. Cosmetic tweaks can go straight
  in.
- **Iterate visually.** After UI changes, build and check screenshots at 1180x820
  and 1024x768.
- **Measure before tuning.** Every threshold in the server came from a sweep
  against a recording, and several confident guesses turned out wrong — the C270
  microphone was written off on a number that turned out to be measuring distance
  rather than the microphone. Record it, sweep it, then decide.
- **Prefer simple, clean screens** over feature-dense ones.

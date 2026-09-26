# Poco

Handoff notes for whoever works on this next (human or agent). Read this whole file before changing code.

## 1. What Poco is

**Poco** is a plush robot penguin that helps **autistic children learn to read, name and regulate emotions**. Their belly has an 8×8 LED matrix (NeoPixel, see `led_matrix/`) that shows pictures and emotion colors; they have 11 motors (head, flippers, legs) and talk with a speaker and camera. Poco uses **they/them**: keep all app text and Poco's lines gender-neutral.

The system has three parts:

```
 iPad (web app, this repo)        Laptop (not built yet)             Poco
 ┌──────────────────────┐  Wi-Fi  ┌───────────────────────────┐ USB  ┌─────────────┐
 │ Adult sets up and    │────────▶│ Python server             │─────▶│ Arduino Uno │
 │ controls Poco        │WebSocket│ serves app, JSON → serial │serial│ motors, LEDs│
 └──────────────────────┘         │ TTS, later camera/emotion │      └─────────────┘
                                  └───────────────────────────┘
```

- The **iPad app** is used by a teacher, therapist or parent (never the child directly). Landscape only.
- The **laptop** runs a Python server (camera, emotion detection, TTS, serial to the Arduino). It is **not built yet**.
- The **Arduino Uno** is physically plugged into the laptop by USB and drives the motors and belly LEDs.

**This repo is the iPad app: the onboarding flow plus the main app with Teaching, Interacting and Fun modes.** The Python server comes later. The robot is **mocked** behind `src/poco/pocoClient.ts`. The iPad is the adult's **remote control** for the physical Poco: after onboarding there is no on-screen penguin, because the adult is watching the real one.

Guiding rule for anything we ask the adult: **only ask for something if it changes what Poco does**, and it stays on the iPad (privacy answer for judges). We deliberately don't collect diagnosis, medical info, photos, birthday or last name.

## 2. Status

- All 7 onboarding steps work end to end. `npm run build` (tsc + vite) passes with no errors.
- After onboarding: mode tabs (Teaching / Interacting / Fun), profile chip (settings placeholder with "Start setup again"), now-playing bar with Stop. Teaching Mode is complete (tiles, tile editor, lessons, lesson player, lesson builder). Checked in headless Edge at 1180×820 and 1024×768.
- Verified with headless Edge + Playwright screenshots at 1180×820 (iPad Air, the design target), 1024×768 and 1366×1024: no horizontal scroll, resume after reload works.
- **Not yet tested on a real iPad.** Next practical step: serve it from the laptop and open it on the iPad (section 8).

## 3. Run

Requires Node 18+. **Node is not currently installed on the user's Windows laptop** (a portable copy was used temporarily for builds). Install with `winget install OpenJS.NodeJS.LTS`.

```sh
npm install
npm run dev        # vite --host: also reachable from the iPad on the same Wi-Fi (use the "Network" URL)
npm run build      # typecheck + production build
npm run typecheck
```

Demo helpers:
- **Reset everything:** long-press the "Poco" wordmark (top left) for 2 s.
- **Gesture test panel:** add `?dev` to the URL.
- Everything the mock robot would send is logged with `console.debug('[poco] …')`.

## 4. Tech stack and conventions

- Vite + React 18 + TypeScript (strict, `noUnusedLocals`). No UI kit, no Tailwind, no animation library.
- Plain CSS: global `src/styles/{tokens,base,motion}.css` plus one CSS file per area. **Global styles are imported first in `main.tsx`** so component CSS can override them (order matters, e.g. `.emo-tile` overrides `.tile`'s transition).
- State: one `AppProvider` (`src/app/`, context + `useReducer`, hook `useApp()`), persisted to `localStorage` key **`poco.onboarding.v2`** (bumped from v1 when step 2 was split; new fields are added with defaults in `load()` instead of bumping). Everything is saved except `connection`.
- Match the surrounding code: small components, CSS class names like `.field`, `.pill`, `.btn-primary`, comments only where the "why" isn't obvious.

## 5. File map

```
src/
  main.tsx, App.tsx
  styles/   tokens.css (colors/fonts), base.css (reset, focus ring, .sr-only), motion.css (all keyframes + gesture classes)
  app/
    AppProvider.tsx    all state, reducer, persistence, play()/say()/showBelly()/resetPoco()/stop(), usePocoLine(), idlePattern()
    AppShell.tsx       after onboarding: wordmark + mode tabs + profile chip, screen body, now-playing bar (belly, last line, connection, Stop)
    WakeUpIntro.tsx    once after setup (state.introPending): full-screen LED panel lights from the center, holds a heart, scatters away; tap skips
    PocoStage.tsx      onboarding's left stage (bubble + penguin), Wordmark (long-press reset), ?dev panel
    layout.css, shell.css
  poco/
    PocoCharacter.tsx  SVG penguin + belly LedMatrix + gesture classes (retrigger logic)
    LedMatrix.tsx      read-only 8x8 dot grid (scan prop = light up row by row)
    LedEditor.tsx      drawable 8x8 grid (tap to toggle, drag to paint, arrow keys + Space)
    patterns.ts        all 8x8 patterns as data (feelings from led_matrix/emotions.py, solid, calm tools, icons); patternRows pads old 7x7
    emotions.ts        the 12 feelings (emotions.py's faces minus Scared, plus Calm, Shy, Frustrated; 6 core), screen colors, CustomEmotion (= a custom tile), ORANGE
    SpeechBubble.tsx   typewriter bubble (28 ms/char), aria-live copy for screen readers
    pocoClient.ts      PocoClient interface + MockPocoClient (the only place that knows how Poco is reached)
    useReducedMotion.ts
  teaching/
    tiles.ts           ALL tile wording: 6 core + 6 more feelings + 4 calm-down tools, line templates, buildTiles(), useTiles()
    lessons.ts         Lesson/LessonStep types, 6 ready-made lessons (templates), useLessons()
    TeachingScreen.tsx view switch (feelings / tile / editTile / lessons / play / build) + shared bits
    TileEditor         one scroll: Name, Color, Belly lights (drawn), Movement, What Poco says (optional, Suggest some lines); sticky preview
    MotionPicker       MoveControls (Ready-made: Feelings + Moments; Mix your own: up to 5 steps, each any mix of head / each flipper / feet commands) and TilePreview
    FeelingsView, TileDetail, LessonsView, LessonPlayer, LessonBuilder, teaching.css
  fun/
    funRoutines.ts     4 dance breaks + 2 games as data (steps = body + flipper move, belly picture, color, line, ms)
    FunScreen.tsx      tap a card to start; now-playing card with progress + Stop (Copy Me: Next move); fun.css
  interacting/
    InteractingScreen.tsx  Start/Pause switch, this/last session, past sessions
    SessionSummary.tsx     FeelingBars (one bar per feeling, in its belly color, labeled) + "Show every moment" list + Give feedback
    FeedbackForm.tsx       optional review: How did it go? (Tough/OK/Great), notes, fix moments Poco got wrong
    sessionStats.ts        countFeelings, minutesLabel, dayLabel, weeklyTrend (last 7 days vs the 7 before); interacting.css
  ui/ConfirmButton.tsx     tap-twice destructive button (Delete, Reset, Clear history)
  settings/SettingsScreen.tsx  one scrolling form: child, what works, Poco comfort + connection, you, Interacting history, Start setup again (edits save as you go)
  onboarding/
    OnboardingLayout.tsx    PocoStage + right panel, progress, footer
    ProgressDots.tsx, StepHeader.tsx
    stepMeta.ts             STEP_COUNT=7, STEP_LABELS, IDLE_PATTERNS, SPEED_MULTIPLIER, name fallbacks
    childProfile.ts         pronouns helpers, splitList, firstFavorite, calmingPhrase
    steps/Step1You … Step7Hello.tsx, steps.css
  ui/ ChunkyButton, PillGroup (single-select), Toggle (role=switch), Slider, ui.css
```

## 6. The onboarding flow (7 steps)

Progress labels: You · Child · Support · Comfort · Explore · Connect · Hello. Each step has a Doto eyebrow "STEP N OF 7", a Sniglet headline, a Lexend helper line, and Poco says a line in the bubble.

| # | File | Asks / does | Continue enabled when |
|---|---|---|---|
| 1 | Step1You | Adult's name, role pills (Teacher/Therapist/Parent) | name non-empty |
| 2 | Step2Child | Child's first name, pronouns (he/him, she/her, they/them), age, how they communicate | name non-empty |
| 3 | Step3Support | "What works for {name}": text boxes for **Favorite things**, **What helps them calm down**, optional notes | always |
| 4 | Step4Comfort | Volume + belly brightness sliders (brightness is live on Poco), movement speed (live), sound-effects and talk-aloud toggles | always |
| 5 | Step5TryPoco | "Get to know Poco": tabs **Feelings** (tap a tile, Poco acts it out), **Make your own** (name + color + draw its face), **Modes** (pick starting mode) | always |
| 6 | Step6Connect | Connect button → mock connects in 1.6 s, Poco waves; "Skip for now" jumps to step 7 | connected |
| 7 | Step7Hello | 5-line intro script played with synced highlighting (3.8 s/line); Start / Play again / Start using Poco (enters the app on the chosen start mode) | no Continue |

How the answers change Poco (this is the point of the questions):
- **Pronouns** → Poco's lines ("I want to know all about her!") and the talk-aloud example ("Maya looks happy, doesn't she?").
- **Favorite things** (first item) → Poco reacts on blur ("Ooh, I like trains too!") and script line 3 becomes "When I think about trains, I feel happy…".
- **Calming** (first item) → mapped to a phrase (`calmingPhrase`: "deep breaths" → "take deep breaths", unknown → "try …"). Tapping Sad/Angry makes Poco model it ("This is me feeling angry. I take deep breaths to feel better.") and script line 4 uses it. This is the "regulate emotions" half of the pitch.
- **Communication** Partially verbal / Nonverbal → script line 5 becomes "You can point or tap to answer me. Ready to play?"
- **Custom feelings** store their drawn `pattern` (7 strings of 7 chars) and show it on their tile and on Poco's belly.

Missing names fall back to "your child" in adult text and "friend" in Poco's lines (`stepMeta.ts`).

## 7. How Poco is driven (key mechanisms)

- `play(gesture, color, pattern, say?)` — the single "perform" action: sets the gesture class, belly pattern/color, optional speech line, and calls `pocoClient.perform(...)`. Belly and line persist until the next play, a tab change or a step change (step change resets Poco to idle).
- `showBelly(pattern, color)` — belly only, no gesture (used to mirror the drawing live in Make your own).
- `resetPoco(line?)` — back to the step's idle belly (`IDLE_PATTERNS`).
- `usePocoLine(line)` — step components set their default bubble line with this (layout effect, so no flash). Pass `null` to leave the line alone.
- **Gesture retrigger:** `PocoCharacter` drops the class and re-adds it ~30 ms later (keyed on `playId`) so the same CSS animation can replay.
- `--spd` CSS var = movement speed (Gentle 1.6, Normal 1, Lively 0.7); all gesture durations multiply by it.
- `Pattern = PatternKey | readonly string[]` — named patterns or hand-drawn rows work everywhere (belly, tiles, robot).
- `pocoClient.applySettings(comfort)` is called whenever comfort settings change while connected.

The robot interface (`pocoClient.ts`) — keep the UI unaware of transport:
```ts
interface PocoClient {
  connect(): Promise<void>; disconnect(): void; isConnected(): boolean;
  applySettings(s: PocoSettings): void;   // volume, brightness 0..100, speed, soundEffects, speakAloud
  perform(a: { move?: PocoMove; mix?: MoveMix; belly?: { pattern: string[]; color: string; brightness: number }; say?: string }): void;
  stop(): void;
  setInteracting(on: boolean): void;   // Poco decides when to talk (the robot filters its own chatter)
  onEvent(listener: (e: PocoEvent) => void): () => void;   // PocoEvent = { type: 'noticed', feeling, said?, at }
}
// PocoMove = the 23 gestures in servos/gestures.py (POCO_MOVES, with lengths). Feelings without their own
// movement (angry, neutral, excited, silly) use the closest. On screen, poco/moves.css animates each one
// (m-<name> classes; the face moves inside the head for nods, shakes and looking).
//
// Mix your own (custom tiles): perform({ mix: { steps: [ { head?, leftArm?, rightArm?, feet?, times? }, ... ] } })
// 1-5 steps played in order. Within a step, every part given does its command at the same time; a part
// left out holds still (an empty step = hold still). times (1-3, default 1) repeats the step.
// Each command lasts about 2 s at normal speed and starts and ends at rest (like gestures.py).
//   head:              nod | shake | tilt | look_up | look_down | look_left | look_right
//                      (head_pitch, head_turret, head_roll)
//   leftArm, rightArm: up | down | wave | flap | out | bend
//                      (arm_pitch for up/down/wave/flap, arm_roll for out, arm_elbow for bend)
//   feet:              lift_left | lift_right | up_down | alternate
//                      (left_leg, right_leg: left_foot_up / right_foot_up; up_down = both feet up and down
//                      twice; alternate = one foot then the other, like sway)
// Everything is in Poco's OWN left/right, like servo_limits.py: look_right = they turn to their right.
// The UI labels things as you face them, so its 'Left flipper' row sets rightArm, 'Look left' sends
// look_right and 'Lift left foot' sends lift_right.
// Tiles saved by earlier builds ({ head, leftArm, rightArm, feet } with 'still') are turned into one step
// by upgradeMix() before they're sent.
```

## 8. Next steps and plans

**A. Get it on the iPad (agreed, do next).** No Xcode needed (the laptop is Windows anyway). Install Node, `npm run dev`, open the Network URL in Safari on the iPad (same Wi-Fi), optionally Share → Add to Home Screen for full-screen. Gotchas: allow the Windows firewall prompt; school/venue Wi-Fi often blocks device-to-device traffic, so use the laptop's hotspot; the Home Screen app has its own localStorage.

**B. Real robot (discussed, not started — confirm details with the user first).** Proposed design:
- Python server on the laptop (`server/`, `websockets` + `pyserial`) that also **serves the built app**, so the iPad connects back to the host it loaded from (no IP entry). Hosting the app online is a bad idea: an HTTPS page can't talk to `ws://` on the LAN.
- `WsPocoClient` replaces `MockPocoClient`, sending the same objects as JSON to `ws://<laptop>:8765`.
- Server → Arduino as short text lines (the Uno can't parse JSON): `G happy 1.6` (one of the robot's 8 movements + speed; see `POCO_MOVES`), belly frames go out with the `F` command in `led_matrix/` (64 × RGB; the app sends 8 rows of 8 plus a screen color, which the server turns into LED values with gamma 2.2, the reverse of the conversion in `emotions.ts`), `S 20 40 0` (settings). Gesture keyframes live on the Arduino.
- The Connect step should become honest two-stage status: laptop found → Poco answered.
- Open questions for the user: does an Arduino sketch exist already; motor type (servos?) and LED type (NeoPixel/WS2812 or a matrix module); speech from laptop speakers or a speaker in Poco; Python must be installed (it isn't yet).

**C. Later:** the real laptop/robot side of Interacting Mode.

**Interacting Mode, how it works.** Poco does the watching and responding themself; the app only switches it on and off. `pocoClient.setInteracting(true | false)` tells the robot, and `pocoClient.onEvent` delivers `{ type: 'noticed', feeling, said? }` events, shown in the feed and mirrored in the "Poco says" bar via `mirror()` (nothing is sent back). The mock invents an event every 5–9 s and speaks about half the time. Leaving the screen or Stop Poco pauses them, so they never run unseen. There is no talkativeness setting in the app: the robot filters its own chatter.

**Interacting history.** Each Start → Pause is an `InteractSession` in `state.sessions` (newest first, max 60 sessions × 300 events; taps under 20 s with nothing noticed aren't kept). It's saved on every event, so a reload loses nothing. Only feeling ids, what Poco said and times are stored, on this iPad only; Settings has Clear history. Logging is automatic; review is optional: each ended session has a Give feedback button (rating, note, corrections keyed by event time, `'none'` = no one was there). Bars, past-session chips and the weekly trend use `effectiveEvents()` (corrections applied); `accuracy()` gives "Poco was right X of Y" for reviewed sessions — the data you'd want later to tune Poco's face reading. The feeling colors are Poco's LED colors, so they're kept for the bars even though yellow/orange are low-contrast on white and green/orange are close for protan vision: every bar is labeled (face, name, count) and has a darker edge.

**Fun Mode, how it works.** Timed routines loop their steps (each held `ms` × comfort speed) until `seconds` is up, then Poco says "Great dancing". Copy Me is paced by the adult's Next move. Stop Poco bumps `poco.stopId`; FunScreen watches it and ends the routine (use the same signal for anything else that runs on timers). "Being touched" sensitivity was cut; Fun Mode may later need a "no touch prompts" option.

**Teaching Mode, how it works.** Tiles are presets (data in `teaching/tiles.ts`) plus the adult's own (`customEmotions` in state). Editing a preset saves a custom copy with `replaces: <presetId>` that takes the preset's grid slot; deleting it is "Reset to original". `hiddenTiles` removes tiles from the grid. Tapping a tile = `play()` with its first line, then its page opens; line rows use `say()` (no new gesture). Lessons are presets (`teaching/lessons.ts`, not stored) plus `lessons` in state; steps are Poco steps (tile + line) or teacher cues (adult-only, Poco holds still). The player never advances on a timer. Lesson steps reference tiles by id, so an edited preset is picked up automatically.

## 9. Design system (from the original spec; follow it)

**Signature idea:** Poco's belly is a dot-matrix screen and the whole app uses that language (LED tiles, LED progress dots, Doto numbers). Everything else is soft, chunky and friendly, like kids' learning apps.

- **Colors** are CSS variables in `tokens.css` (`--ink`, `--navy`, `--orange` for LEDs/accents, `--orange-text` for orange text/fills with white text, `--ice` left stage, `--paper` right panel, …). **No gradients anywhere. No emoji anywhere** (use LED patterns or inline SVG).
- **Fonts:** Sniglet (headlines, Poco's speech, tile labels), Lexend (body, buttons; chosen to reduce visual stress), Doto (eyebrows, step numbers, small tags, numeric readouts).
- **Shapes:** pill inputs (height ~60px, radius 999px, 2px `--line` border); cards white, radius 24–28px; buttons have a solid bottom "ledge" shadow that squishes on `:active`. Primary = navy, secondary = white, orange CTA only for Start on step 7.
- **Layout:** landscape 1180×820 target; left stage `clamp(340px, 37vw, 440px)` with speech bubble + Poco (300×340) + floor; right panel with progress, scrolling step body, footer (Back / Continue). Must work at 1024×768 and 1366×1024 without horizontal scroll.
- **Accessibility:** real buttons/inputs/labels; pill groups `role=group` + `aria-pressed`; toggles `role=switch`; tabs with `role=tablist/tab`; touch targets ≥ 44px; orange focus ring on `:focus-visible`; text contrast ≥ 4.5:1; emotion colors always paired with a label and face; `prefers-reduced-motion` disables all animation and the typewriter.
- The feelings are Happy, Sad, Angry, Surprised, Neutral, Calm (core) and Excited, Tired, Worried, Silly, Shy, Frustrated. Faces from `led_matrix/emotions.py` are copied dot for dot (Scared is left out: no robot movement); Calm, Shy and Frustrated use the app's own faces. Faces are copied dot for dot; colors are its LED colors converted for screens. Each feeling has a face tile and a color tile (show_face / show_color). If emotions.py changes, update `patterns.ts` and `emotions.ts` to match.

## 10. Gotchas

- Buttons inside the step `<form>` must be `type="button"` (ChunkyButton defaults to it) or they submit the step. Text inputs that shouldn't submit on Enter call `preventDefault` (see Make your own).
- React StrictMode is on; effects run twice in dev, so keep them idempotent.
- iOS only shows `:active` press styles because `main.tsx` adds an empty `touchstart` listener.
- If state shape or step numbering changes, bump the storage key or normalize in `load()`/`normalizeChild()` in the provider.

## 11. Working with this user

- Wants to **talk through bigger changes before code** (architecture, new features); cosmetic tweaks can go straight in.
- Iterates visually: after UI changes, build and check screenshots at 1180×820 and 1024×768.
- Prefers simple, clean UI over feature-dense screens.

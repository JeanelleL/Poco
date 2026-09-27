import { isInstalledApp, SERVER_PORT } from './serverUrl';
import { WsPocoClient } from './wsPocoClient';

// The UI only talks to Poco through this interface. The mock logs what it
// would send; a WsPocoClient will later send the same objects as JSON to
// ws://<laptop-ip>:8765.

/**
 * The movements Poco's servos can actually do: the gestures in
 * servos/gestures.py (every one starts and ends at home). The name is what
 * gets sent to the robot.
 */
export type PocoMove =
  // Emotions: one per feeling, always the same
  | 'happy' | 'sad' | 'surprised' | 'worried' | 'calm' | 'tired' | 'shy' | 'frustrated'
  // Basics
  | 'yes' | 'no' | 'curious' | 'look_around' | 'wave_right' | 'wave_left' | 'flap' | 'sway' | 'happy_dance' | 'hello'
  // Social cues
  | 'goodbye' | 'listen' | 'look_there' | 'good_job'
  // Regulation
  | 'breathe';

export interface PocoMoveInfo {
  id: PocoMove;
  label: string;
  /** Feelings and Moments are offered in the tile editor; Basics are used by the app itself. */
  group: 'Feelings' | 'Moments' | 'Basics';
  /** Roughly how long the robot takes, in ms at normal speed (from the step timings in gestures.py). */
  ms: number;
}

export const POCO_MOVES: PocoMoveInfo[] = [
  { id: 'happy', label: 'Happy', group: 'Feelings', ms: 4600 },
  { id: 'sad', label: 'Sad', group: 'Feelings', ms: 8800 },
  { id: 'surprised', label: 'Surprised', group: 'Feelings', ms: 2800 },
  { id: 'worried', label: 'Worried', group: 'Feelings', ms: 6500 },
  { id: 'calm', label: 'Calm', group: 'Feelings', ms: 9500 },
  { id: 'tired', label: 'Tired', group: 'Feelings', ms: 7800 },
  { id: 'shy', label: 'Shy', group: 'Feelings', ms: 6300 },
  { id: 'frustrated', label: 'Frustrated', group: 'Feelings', ms: 5100 },
  { id: 'hello', label: 'Hello', group: 'Moments', ms: 6200 },
  { id: 'goodbye', label: 'Goodbye', group: 'Moments', ms: 4800 },
  { id: 'yes', label: 'Nod yes', group: 'Basics', ms: 2200 },
  { id: 'no', label: 'Shake no', group: 'Basics', ms: 2900 },
  { id: 'curious', label: 'Curious', group: 'Basics', ms: 3700 },
  { id: 'look_around', label: 'Look around', group: 'Basics', ms: 5400 },
  { id: 'listen', label: 'Listen', group: 'Basics', ms: 5900 },
  { id: 'look_there', label: 'Look there', group: 'Basics', ms: 6000 },
  { id: 'wave_right', label: 'Wave right', group: 'Basics', ms: 4400 },
  { id: 'wave_left', label: 'Wave left', group: 'Basics', ms: 4400 },
  { id: 'flap', label: 'Flap', group: 'Basics', ms: 3300 },
  { id: 'sway', label: 'Sway', group: 'Basics', ms: 8900 },
  { id: 'happy_dance', label: 'Happy dance', group: 'Moments', ms: 8600 },
  { id: 'good_job', label: 'Good job', group: 'Moments', ms: 3400 },
  { id: 'breathe', label: 'Breathe', group: 'Moments', ms: 36000 },
];

export function moveInfo(m: PocoMove): PocoMoveInfo {
  return POCO_MOVES.find((x) => x.id === m)!;
}

/**
 * Mix your own: a few steps played in order. In each step any of Poco's parts
 * can do one simple command, all together; a part left out holds still. The
 * robot builds each command from its servos (servos/servo_limits.py):
 * head turret / roll / pitch, each arm's pitch / roll / elbow, and the legs.
 *
 * Everything is in Poco's OWN left/right, like servo_limits.py (look_right =
 * they turn to their right). The UI labels things as you face them, so its "Left
 * flipper" is their rightArm and its "Look left" is look_right.
 */
export type HeadCmd = 'nod' | 'shake' | 'tilt' | 'look_up' | 'look_down' | 'look_left' | 'look_right';
export type ArmCmd = 'up' | 'down' | 'wave' | 'flap' | 'out' | 'bend';
/** Each leg servo lifts its foot (left_foot_up / right_foot_up in gestures.py). */
export type FeetCmd = 'lift_left' | 'lift_right' | 'up_down' | 'alternate';

export interface MoveStep {
  head?: HeadCmd;
  leftArm?: ArmCmd;
  rightArm?: ArmCmd;
  feet?: FeetCmd;
  /** Play the step this many times in a row (default 1). */
  times?: 1 | 2 | 3;
}

export interface MoveMix {
  steps: MoveStep[];
}

export type MixPart = 'head' | 'leftArm' | 'rightArm' | 'feet';

export const MAX_STEPS = 5;
/** One play of a step, in ms at normal speed. Every command starts and ends at rest. */
export const STEP_MS = 2000;

export function mixMs(m: MoveMix): number {
  return m.steps.reduce((ms, s) => ms + STEP_MS * (s.times ?? 1), 0);
}

export function isMix(m: unknown): m is MoveMix {
  return typeof m === 'object' && m !== null && 'steps' in m;
}

/**
 * Turns an earlier save into steps: one { head, leftArm, rightArm, feet } with
 * 'still' for unused parts, or before that { head, arms, feet }.
 */
export function upgradeMix(raw: unknown): MoveMix {
  if (isMix(raw)) {
    // An earlier steps build had rock / step / bounce feet.
    const feet: Record<string, FeetCmd> = { rock: 'alternate', step_left: 'lift_left', step_right: 'lift_right', bounce: 'up_down' };
    return { steps: raw.steps.map((s) => (s.feet && feet[s.feet] ? { ...s, feet: feet[s.feet] } : s)) };
  }
  const old = (raw ?? {}) as Record<string, string | undefined>;
  const arm = (a?: string): ArmCmd | undefined =>
    !a || a === 'still' ? undefined : ['up', 'wave', 'flap'].includes(a) ? (a as ArmCmd) : 'flap';
  const head = old.head === 'look_around' ? 'shake' : old.head;
  return {
    steps: [
      {
        head: head && head !== 'still' ? (head as HeadCmd) : undefined,
        leftArm: arm(old.leftArm ?? old.arms),
        rightArm: arm(old.rightArm ?? old.arms),
        feet: old.feet && old.feet !== 'still' ? 'alternate' : undefined,
      },
    ],
  };
}

/** Extra name the app uses (onboarding's greeting); sent as the robot's "hello". */
export type Gesture = PocoMove | 'wave';

// Older custom tiles and earlier Fun steps saved a body + flipper pair.
// Only the screen used those; the robot gets the closest real movement.
export type BodyMove = 'still' | 'bounce' | 'slump' | 'shake' | 'tremble' | 'jump' | 'sway';
export type FlipperMove = 'rest' | 'flap' | 'droop' | 'stiff' | 'cover' | 'up' | 'wave';

export interface Motion {
  body: BodyMove;
  flippers: FlipperMove;
}

/** A named movement, a mix, or a body + flipper pair (older saves). */
export type Move = Gesture | MoveMix | Motion;

const BODY_TO_ROBOT: Record<BodyMove, PocoMove> = {
  still: 'calm',
  bounce: 'happy',
  slump: 'sad',
  shake: 'frustrated',
  tremble: 'worried',
  jump: 'surprised',
  sway: 'sway',
};

/** The real movement the robot performs for a named move or an older body + flipper pair. */
export function toRobotMove(m: Gesture | Motion): PocoMove {
  if (typeof m !== 'string') return BODY_TO_ROBOT[m.body];
  return m === 'wave' ? 'hello' : m;
}

/** What to send the robot for any move: a named movement, or a mix of parts. */
export function robotMove(m: Move): Pick<PocoAction, 'move' | 'mix'> {
  return isMix(m) ? { mix: m } : { move: toRobotMove(m) };
}
export interface BellyFrame {
  /** The picture's name, when it has one. The robot animates some of these
   *  (the breathing orb grows and shrinks) where the app can only show a still. */
  name?: string;
  pattern: string[]; // 8 strings of 8 chars, '#' lit (the 8x8 belly matrix)
  color: string; // hex
  brightness: number; // 0..1
}

export interface PocoSettings {
  volume: number; // 0..100
  brightness: number; // 0..100
  speed: 'Gentle' | 'Normal' | 'Lively';
  soundEffects: boolean;
  speakAloud: boolean;
}

export interface PocoAction {
  /** One of the robot's real movements (see POCO_MOVES)... */
  move?: PocoMove;
  /** ...or the adult's own steps (see MoveMix). */
  mix?: MoveMix;
  belly?: BellyFrame;
  say?: string;
  /**
   * Count aloud from one to this number, one every COUNT_STEP_MS, each digit
   * on the belly as it is said. The robot runs it rather than the app sending
   * each number: separate lines arrive whenever the voice gets round to them,
   * and a count whose numbers do not match the belly teaches nothing. Sent
   * instead of `say` - the robot speaks the numbers itself.
   */
  count?: number;
}

/** One counted number, spoken and shown. The server mirrors this as COUNT_STEP. */
export const COUNT_STEP_MS = 2000;

/**
 * Something Poco picked up and decided on their own, reported back (Social
 * Mode). The app shows it in the teacher's log: what Poco noticed, what they
 * did, and why.
 */
/** Which job Poco is doing while he listens. */
export type PocoMode = 'social' | 'play';

export interface PocoEvent {
  type: 'noticed';
  /** Built-in emotion id of the person Poco is facing, e.g. "happy". */
  feeling: string;
  /** What Poco said about it, if anything (nothing = stayed quiet, showed it on the belly). */
  said?: string;
  /** Poco's reason for what they did, in plain words, e.g. "A good moment to practice smiling back." */
  why?: string;
  /** ms timestamp */
  at: number;
}

export interface PocoClient {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  applySettings(s: PocoSettings): void;
  perform(action: PocoAction): void;
  /** Cut any gesture or speech short and hold still. */
  stop(): void;
  /**
   * Switch Poco's listening on or off. Poco watches and responds on their own
   * (and decides when to talk).
   *
   * 'social' is Social Mode: Poco faces the person the child is talking WITH
   * and quietly guides the child. Nothing said there is said to Poco.
   * 'play' is Fun Mode's Play with Poco: a one-to-one conversation, where
   * everything is said to him and he always answers.
   * Omitted means 'social', which is what this did before modes existed.
   */
  setInteracting(on: boolean, mode?: PocoMode): void;
  /**
   * Ask Poco for a suggestion now, in Social Mode. He normally waits for a
   * real pause and leaves a gap between suggestions; this skips both. He
   * still will not speak over the person who is talking.
   */
  askForSuggestion(): void;
  /** Background music for a Fun routine. The robot looks up the track by id. */
  setMusic(on: boolean, track?: string): void;
  /** Listen for what Poco reports. Returns an unsubscribe function. */
  onEvent(listener: (e: PocoEvent) => void): () => void;
}

// What the mock pretends Poco says when they notice a feeling, and why. In
// Social Mode Poco faces the person the child is with and guides the child.
const MOCK_SAYS: Record<string, { say: string; why: string }> = {
  happy: { say: 'Your friend looks happy! You could smile back.', why: 'A good moment to practice smiling back.' },
  sad: { say: 'Your friend looks sad. Maybe ask if they are okay.', why: 'Helping the child respond kindly.' },
  angry: { say: "Your friend looks angry. Let's give them some space.", why: 'Keeping things calm and safe.' },
  worried: { say: "Your friend looks worried. You could say it's okay.", why: 'Suggesting a kind word.' },
  surprised: { say: 'Wow, your friend looks surprised!', why: 'Naming the surprise so it feels less confusing.' },
  calm: { say: 'Your friend looks calm.', why: 'Pointing out a calm moment.' },
  neutral: { say: 'Your friend is listening.', why: "Letting the child know it's a good time to talk." },
};
// Why the mock stays quiet instead (it shows the feeling on the belly).
const MOCK_QUIET = [
  'Stayed quiet so the child could lead.',
  'Spoke a moment ago, so waited.',
  'The conversation was going well, so kept out of it.',
];

export class MockPocoClient implements PocoClient {
  private connected = false;
  private listeners = new Set<(e: PocoEvent) => void>();
  private interactTimer: number | undefined;

  connect(): Promise<void> {
    console.debug('[poco] connect: looking for Poco…');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.connected = true;
        console.debug('[poco] connected');
        resolve();
      }, 1600);
    });
  }

  disconnect(): void {
    this.connected = false;
    console.debug('[poco] disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }

  applySettings(s: PocoSettings): void {
    console.debug('[poco] applySettings', s);
  }

  perform(action: PocoAction): void {
    console.debug('[poco] perform', action);
  }

  stop(): void {
    console.debug('[poco] stop');
    this.setInteracting(false);
  }

  // Pretends Poco noticed a feeling every 5–9 s, saying something about it
  // roughly half the time (the real robot filters its own chatter), with a reason either way.
  askForSuggestion(): void {
    console.debug('[poco] askForSuggestion');
  }

  setMusic(on: boolean, track?: string): void {
    console.debug('[poco] setMusic', on, track);
  }

  setInteracting(on: boolean, mode: PocoMode = 'social'): void {
    console.debug('[poco] setInteracting', on, mode);
    window.clearTimeout(this.interactTimer);
    if (!on) return;
    const next = () => {
      this.interactTimer = window.setTimeout(() => {
        const ids = Object.keys(MOCK_SAYS);
        const feeling = ids[Math.floor(Math.random() * ids.length)];
        const speaks = Math.random() < 0.5;
        const event: PocoEvent = speaks
          ? { type: 'noticed', feeling, said: MOCK_SAYS[feeling].say, why: MOCK_SAYS[feeling].why, at: Date.now() }
          : { type: 'noticed', feeling, why: MOCK_QUIET[Math.floor(Math.random() * MOCK_QUIET.length)], at: Date.now() };
        this.listeners.forEach((l) => l(event));
        next();
      }, 5000 + Math.random() * 4000);
    };
    next();
  }

  onEvent(listener: (e: PocoEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * The real Poco when the laptop served this page, the mock otherwise.
 *
 * `npm run dev` (vite on 5173) keeps the mock, so the app can be worked on and
 * demonstrated with no robot and no laptop server. The Python server serves the
 * built app on 8765 and drives the real one. Override with `?real` or `?mock`.
 */
function chooseClient(): PocoClient {
  const q = new URLSearchParams(window.location.search);
  if (q.has('mock')) return new MockPocoClient();
  // Installed as an app there is no port to recognise - it loads from
  // capacitor://localhost - so the wrapper always means the real robot. It is
  // the whole point of installing it, and without this the native build would
  // quietly run the mock.
  const servedByLaptop =
    isInstalledApp() || window.location.port === String(SERVER_PORT);
  if (q.has('real') || servedByLaptop) {
    const real = new WsPocoClient();
    // Connect eagerly so Step6Connect finds it already up; a failure here just
    // means the retry loop keeps trying quietly.
    void real.connect().catch((e) => console.debug('[poco]', e.message));
    return real;
  }
  return new MockPocoClient();
}

export const pocoClient: PocoClient = chooseClient();

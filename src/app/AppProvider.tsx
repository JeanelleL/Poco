import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { Pronouns } from '../onboarding/childProfile';
import { IDLE_PATTERNS, STEP_COUNT, type Step } from '../onboarding/stepMeta';
import { ORANGE, type CustomEmotion } from '../poco/emotions';
import { patternRows, type Pattern, type PatternKey } from '../poco/patterns';
import { pocoClient, toMotion, type Move, type PocoSettings } from '../poco/pocoClient';
import type { Lesson } from '../teaching/lessons';

// v2: step 2 was split in two (7 steps), so v1 step numbers no longer line up.
const STORAGE_KEY = 'poco.onboarding.v2';

export type Role = 'Teacher' | 'Therapist' | 'Parent';
export type Age = '3–5' | '6–8' | '9–12' | '13+';
export type Communication = 'Speaking' | 'Partially verbal' | 'Nonverbal';
export type StartMode = 'Teaching' | 'Interacting' | 'Fun';
export type Connection = 'idle' | 'searching' | 'connected';
/** Where the adult is once setup is done: one of the three modes, or settings. */
export type Screen = StartMode | 'Settings';

/** Belly picture while Poco isn't performing anything on each screen (the mode icons). */
const SCREEN_IDLE: Record<Screen, PatternKey> = {
  Teaching: 'apple',
  Interacting: 'heart',
  Fun: 'note',
  Settings: 'sparkle',
};

/** Poco's resting belly for wherever the adult is right now. */
export function idlePattern(s: AppState): PatternKey {
  return s.completed ? SCREEN_IDLE[s.screen] : IDLE_PATTERNS[s.step];
}

export interface AppState {
  step: Step;
  guide: { name: string; role: Role };
  child: {
    name: string;
    pronouns: Pronouns;
    age: Age;
    communication: Communication;
    /** Free text, e.g. "trains, dinosaurs, Bluey". */
    favorites: string;
    /** Free text, e.g. "deep breaths, quiet corner". */
    calming: string;
    notes: string;
  };
  comfort: PocoSettings;
  customEmotions: CustomEmotion[];
  startMode: StartMode;
  connection: Connection;
  completed: boolean;
  screen: Screen;
  /** Teaching tiles (preset or custom) taken out of the grid. */
  hiddenTiles: string[];
  /** The adult's own lesson plans (presets aren't stored). */
  lessons: Lesson[];
  /** Interacting Mode history, newest first. Feeling names and times only; stays on this iPad. */
  sessions: InteractSession[];
}

/** One Start → Pause of Interacting Mode. */
export interface InteractSession {
  id: string;
  start: number;
  end: number;
  events: { feeling: string; said?: string; at: number }[];
  /** Optional review by the adult afterwards. */
  feedback?: SessionFeedback;
}

export type SessionRating = 'Tough' | 'OK' | 'Great';

export interface SessionFeedback {
  rating?: SessionRating;
  note?: string;
  /** Moments Poco got wrong, by event time: the real feeling id, or 'none' if no one was there. */
  corrections: Record<number, string>;
}

// Keeps local storage small: plenty for weeks of daily sessions.
const MAX_SESSIONS = 60;
const MAX_SESSION_EVENTS = 300;

/** What Poco is showing right now. Not persisted. */
export interface PocoView {
  gesture: Move | null;
  playId: number;
  /** Bumped every time Poco says a line, so saying the same line again still shows. */
  lineId: number;
  /** Bumped by Stop Poco, so anything running on a timer (a dance) knows to end. */
  stopId: number;
  /** null = the current step's idle pattern */
  pattern: Pattern | null;
  /** null = orange */
  color: string | null;
  line: string;
  curious: boolean;
}

interface FullState {
  data: AppState;
  poco: PocoView;
  /** Bumped by the demo reset so step components remount. */
  resetNonce: number;
}

export const DEFAULT_STATE: AppState = {
  step: 1,
  guide: { name: '', role: 'Teacher' },
  child: {
    name: '',
    pronouns: 'they / them',
    age: '6–8',
    communication: 'Speaking',
    favorites: '',
    calming: '',
    notes: '',
  },
  comfort: { volume: 40, brightness: 40, speed: 'Gentle', soundEffects: true, speakAloud: true },
  customEmotions: [],
  startMode: 'Teaching',
  connection: 'idle',
  completed: false,
  screen: 'Teaching',
  hiddenTiles: [],
  lessons: [],
  sessions: [],
};

const INITIAL_POCO: PocoView = {
  gesture: null,
  playId: 0,
  lineId: 0,
  stopId: 0,
  pattern: null,
  color: null,
  line: '',
  curious: false,
};

type Action =
  | { type: 'setStep'; step: Step }
  | { type: 'patchGuide'; patch: Partial<AppState['guide']> }
  | { type: 'patchChild'; patch: Partial<AppState['child']> }
  | { type: 'patchComfort'; patch: Partial<PocoSettings> }
  | { type: 'saveEmotion'; emotion: CustomEmotion }
  | { type: 'removeEmotion'; id: string }
  | { type: 'setHidden'; id: string; hidden: boolean }
  | { type: 'saveLesson'; lesson: Lesson }
  | { type: 'removeLesson'; id: string }
  | { type: 'say'; text: string; pattern?: Pattern; color?: string }
  | { type: 'setStartMode'; mode: StartMode }
  | { type: 'saveSession'; session: InteractSession }
  | { type: 'clearSessions' }
  | { type: 'setFeedback'; id: string; feedback: SessionFeedback }
  | { type: 'setConnection'; connection: Connection }
  | { type: 'complete' }
  | { type: 'restartSetup' }
  | { type: 'setScreen'; screen: Screen }
  | { type: 'reset' }
  | { type: 'play'; gesture: Move; color: string; pattern: Pattern; say?: string }
  | { type: 'pocoIdle'; line?: string }
  | { type: 'stop' }
  | { type: 'showBelly'; pattern: Pattern; color: string }
  | { type: 'setLine'; line: string }
  | { type: 'setCurious'; curious: boolean };

/** Replace the item with the same id, or add it at the end. */
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

function idle(p: PocoView): PocoView {
  return { ...p, gesture: null, pattern: null, color: null, curious: false };
}

function reducer(s: FullState, a: Action): FullState {
  switch (a.type) {
    case 'setStep':
      return { ...s, data: { ...s.data, step: a.step }, poco: idle(s.poco) };
    case 'patchGuide':
      return { ...s, data: { ...s.data, guide: { ...s.data.guide, ...a.patch } } };
    case 'patchChild':
      return { ...s, data: { ...s.data, child: { ...s.data.child, ...a.patch } } };
    case 'patchComfort':
      return { ...s, data: { ...s.data, comfort: { ...s.data.comfort, ...a.patch } } };
    case 'saveEmotion':
      return { ...s, data: { ...s.data, customEmotions: upsert(s.data.customEmotions, a.emotion) } };
    case 'removeEmotion':
      return {
        ...s,
        data: {
          ...s.data,
          customEmotions: s.data.customEmotions.filter((c) => c.id !== a.id),
          hiddenTiles: s.data.hiddenTiles.filter((id) => id !== a.id),
        },
      };
    case 'setHidden': {
      const rest = s.data.hiddenTiles.filter((id) => id !== a.id);
      return { ...s, data: { ...s.data, hiddenTiles: a.hidden ? [...rest, a.id] : rest } };
    }
    case 'saveLesson':
      return { ...s, data: { ...s.data, lessons: upsert(s.data.lessons, a.lesson) } };
    case 'removeLesson':
      return { ...s, data: { ...s.data, lessons: s.data.lessons.filter((l) => l.id !== a.id) } };
    case 'say':
      return {
        ...s,
        poco: {
          ...s.poco,
          gesture: null,
          pattern: a.pattern ?? s.poco.pattern,
          color: a.color ?? s.poco.color,
          line: a.text,
          lineId: s.poco.lineId + 1,
        },
      };
    case 'setStartMode':
      return { ...s, data: { ...s.data, startMode: a.mode } };
    case 'saveSession': {
      const session = { ...a.session, events: a.session.events.slice(-MAX_SESSION_EVENTS) };
      const rest = s.data.sessions.filter((x) => x.id !== session.id);
      return { ...s, data: { ...s.data, sessions: [session, ...rest].slice(0, MAX_SESSIONS) } };
    }
    case 'clearSessions':
      return { ...s, data: { ...s.data, sessions: [] } };
    case 'setFeedback':
      return {
        ...s,
        data: {
          ...s.data,
          sessions: s.data.sessions.map((x) => (x.id === a.id ? { ...x, feedback: a.feedback } : x)),
        },
      };
    case 'setConnection':
      return { ...s, data: { ...s.data, connection: a.connection } };
    case 'complete':
      return { ...s, data: { ...s.data, completed: true, screen: s.data.startMode }, poco: idle(s.poco) };
    case 'restartSetup':
      // Answers stay filled in; only the flow starts over.
      return { ...s, data: { ...s.data, completed: false, step: 1 }, poco: idle(s.poco) };
    case 'setScreen':
      return { ...s, data: { ...s.data, screen: a.screen }, poco: idle(s.poco) };
    case 'reset':
      return { data: DEFAULT_STATE, poco: idle(s.poco), resetNonce: s.resetNonce + 1 };
    case 'play':
      return {
        ...s,
        poco: {
          ...s.poco,
          gesture: a.gesture,
          pattern: a.pattern,
          color: a.color,
          line: a.say ?? s.poco.line,
          playId: s.poco.playId + 1,
          lineId: a.say ? s.poco.lineId + 1 : s.poco.lineId,
        },
      };
    case 'pocoIdle':
      return { ...s, poco: { ...idle(s.poco), curious: s.poco.curious, line: a.line ?? s.poco.line } };
    case 'stop':
      return { ...s, poco: { ...idle(s.poco), line: '', stopId: s.poco.stopId + 1 } };
    case 'showBelly':
      return { ...s, poco: { ...s.poco, gesture: null, pattern: a.pattern, color: a.color } };
    case 'setLine':
      return s.poco.line === a.line ? s : { ...s, poco: { ...s.poco, line: a.line } };
    case 'setCurious':
      return s.poco.curious === a.curious ? s : { ...s, poco: { ...s.poco, curious: a.curious } };
  }
}

function isStep(n: unknown): n is Step {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= STEP_COUNT;
}

/** Merge saved child data over defaults. An earlier build stored favorites/calming as chip arrays. */
function normalizeChild(saved: unknown): AppState['child'] {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const text = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '');
  const child = {
    ...DEFAULT_STATE.child,
    ...(s as Partial<AppState['child']>),
    favorites: text(s.favorites),
    calming: text(s.calming),
  };
  delete (child as Record<string, unknown>).sensitivities;
  return child;
}

function load(): FullState {
  let data = DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>;
      data = {
        ...DEFAULT_STATE,
        ...saved,
        step: isStep(saved.step) ? saved.step : 1,
        guide: { ...DEFAULT_STATE.guide, ...saved.guide },
        child: normalizeChild(saved.child),
        comfort: { ...DEFAULT_STATE.comfort, ...saved.comfort },
        customEmotions: Array.isArray(saved.customEmotions) ? saved.customEmotions : [],
        screen: saved.screen && saved.screen in SCREEN_IDLE ? saved.screen : DEFAULT_STATE.screen,
        hiddenTiles: Array.isArray(saved.hiddenTiles) ? saved.hiddenTiles : [],
        lessons: Array.isArray(saved.lessons) ? saved.lessons : [],
        sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
        connection: 'idle',
      };
    }
  } catch {
    data = DEFAULT_STATE;
  }
  return { data, poco: INITIAL_POCO, resetNonce: 0 };
}

interface AppContextValue {
  state: AppState;
  poco: PocoView;
  resetNonce: number;
  setStep: (step: Step) => void;
  next: () => void;
  back: () => void;
  patchGuide: (patch: Partial<AppState['guide']>) => void;
  patchChild: (patch: Partial<AppState['child']>) => void;
  patchComfort: (patch: Partial<PocoSettings>) => void;
  /** Add a custom tile, or replace the one with the same id. */
  saveEmotion: (emotion: CustomEmotion) => void;
  removeEmotion: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  saveLesson: (lesson: Lesson) => void;
  removeLesson: (id: string) => void;
  /** Poco says a line without a new gesture; optionally changes the belly too. */
  say: (text: string, belly?: { pattern: Pattern; color: string }) => void;
  setStartMode: (mode: StartMode) => void;
  /** Add or update an Interacting session in the history. */
  saveSession: (session: InteractSession) => void;
  clearSessions: () => void;
  /** Save the adult's review of a session (keeps its place in the history). */
  setFeedback: (id: string, feedback: SessionFeedback) => void;
  /** Show in the app what Poco did on his own (Interacting Mode). Nothing is sent to the robot. */
  mirror: (pattern: Pattern, color: string, line?: string) => void;
  /** Resolves true when Poco answered. */
  connect: () => Promise<boolean>;
  complete: () => void;
  /** Back to step 1 of setup, keeping the answers. */
  restartSetup: () => void;
  setScreen: (screen: Screen) => void;
  /** Poco stops moving and talking right away and goes back to his idle belly. */
  stop: () => void;
  reset: () => void;
  /** Gesture + belly + optional line, in one call. Also sent to the robot. */
  play: (gesture: Move, color: string, pattern: Pattern, say?: string) => void;
  /** Show a picture on the belly without a gesture (e.g. live while drawing a face). */
  showBelly: (pattern: Pattern, color: string) => void;
  /** Stop performing and go back to the step's idle belly. */
  resetPoco: (line?: string) => void;
  setLine: (line: string) => void;
  setCurious: (curious: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [full, dispatch] = useReducer(reducer, undefined, load);
  const ref = useRef(full);
  ref.current = full;

  const { data } = full;

  // Persist everything except the live connection.
  useEffect(() => {
    try {
      const toSave: Partial<AppState> = { ...data };
      delete toSave.connection;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      /* storage unavailable (private mode); keep going in memory */
    }
  }, [data]);

  // Keep the real robot's comfort settings in sync once connected.
  useEffect(() => {
    if (data.connection === 'connected') pocoClient.applySettings(data.comfort);
  }, [data.comfort, data.connection]);

  // Step or screen change (or reset) puts the robot's belly back on the idle picture.
  useEffect(() => {
    const d = ref.current.data;
    pocoClient.perform({
      belly: { pattern: patternRows(idlePattern(d)), color: ORANGE, brightness: d.comfort.brightness / 100 },
    });
  }, [data.step, data.screen, data.completed, full.resetNonce]);

  const setStep = useCallback((step: Step) => dispatch({ type: 'setStep', step }), []);
  const next = useCallback(() => {
    const s = ref.current.data.step;
    if (s < STEP_COUNT) dispatch({ type: 'setStep', step: (s + 1) as Step });
  }, []);
  const back = useCallback(() => {
    const s = ref.current.data.step;
    if (s > 1) dispatch({ type: 'setStep', step: (s - 1) as Step });
  }, []);

  const patchGuide = useCallback(
    (patch: Partial<AppState['guide']>) => dispatch({ type: 'patchGuide', patch }),
    [],
  );
  const patchChild = useCallback(
    (patch: Partial<AppState['child']>) => dispatch({ type: 'patchChild', patch }),
    [],
  );
  const patchComfort = useCallback((patch: Partial<PocoSettings>) => dispatch({ type: 'patchComfort', patch }), []);
  const saveEmotion = useCallback((emotion: CustomEmotion) => dispatch({ type: 'saveEmotion', emotion }), []);
  const removeEmotion = useCallback((id: string) => dispatch({ type: 'removeEmotion', id }), []);
  const setHidden = useCallback((id: string, hidden: boolean) => dispatch({ type: 'setHidden', id, hidden }), []);
  const saveLesson = useCallback((lesson: Lesson) => dispatch({ type: 'saveLesson', lesson }), []);
  const removeLesson = useCallback((id: string) => dispatch({ type: 'removeLesson', id }), []);
  const say = useCallback((text: string, belly?: { pattern: Pattern; color: string }) => {
    dispatch({ type: 'say', text, pattern: belly?.pattern, color: belly?.color });
    pocoClient.perform({
      say: text,
      belly: belly && {
        pattern: patternRows(belly.pattern),
        color: belly.color,
        brightness: ref.current.data.comfort.brightness / 100,
      },
    });
  }, []);
  const setStartMode = useCallback((mode: StartMode) => dispatch({ type: 'setStartMode', mode }), []);
  const saveSession = useCallback((session: InteractSession) => dispatch({ type: 'saveSession', session }), []);
  const clearSessions = useCallback(() => dispatch({ type: 'clearSessions' }), []);
  const setFeedback = useCallback(
    (id: string, feedback: SessionFeedback) => dispatch({ type: 'setFeedback', id, feedback }),
    [],
  );
  const mirror = useCallback((pattern: Pattern, color: string, line?: string) => {
    if (line) dispatch({ type: 'say', text: line, pattern, color });
    else dispatch({ type: 'showBelly', pattern, color });
  }, []);
  const complete = useCallback(() => dispatch({ type: 'complete' }), []);
  const restartSetup = useCallback(() => dispatch({ type: 'restartSetup' }), []);
  const setScreen = useCallback((screen: Screen) => dispatch({ type: 'setScreen', screen }), []);

  const connect = useCallback(async () => {
    if (ref.current.data.connection !== 'idle') return ref.current.data.connection === 'connected';
    dispatch({ type: 'setConnection', connection: 'searching' });
    try {
      await pocoClient.connect();
      dispatch({ type: 'setConnection', connection: 'connected' });
      return true;
    } catch (err) {
      console.warn('[poco] connect failed', err);
      dispatch({ type: 'setConnection', connection: 'idle' });
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    pocoClient.disconnect();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    dispatch({ type: 'reset' });
  }, []);

  const play = useCallback((gesture: Move, color: string, pattern: Pattern, say?: string) => {
    dispatch({ type: 'play', gesture, color, pattern, say });
    pocoClient.perform({
      motion: toMotion(gesture),
      belly: { pattern: patternRows(pattern), color, brightness: ref.current.data.comfort.brightness / 100 },
      say,
    });
  }, []);

  const showBelly = useCallback((pattern: Pattern, color: string) => {
    dispatch({ type: 'showBelly', pattern, color });
    pocoClient.perform({
      belly: { pattern: patternRows(pattern), color, brightness: ref.current.data.comfort.brightness / 100 },
    });
  }, []);

  const resetPoco = useCallback((line?: string) => {
    dispatch({ type: 'pocoIdle', line });
    const d = ref.current.data;
    pocoClient.perform({
      belly: { pattern: patternRows(idlePattern(d)), color: ORANGE, brightness: d.comfort.brightness / 100 },
    });
  }, []);

  const stop = useCallback(() => {
    pocoClient.stop();
    dispatch({ type: 'stop' });
    const d = ref.current.data;
    pocoClient.perform({
      belly: { pattern: patternRows(idlePattern(d)), color: ORANGE, brightness: d.comfort.brightness / 100 },
    });
  }, []);

  const setLine = useCallback((line: string) => dispatch({ type: 'setLine', line }), []);
  const setCurious = useCallback((curious: boolean) => dispatch({ type: 'setCurious', curious }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      state: full.data,
      poco: full.poco,
      resetNonce: full.resetNonce,
      setStep,
      next,
      back,
      patchGuide,
      patchChild,
      patchComfort,
      saveEmotion,
      removeEmotion,
      setHidden,
      saveLesson,
      removeLesson,
      say,
      setStartMode,
      saveSession,
      clearSessions,
      setFeedback,
      mirror,
      connect,
      complete,
      restartSetup,
      setScreen,
      stop,
      reset,
      play,
      showBelly,
      resetPoco,
      setLine,
      setCurious,
    }),
    [
      full,
      setStep,
      next,
      back,
      patchGuide,
      patchChild,
      patchComfort,
      saveEmotion,
      removeEmotion,
      setHidden,
      saveLesson,
      removeLesson,
      say,
      setStartMode,
      saveSession,
      clearSessions,
      setFeedback,
      mirror,
      connect,
      complete,
      restartSetup,
      setScreen,
      stop,
      reset,
      play,
      showBelly,
      resetPoco,
      setLine,
      setCurious,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Sets Poco's speech bubble whenever `line` changes. Pass null to leave it alone. */
export function usePocoLine(line: string | null) {
  const { setLine } = useApp();
  useLayoutEffect(() => {
    if (line !== null) setLine(line);
  }, [line, setLine]);
}

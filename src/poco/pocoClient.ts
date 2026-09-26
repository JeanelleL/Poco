// The UI only talks to Poco through this interface. The mock logs what it
// would send; a WsPocoClient will later send the same objects as JSON to
// ws://<laptop-ip>:8765.

export type Gesture = 'happy' | 'sad' | 'angry' | 'scared' | 'surprised' | 'calm' | 'wave';

// Poco's body and flippers are separate motor groups, so any body move can
// play together with any flipper move. Named gestures are shorthand for a pair.
export type BodyMove = 'still' | 'bounce' | 'slump' | 'shake' | 'tremble' | 'jump' | 'sway';
export type FlipperMove = 'rest' | 'flap' | 'droop' | 'stiff' | 'cover' | 'up' | 'wave';

export interface Motion {
  body: BodyMove;
  flippers: FlipperMove;
}

/** A named gesture or a custom body + flipper combination. */
export type Move = Gesture | Motion;

export const GESTURE_MOTION: Record<Gesture, Motion> = {
  happy: { body: 'bounce', flippers: 'flap' },
  sad: { body: 'slump', flippers: 'droop' },
  angry: { body: 'shake', flippers: 'stiff' },
  scared: { body: 'tremble', flippers: 'cover' },
  surprised: { body: 'jump', flippers: 'up' },
  calm: { body: 'sway', flippers: 'rest' },
  wave: { body: 'sway', flippers: 'wave' },
};

export function toMotion(m: Move): Motion {
  return typeof m === 'string' ? GESTURE_MOTION[m] : m;
}

export interface BellyFrame {
  pattern: string[]; // 7 strings of 7 chars, '#' lit
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
  motion?: Motion;
  belly?: BellyFrame;
  say?: string;
}

/** Something Poco did on his own and reports back (Interacting Mode). */
export interface PocoEvent {
  type: 'noticed';
  /** Built-in emotion id, e.g. "happy". */
  feeling: string;
  /** What Poco said about it, if anything. */
  said?: string;
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
  /** Switch Interacting Mode on or off. Poco watches and responds on his own (and decides when to talk). */
  setInteracting(on: boolean): void;
  /** Listen for what Poco reports. Returns an unsubscribe function. */
  onEvent(listener: (e: PocoEvent) => void): () => void;
}

// What the mock pretends Poco says when he notices a feeling.
const MOCK_SAYS: Record<string, string> = {
  happy: 'You look happy!',
  sad: 'Are you feeling sad? I am here.',
  angry: "You look angry. Let's take a deep breath.",
  scared: "Are you scared? It's okay.",
  surprised: 'Wow, you look surprised!',
  calm: 'You look nice and calm.',
};

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
  // roughly half the time (the real robot filters its own chatter).
  setInteracting(on: boolean): void {
    console.debug('[poco] setInteracting', on);
    window.clearTimeout(this.interactTimer);
    if (!on) return;
    const next = () => {
      this.interactTimer = window.setTimeout(() => {
        const ids = Object.keys(MOCK_SAYS);
        const feeling = ids[Math.floor(Math.random() * ids.length)];
        const speaks = Math.random() < 0.5;
        const event: PocoEvent = { type: 'noticed', feeling, said: speaks ? MOCK_SAYS[feeling] : undefined, at: Date.now() };
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

export const pocoClient: PocoClient = new MockPocoClient();

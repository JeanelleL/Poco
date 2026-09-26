import type { PatternKey } from '../poco/patterns';
import type { PocoMove } from '../poco/pocoClient';

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const STEP_COUNT = 7;

export const STEP_LABELS = ['You', 'Child', 'Support', 'Comfort', 'Explore', 'Connect', 'Hello'] as const;

/** Belly picture while Poco isn't performing anything on each step. */
export const IDLE_PATTERNS: Record<Step, PatternKey> = {
  1: 'hi',
  2: 'heart',
  3: 'happy',
  4: 'moon',
  5: 'sparkle',
  6: 'bolt',
  7: 'heart',
};

/** Poco greets each step with a movement (servos/gestures.py names). */
export const STEP_MOVES: Record<Step, PocoMove> = {
  1: 'hello',
  2: 'curious',
  3: 'listen',
  4: 'calm',
  5: 'happy',
  6: 'look_around',
  7: 'hello',
};

export const SPEED_MULTIPLIER = {
  Gentle: 1.6,
  Normal: 1,
  Lively: 0.7,
} as const;

/** Name as it appears in helper text for the adult. */
export function childOrDefault(name: string): string {
  return name.trim() || 'your child';
}

/** Name as Poco says it. */
export function friendOrName(name: string): string {
  return name.trim() || 'friend';
}

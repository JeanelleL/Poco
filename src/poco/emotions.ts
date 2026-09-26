import type { Pattern } from './patterns';
import { upgradeMix, type Gesture, type Motion, type Move, type MoveMix, type PocoMove } from './pocoClient';

/** Poco's default LED color. */
export const ORANGE = '#E8833A';

export interface Emotion {
  id: string;
  label: string;
  /** Screen color. */
  color: string;
  pattern: Pattern;
  gesture: Move;
  /** One of the six shown first (and in onboarding's tour). */
  core?: boolean;
}

// Faces and colors match led_matrix/emotions.py where it has them. Its colors are
// raw LED values; these are the same colors for a screen (gamma 2.2 undone:
// 255 * (led/255)^(1/2.2)), and the robot side turns them back with the same gamma.
// Exception: Neutral is darker on screen than its LED color so it reads on white.
// Calm, Shy and Frustrated aren't in emotions.py (faces are the app's own, padded to 8x8).
//
// `gesture` is the robot movement (POCO_MOVES). Angry, Neutral, Excited and Silly
// don't have their own movement yet, so they use the closest one.
export const EMOTIONS: Emotion[] = [
  { id: 'happy', label: 'Happy', color: '#FFCE00', pattern: 'happy', gesture: 'happy', core: true }, // LED 255,160,0
  { id: 'sad', label: 'Sad', color: '#0084FF', pattern: 'sad', gesture: 'sad', core: true }, // LED 0,60,255
  { id: 'angry', label: 'Angry', color: '#FF0000', pattern: 'angry', gesture: 'frustrated', core: true }, // LED 255,0,0
  { id: 'surprised', label: 'Surprised', color: '#FF00B5', pattern: 'surprised', gesture: 'surprised', core: true }, // LED 255,0,120
  { id: 'neutral', label: 'Neutral', color: '#9E9E96', pattern: 'neutral', gesture: 'calm', core: true }, // LED 150,150,140
  { id: 'calm', label: 'Calm', color: '#3FA36B', pattern: 'calm', gesture: 'calm', core: true },
  { id: 'excited', label: 'Excited', color: '#FF942E', pattern: 'excited', gesture: 'happy' }, // LED 255,77,6
  { id: 'tired', label: 'Tired', color: '#A9C2D4', pattern: 'tired', gesture: 'tired' }, // LED 103,140,170
  { id: 'worried', label: 'Worried', color: '#A177FF', pattern: 'worried', gesture: 'worried' }, // LED 93,48,255
  { id: 'silly', label: 'Silly', color: '#FF84D4', pattern: 'silly', gesture: 'happy' }, // LED 255,60,170
  { id: 'shy', label: 'Shy', color: '#20B2AA', pattern: 'shy', gesture: 'shy' },
  { id: 'frustrated', label: 'Frustrated', color: '#C9582C', pattern: 'frustrated', gesture: 'frustrated' },
];

export const CORE_EMOTIONS = EMOTIONS.filter((e) => e.core);

export const CUSTOM_COLORS = [
  { name: 'Pink', hex: '#E86FA8' },
  { name: 'Teal', hex: '#2BB3B1' },
  { name: 'Yellow', hex: '#F2C230' },
  { name: 'Blue', hex: '#3B7DD8' },
  { name: 'Red', hex: '#D6453D' },
  { name: 'Purple', hex: '#7C5CC4' },
  { name: 'Orange', hex: '#EE8A2C' },
  { name: 'Green', hex: '#3FA36B' },
] as const;

/** A tile the adult made (in onboarding or Teaching). Everything past `pattern` is optional for older saves. */
export interface CustomEmotion {
  id: string;
  label: string;
  color: string;
  /** Belly lights drawn by the adult (8 rows of 8, '#' lit; older saves are 7x7 and get padded). */
  pattern?: string[];
  /** One of Poco's real movements, or 'none'. Earlier builds saved `motion` or `gesture` instead. */
  move?: PocoMove | 'none';
  /** Mix your own: steps of simple commands (earlier builds saved one set of parts; see upgradeMix). */
  mix?: MoveMix;
  motion?: Motion;
  gesture?: Gesture;
  kind?: 'feeling' | 'calm';
  /** What Poco can say when this tile is open. */
  lines?: string[];
  /** Id of the preset tile this one stands in for (an edited preset). */
  replaces?: string;
}

/** A custom tile's movement: null for "No movement", undefined if it never chose one. */
export function customMove(c: CustomEmotion): Move | null | undefined {
  if (c.mix) return upgradeMix(c.mix);
  if (c.move) return c.move === 'none' ? null : c.move;
  return c.motion ?? c.gesture;
}

export function customToEmotion(c: CustomEmotion): Emotion {
  return { id: c.id, label: c.label, color: c.color, pattern: c.pattern ?? 'sparkle', gesture: customMove(c) ?? 'happy' };
}

import type { Pattern } from './patterns';
import type { Gesture, Motion, Move } from './pocoClient';

/** Poco's default LED color. */
export const ORANGE = '#E8833A';

export interface Emotion {
  id: string;
  label: string;
  color: string;
  pattern: Pattern;
  gesture: Move;
}

export const EMOTIONS: Emotion[] = [
  { id: 'happy', label: 'Happy', color: '#F2C230', pattern: 'happy', gesture: 'happy' },
  { id: 'sad', label: 'Sad', color: '#3B7DD8', pattern: 'sad', gesture: 'sad' },
  { id: 'angry', label: 'Angry', color: '#D6453D', pattern: 'angry', gesture: 'angry' },
  { id: 'scared', label: 'Scared', color: '#7C5CC4', pattern: 'scared', gesture: 'scared' },
  { id: 'surprised', label: 'Surprised', color: '#EE8A2C', pattern: 'surprised', gesture: 'surprised' },
  { id: 'calm', label: 'Calm', color: '#3FA36B', pattern: 'calm', gesture: 'calm' },
];

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
  /** Face drawn by the adult (7 rows of 7, '#' lit). Older saves have none. */
  pattern?: string[];
  /** Body + flipper move. Replaces `gesture`, which only earlier builds wrote. */
  motion?: Motion;
  gesture?: Gesture;
  kind?: 'feeling' | 'calm';
  /** What Poco can say when this tile is open. */
  lines?: string[];
  /** Id of the preset tile this one stands in for (an edited preset). */
  replaces?: string;
}

export function customToEmotion(c: CustomEmotion): Emotion {
  return { id: c.id, label: c.label, color: c.color, pattern: c.pattern ?? 'sparkle', gesture: c.motion ?? c.gesture ?? 'happy' };
}

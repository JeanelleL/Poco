// Fun Mode: dance breaks and movement games, as data. Each step is one of
// Poco's real movements (servos/gestures.py) with a belly picture and color.
// A step lasts as long as its movement (POCO_MOVES ms, scaled by the comfort
// speed) unless it sets ms. Timed routines loop their steps until time is up;
// paced ones (Copy Me) wait for the adult to tap Next move.

import type { Pattern, PatternKey } from '../poco/patterns';
import type { PocoMove } from '../poco/pocoClient';

export interface FunStep {
  /** null = hold still (Freeze!). */
  move: PocoMove | null;
  pattern: Pattern;
  color: string;
  say?: string;
  /** Override the step length (ms at normal speed). */
  ms?: number;
}

export interface FunRoutine {
  id: string;
  kind: 'dance' | 'game';
  title: string;
  blurb: string;
  icon: PatternKey;
  color: string;
  /** Timed routines stop after this long. Paced ones (Copy Me) have none. */
  seconds?: number;
  steps: FunStep[];
}

const YELLOW = '#F2C230';
const ORANGE = '#EE8A2C';
const PINK = '#E86FA8';
const TEAL = '#2BB3B1';
const PURPLE = '#7C5CC4';
const BLUE = '#3B7DD8';
const GREEN = '#3FA36B';

const FREEZE: FunStep = { move: null, pattern: 'surprised', color: BLUE, say: 'Freeze!', ms: 3000 };

export const FUN_ROUTINES: FunRoutine[] = [
  {
    id: 'shuffle',
    kind: 'dance',
    title: 'Dance Party!',
    blurb: 'Lets shake, wiggle, and flap our wings!',
    icon: 'rainbow',
    color: YELLOW,
    seconds: 60,
    steps: [
      { move: 'happy_dance', pattern: 'happy', color: YELLOW, say: 'Shuffle, shuffle!' },
      { move: 'flap', pattern: 'note', color: ORANGE },
      { move: 'sway', pattern: 'star', color: ORANGE, say: 'Side to side!' },
      { move: 'happy', pattern: 'happy', color: YELLOW },
    ],
  },
  {
    id: 'wiggles',
    kind: 'dance',
    title: 'Silly Wiggles',
    blurb: 'Wiggle, shake and giggle.',
    icon: 'note',
    color: PINK,
    seconds: 60,
    steps: [
      { move: 'flap', pattern: 'silly', color: PINK, say: 'Wiggle, wiggle!' },
      { move: 'no', pattern: 'sparkle', color: PURPLE, say: 'Shake it out!' },
      { move: 'curious', pattern: 'silly', color: PINK },
      { move: 'happy_dance', pattern: 'happy', color: ORANGE },
    ],
  },
  {
    id: 'party',
    kind: 'dance',
    title: 'Party Lights',
    blurb: 'Poco dances through every color.',
    icon: 'sparkle',
    color: PURPLE,
    seconds: 90,
    steps: [
      { move: 'good_job', pattern: 'star', color: TEAL, say: 'Party time!' },
      { move: 'flap', pattern: 'sparkle', color: PURPLE },
      { move: 'wave_right', pattern: 'heart', color: PINK },
      { move: 'wave_left', pattern: 'note', color: GREEN },
      { move: 'happy_dance', pattern: 'star', color: YELLOW },
    ],
  },
  {
    id: 'calm',
    kind: 'dance',
    title: 'Slow & Calm',
    blurb: 'A gentle cool-down after the fun.',
    icon: 'moon',
    color: GREEN,
    seconds: 60,
    steps: [
      { move: 'calm', pattern: 'calm', color: GREEN, say: 'Slow and gentle…' },
      { move: 'breathe', pattern: 'orb', color: BLUE, say: 'Breathe in with me… and out.' },
      { move: 'calm', pattern: 'heart', color: GREEN, say: 'Nice and calm.' },
    ],
  },
  {
    id: 'freeze',
    kind: 'game',
    title: 'Freeze Dance',
    blurb: 'Dance until Poco says "Freeze!", then hold still.',
    icon: 'star',
    color: BLUE,
    seconds: 90,
    steps: [
      { move: 'happy_dance', pattern: 'happy', color: YELLOW, say: 'Dance!' },
      FREEZE,
      { move: 'flap', pattern: 'excited', color: PINK, say: 'Dance!' },
      { move: 'sway', pattern: 'silly', color: PINK },
      FREEZE,
      { move: 'good_job', pattern: 'star', color: TEAL, say: 'Dance!' },
      FREEZE,
    ],
  },
  {
    id: 'copy',
    kind: 'game',
    title: 'Copy Me',
    blurb: 'Poco does a move. Your turn to copy! Tap Next move when ready.',
    icon: 'hand',
    color: TEAL,
    steps: [
      { move: 'flap', pattern: 'happy', color: YELLOW, say: 'Copy me! Flap your wings!' },
      { move: 'wave_right', pattern: 'hi', color: ORANGE, say: 'Copy me! Wave hello!' },
      { move: 'yes', pattern: 'star', color: TEAL, say: 'Copy me! Nod your head!' },
      { move: 'no', pattern: 'worried', color: PURPLE, say: 'Copy me! Shake your head!' },
      { move: 'curious', pattern: 'surprised', color: PINK, say: 'Copy me! Tilt your head!' },
      { move: 'sway', pattern: 'calm', color: GREEN, say: 'Copy me! Sway side to side!' },
      { move: 'surprised', pattern: 'excited', color: BLUE, say: 'Copy me! Arms up high!' },
    ],
  },
];

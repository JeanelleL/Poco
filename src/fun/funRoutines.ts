// Fun Mode: dance breaks and movement games, as data. Each step is one body +
// flipper move with a belly picture, held for `ms` (scaled by the comfort
// speed). Timed routines loop their steps until time is up; paced ones wait
// for the adult to tap Next.

import type { Pattern, PatternKey } from '../poco/patterns';
import type { Motion } from '../poco/pocoClient';

export interface FunStep {
  motion: Motion;
  pattern: Pattern;
  color: string;
  say?: string;
  ms: number;
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

const m = (body: Motion['body'], flippers: Motion['flippers']): Motion => ({ body, flippers });

const FREEZE: FunStep = { motion: m('still', 'rest'), pattern: 'surprised', color: BLUE, say: 'Freeze!', ms: 3000 };

export const FUN_ROUTINES: FunRoutine[] = [
  {
    id: 'shuffle',
    kind: 'dance',
    title: 'Penguin Shuffle',
    blurb: 'A bouncy warm-up dance.',
    icon: 'note',
    color: YELLOW,
    seconds: 60,
    steps: [
      { motion: m('bounce', 'flap'), pattern: 'happy', color: YELLOW, say: 'Shuffle, shuffle!', ms: 2200 },
      { motion: m('sway', 'wave'), pattern: 'note', color: ORANGE, ms: 2600 },
      { motion: m('jump', 'up'), pattern: 'excited', color: ORANGE, say: 'Jump!', ms: 1600 },
      { motion: m('bounce', 'rest'), pattern: 'star', color: YELLOW, ms: 2000 },
    ],
  },
  {
    id: 'wiggles',
    kind: 'dance',
    title: 'Silly Wiggles',
    blurb: 'Wiggle, shake and giggle.',
    icon: 'silly',
    color: PINK,
    seconds: 60,
    steps: [
      { motion: m('shake', 'flap'), pattern: 'silly', color: PINK, say: 'Wiggle, wiggle!', ms: 1800 },
      { motion: m('tremble', 'wave'), pattern: 'sparkle', color: PURPLE, ms: 2000 },
      { motion: m('bounce', 'flap'), pattern: 'silly', color: PINK, say: 'Shake it out!', ms: 2000 },
      { motion: m('sway', 'up'), pattern: 'happy', color: ORANGE, ms: 2400 },
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
      { motion: m('jump', 'up'), pattern: 'star', color: TEAL, say: 'Party time!', ms: 1600 },
      { motion: m('bounce', 'flap'), pattern: 'sparkle', color: PURPLE, ms: 2000 },
      { motion: m('sway', 'wave'), pattern: 'heart', color: PINK, ms: 2600 },
      { motion: m('shake', 'flap'), pattern: 'note', color: GREEN, ms: 1800 },
      { motion: m('bounce', 'up'), pattern: 'star', color: YELLOW, ms: 2000 },
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
      { motion: m('sway', 'rest'), pattern: 'calm', color: GREEN, say: 'Slow and gentle…', ms: 3600 },
      { motion: m('sway', 'droop'), pattern: 'moon', color: BLUE, say: 'Breathe in…', ms: 3600 },
      { motion: m('still', 'rest'), pattern: 'heart', color: GREEN, say: '…and out.', ms: 3600 },
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
      { motion: m('bounce', 'flap'), pattern: 'happy', color: YELLOW, say: 'Dance!', ms: 2200 },
      { motion: m('sway', 'wave'), pattern: 'note', color: ORANGE, ms: 2600 },
      FREEZE,
      { motion: m('jump', 'up'), pattern: 'excited', color: PINK, say: 'Dance!', ms: 1600 },
      { motion: m('shake', 'flap'), pattern: 'silly', color: PINK, ms: 1800 },
      { motion: m('bounce', 'rest'), pattern: 'star', color: TEAL, ms: 2000 },
      FREEZE,
      { motion: m('bounce', 'flap'), pattern: 'happy', color: YELLOW, say: 'Dance!', ms: 2200 },
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
      { motion: m('bounce', 'flap'), pattern: 'happy', color: YELLOW, say: 'Copy me! Bounce and flap!', ms: 0 },
      { motion: m('still', 'up'), pattern: 'star', color: TEAL, say: 'Copy me! Arms up high!', ms: 0 },
      { motion: m('sway', 'wave'), pattern: 'hi', color: ORANGE, say: 'Copy me! Sway and wave!', ms: 0 },
      { motion: m('tremble', 'cover'), pattern: 'scared', color: PURPLE, say: 'Copy me! Cover your eyes!', ms: 0 },
      { motion: m('jump', 'rest'), pattern: 'excited', color: PINK, say: 'Copy me! Big jump!', ms: 0 },
      { motion: m('slump', 'droop'), pattern: 'tired', color: BLUE, say: 'Copy me! Floppy like a noodle!', ms: 0 },
    ],
  },
];

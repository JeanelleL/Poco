// Teaching tiles: the preset feelings and calm-down tools, plus the adult's own.
// All wording lives here so it can be reviewed and edited without touching the UI.
// Lines are templates filled from the child's profile, never generated on the fly,
// so Poco only ever says something an adult could have read beforehand.

import { useMemo } from 'react';
import { useApp, type AppState } from '../app/AppProvider';
import { calmingPhrase, firstFavorite, objectPronoun } from '../onboarding/childProfile';
import { childOrDefault, friendOrName } from '../onboarding/stepMeta';
import { EMOTIONS, customMove, type CustomEmotion } from '../poco/emotions';
import type { Pattern } from '../poco/patterns';
import type { Move } from '../poco/pocoClient';

export type TileKind = 'feeling' | 'calm';
export type Section = 'core' | 'more' | 'calm' | 'mine';

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'core', label: 'Core feelings' },
  { id: 'more', label: 'More feelings' },
  { id: 'calm', label: 'Calm-down tools' },
  { id: 'mine', label: 'My tiles' },
];

export interface TileLine {
  /** Why Poco would say it, e.g. "Name it". Custom tiles have no groups. */
  group?: string;
  text: string;
  /** A count from one to this, run by the robot in time with the belly (see PocoAction.count). */
  count?: number;
}

export interface Tile {
  id: string;
  label: string;
  kind: TileKind;
  section: Section;
  color: string;
  pattern: Pattern;
  /** Poco's movement (a real robot movement, or a body + flipper pair from older custom tiles); null = no movement. */
  move: Move | null;
  /** For the adult: what this feeling or tool is. */
  about?: string;
  /** For the adult: what it looks like in the body. */
  clues?: string[];
  lines: TileLine[];
  /** The saved tile when the adult made or edited it. */
  custom?: CustomEmotion;
}

/** Profile answers the templates use. */
export interface Ctx {
  /** How Poco says the child's name ("friend" if none). */
  friend: string;
  /** How the adult-facing text names the child ("your child" if none). */
  child: string;
  /** him / her / them */
  obj: string;
  favorite: string | null;
  /** e.g. "take deep breaths" */
  calming: string | null;
}

export function makeCtx(s: AppState): Ctx {
  return {
    friend: friendOrName(s.child.name),
    child: childOrDefault(s.child.name),
    obj: objectPronoun(s.child.pronouns),
    favorite: firstFavorite(s.child.favorites),
    calming: calmingPhrase(s.child.calming),
  };
}

interface Preset {
  id: string;
  label: string;
  section: Exclude<Section, 'mine'>;
  color: string;
  pattern: Pattern;
  gesture: Move;
  about: string;
  clues?: string[];
  lines: (c: Ctx) => TileLine[];
}

// Face, color and movement come from the shared feelings list (poco/emotions.ts).
const core = (id: string) => {
  const { core: _, ...e } = EMOTIONS.find((x) => x.id === id)!;
  return e;
};

/** Feelings follow one teaching order: name it, notice it, why, what helps, ask. */
const feeling = (name: string, notice: string, why: string, help: string | null, ask: string): TileLine[] => [
  { group: 'Name it', text: name },
  { group: 'Notice it', text: notice },
  { group: 'Why', text: why },
  ...(help ? [{ group: 'What helps', text: help }] : []),
  { group: 'Ask', text: ask },
];

/** Calm-down tools are a short guided routine. */
const routine = (start: string, guide: string[], finish: string): TileLine[] => [
  { group: 'Start', text: start },
  ...guide.map((text) => ({ group: 'Guide', text })),
  { group: 'Finish', text: finish },
];

const PRESETS: Preset[] = [
  /* ---------- Core feelings ---------- */
  {
    ...core('happy'),
    section: 'core',
    about: 'Happy is a warm, light feeling when something is good.',
    clues: ['Big smile', 'Bouncy body', 'Bright eyes'],
    lines: (c) =>
      feeling(
        'This is me feeling happy!',
        "When I'm happy, I smile and bounce.",
        c.favorite ? `I feel happy when I think about ${c.favorite}.` : 'I feel happy when I play with friends.',
        null,
        `What makes you happy, ${c.friend}?`,
      ),
  },
  {
    ...core('sad'),
    section: 'core',
    about: 'Sad is a heavy feeling when we lose something or miss someone.',
    clues: ['Frown', 'Droopy body', 'Quiet voice or tears'],
    lines: (c) =>
      feeling(
        'This is me feeling sad.',
        "When I'm sad, my body feels heavy and slow.",
        'I feel sad when my friend has to go home.',
        c.calming ? `When I feel sad, I ${c.calming}.` : 'When I feel sad, a hug can help.',
        `What makes you feel sad, ${c.friend}?`,
      ),
  },
  {
    ...core('angry'),
    section: 'core',
    about: 'Angry is a big, hot feeling when something feels unfair.',
    clues: ['Hot face', 'Tight fists', 'Loud voice'],
    lines: (c) =>
      feeling(
        'This is me feeling angry.',
        "When I'm angry, my face feels hot.",
        'I feel angry when my tower falls down.',
        c.calming ? `I ${c.calming} to feel better.` : 'I take deep breaths to feel better.',
        `What makes you feel angry, ${c.friend}?`,
      ),
  },
  {
    ...core('surprised'),
    section: 'core',
    about: 'Surprised is a quick feeling when something unexpected happens.',
    clues: ['Big round eyes', 'Open mouth', 'Jumping back'],
    lines: (c) =>
      feeling(
        'Oh! This is me feeling surprised!',
        "When I'm surprised, my eyes get big.",
        'A surprise party makes me feel surprised.',
        null,
        `Has something surprised you, ${c.friend}?`,
      ),
  },
  {
    ...core('neutral'),
    section: 'core',
    about: 'Neutral is a steady, okay feeling: not very happy and not very sad.',
    clues: ['Relaxed face', 'Small smile', 'Easy breathing'],
    lines: (c) =>
      feeling(
        'This is me feeling okay.',
        'When I feel neutral, my face is relaxed.',
        'I feel okay on a normal, quiet day.',
        null,
        `How are you feeling right now, ${c.friend}?`,
      ),
  },
  {
    ...core('calm'),
    section: 'core',
    about: 'Calm is a quiet, slow feeling when the body is relaxed.',
    clues: ['Soft face', 'Slow breathing', 'Still body'],
    lines: (c) =>
      feeling(
        'This is me feeling calm.',
        "When I'm calm, I breathe slowly.",
        'I feel calm when it is quiet.',
        null,
        `When do you feel calm, ${c.friend}?`,
      ),
  },

  /* ---------- More feelings ---------- */
  {
    ...core('excited'),
    section: 'more',
    about: 'Excited is a buzzy, happy feeling about something coming soon.',
    clues: ["Can't sit still", 'Big smile', 'Fast talking'],
    lines: (c) =>
      feeling(
        'This is me feeling excited!',
        "When I'm excited, I want to jump!",
        c.favorite ? `I get excited about ${c.favorite}!` : 'I get excited before my birthday.',
        null,
        `What makes you excited, ${c.friend}?`,
      ),
  },
  {
    ...core('tired'),
    section: 'more',
    about: 'Tired is when the body needs rest or sleep.',
    clues: ['Yawning', 'Heavy eyes', 'Slow body'],
    lines: (c) =>
      feeling(
        'This is me feeling tired.',
        "When I'm tired, I yawn.",
        'I feel tired after a long day.',
        "When I'm tired, I rest.",
        `Do you feel tired, ${c.friend}?`,
      ),
  },
  {
    ...core('worried'),
    section: 'more',
    about: 'Worried is a tight feeling when we think something bad might happen.',
    clues: ['Tummy ache', 'Wrinkled forehead', 'Lots of questions'],
    lines: (c) =>
      feeling(
        'This is me feeling worried.',
        "When I'm worried, my tummy feels tight.",
        'I feel worried before something new.',
        c.calming ? `When I'm worried, I ${c.calming}.` : "When I'm worried, I talk to a grown-up.",
        `What makes you worried, ${c.friend}?`,
      ),
  },
  {
    ...core('silly'),
    section: 'more',
    about: 'Silly is a playful feeling when we want to laugh and be funny.',
    clues: ['Giggles', 'Funny faces', 'Wiggly body'],
    lines: (c) =>
      feeling(
        'This is me feeling silly!',
        "When I'm silly, I make funny faces.",
        'Funny jokes make me feel silly.',
        null,
        `Can you make a silly face, ${c.friend}?`,
      ),
  },

  {
    ...core('shy'),
    section: 'more',
    about: 'Shy is feeling unsure around new people or places.',
    clues: ['Looking down', 'Quiet voice', 'Hiding'],
    lines: (c) =>
      feeling(
        'This is me feeling shy.',
        "When I'm shy, I look down.",
        'I feel shy when I meet someone new.',
        "It's okay to go slow when I feel shy.",
        `Do you ever feel shy, ${c.friend}?`,
      ),
  },
  {
    ...core('frustrated'),
    section: 'more',
    about: "Frustrated is when something is hard and doesn't work yet.",
    clues: ['Groaning', 'Tense hands', 'Wanting to give up'],
    lines: (c) =>
      feeling(
        'This is me feeling frustrated.',
        "When I'm frustrated, my hands feel tight.",
        "I feel frustrated when my puzzle won't fit.",
        c.calming ? `I ${c.calming}, then I try again.` : 'I take a break, then I try again.',
        `What feels hard for you, ${c.friend}?`,
      ),
  },
  /* ---------- Calm-down tools ---------- */
  {
    id: 'breaths',
    label: 'Deep breaths',
    section: 'calm',
    color: '#3F8CFF', // led_matrix breathe orb, between its center (60,150,255) and edge (0,40,255)
    pattern: 'orb',
    gesture: 'breathe',
    about: 'Slow breathing calms the body. Breathe in like filling a balloon, then let it out slowly.',
    lines: (c) =>
      routine(
        "Let's take deep breaths together.",
        ['Breathe in, like filling a balloon…', 'And blow it out slowly…', 'One more time. In… and out…'],
        `Great breathing, ${c.friend}! I feel calmer.`,
      ),
  },
  {
    id: 'count',
    label: 'Count to five',
    section: 'calm',
    color: '#00D4B5', // led_matrix count teal, LED 0,170,120
    pattern: 'five',
    gesture: 'calm',
    about: 'Counting slowly gives the body time to settle before acting.',
    // One line, not two: the robot counts all five itself, each number on the
    // belly as it is said, at a steady pace. Split across lines, every number's
    // timing depended on when the voice got round to it.
    lines: () => [
      { group: 'Start', text: "Let's count to five together." },
      { group: 'Guide', text: 'One… two… three… four… five.', count: 5 },
      { group: 'Finish', text: 'I feel calmer now.' },
    ],
  },
  {
    id: 'quiet',
    label: 'Quiet time',
    section: 'calm',
    color: '#8E6EE9', // led_matrix quiet moon, LED 70,40,210
    pattern: 'moon',
    gesture: 'calm',
    about: 'A short break somewhere quiet helps when there is too much noise or busyness.',
    lines: (c) =>
      routine(
        'I need some quiet time.',
        ["Let's go somewhere calm.", 'We can rest and be still.'],
        `I'm ready when you are, ${c.friend}.`,
      ),
  },
  {
    id: 'help',
    label: 'Ask for help',
    section: 'calm',
    color: '#E0A82E',
    pattern: 'question',
    gesture: 'wave_right',
    about: 'Asking a grown-up is always a good choice when something feels too big.',
    lines: (c) =>
      routine(
        'When something is too hard, I ask for help.',
        ['I can say: help please.', 'I can point or tap too.'],
        `Asking for help is brave, ${c.friend}!`,
      ),
  },
];

/** Starter lines, only when the adult taps Suggest some lines in the editor. */
export function defaultLines(label: string, kind: TileKind, c: Ctx): string[] {
  const l = label.trim().toLowerCase() || 'this';
  return kind === 'calm'
    ? [`Let's try this together: ${l}.`, `Great job, ${c.friend}! I feel calmer.`]
    : [`This is me feeling ${l}.`, `What makes you feel ${l}, ${c.friend}?`];
}

function fromCustom(c: CustomEmotion, section: Section, base?: Tile): Tile {
  const kind = c.kind ?? base?.kind ?? 'feeling';
  const own = customMove(c);
  return {
    id: c.id,
    label: c.label,
    kind,
    section,
    color: c.color,
    pattern: c.pattern ?? base?.pattern ?? 'sparkle',
    // A tile that never chose a movement keeps the preset's (or Happy for older custom tiles).
    move: own === undefined ? base?.move ?? 'happy' : own,
    about: base?.about,
    clues: base?.clues,
    // No auto-filled lines: a custom tile says only what the adult wrote.
    lines: (c.lines ?? []).map((text) => ({ text })),
    custom: c,
  };
}

/** Every tile in grid order. Edited presets take the preset's place. */
export function buildTiles(s: AppState): Tile[] {
  const ctx = makeCtx(s);
  const edits = new Map(s.customEmotions.filter((c) => c.replaces).map((c) => [c.replaces!, c]));
  const presets = PRESETS.map((p): Tile => {
    const { gesture, lines, ...rest } = p;
    const tile: Tile = { ...rest, move: gesture, kind: p.section === 'calm' ? 'calm' : 'feeling', lines: lines(ctx) };
    const edit = edits.get(p.id);
    return edit ? fromCustom(edit, p.section, tile) : tile;
  });
  // Edits of presets that no longer exist (e.g. an edited "Proud") become the adult's own tiles.
  const presetIds = new Set(PRESETS.map((p) => p.id));
  const mine = s.customEmotions
    .filter((c) => !c.replaces || !presetIds.has(c.replaces))
    .map((c) => fromCustom(c, 'mine'));
  return [...presets, ...mine];
}

/** The preset a tile id refers to, for "Reset to original". */
export function presetFor(id: string): string | undefined {
  return PRESETS.find((p) => p.id === id)?.id;
}

export function useTiles() {
  const { state } = useApp();
  return useMemo(() => {
    const all = buildTiles(state);
    const hidden = new Set(state.hiddenTiles);
    return {
      all,
      visible: all.filter((t) => !hidden.has(t.id)),
      hidden: all.filter((t) => hidden.has(t.id)),
      byId: (id: string) => all.find((t) => t.id === id || t.custom?.replaces === id),
    };
  }, [state]);
}

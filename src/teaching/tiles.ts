// Teaching tiles: the preset feelings and calm-down tools, plus the adult's own.
// All wording lives here so it can be reviewed and edited without touching the UI.
// Lines are templates filled from the child's profile, never generated on the fly,
// so Poco only ever says something an adult could have read beforehand.

import { useMemo } from 'react';
import { useApp, type AppState } from '../app/AppProvider';
import { calmingPhrase, firstFavorite, objectPronoun } from '../onboarding/childProfile';
import { childOrDefault, friendOrName } from '../onboarding/stepMeta';
import { EMOTIONS, type CustomEmotion } from '../poco/emotions';
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
}

export interface Tile {
  id: string;
  label: string;
  kind: TileKind;
  section: Section;
  color: string;
  pattern: Pattern;
  /** A named gesture, or a body + flipper combination for custom tiles. */
  move: Move;
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

const core = (id: string) => EMOTIONS.find((e) => e.id === id)!;

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
    ...core('scared'),
    section: 'core',
    about: 'Scared is a jumpy feeling when something feels new or unsafe.',
    clues: ['Wide eyes', 'Shaky body', 'Fast heartbeat'],
    lines: (c) =>
      feeling(
        'This is me feeling scared.',
        "When I'm scared, my body shakes.",
        'Loud noises can make me feel scared.',
        c.calming ? `When I'm scared, I ${c.calming}.` : "When I'm scared, I ask a grown-up for help.",
        `What makes you feel scared, ${c.friend}?`,
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
    id: 'excited',
    label: 'Excited',
    section: 'more',
    color: '#EE8A2C',
    pattern: 'excited',
    gesture: 'happy',
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
    id: 'proud',
    label: 'Proud',
    section: 'more',
    color: '#2BB3B1',
    pattern: 'proud',
    gesture: 'happy',
    about: 'Proud is a good feeling after working hard or doing something well.',
    clues: ['Standing tall', 'Chin up', 'Smile'],
    lines: (c) =>
      feeling(
        'This is me feeling proud.',
        "When I'm proud, I stand up tall.",
        'I feel proud when I try something hard.',
        null,
        `What are you proud of, ${c.friend}?`,
      ),
  },
  {
    id: 'silly',
    label: 'Silly',
    section: 'more',
    color: '#E86FA8',
    pattern: 'silly',
    gesture: 'happy',
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
    id: 'loving',
    label: 'Loving',
    section: 'more',
    color: '#E0527A',
    pattern: 'loving',
    gesture: 'calm',
    about: 'Loving is a warm feeling for people and things we care about.',
    clues: ['Soft smile', 'Wanting a hug', 'Warm chest'],
    lines: (c) =>
      feeling(
        'This is me feeling loving.',
        'When I feel loving, I want a hug.',
        'I feel loving with my family.',
        null,
        `Who do you love, ${c.friend}?`,
      ),
  },
  {
    id: 'tired',
    label: 'Tired',
    section: 'more',
    color: '#7A8C99',
    pattern: 'tired',
    gesture: 'sad',
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
    id: 'bored',
    label: 'Bored',
    section: 'more',
    color: '#8A98A1',
    pattern: 'bored',
    gesture: 'sad',
    about: 'Bored is when nothing feels interesting right now.',
    clues: ['Flat face', 'Slumped body', 'Sighing'],
    lines: (c) =>
      feeling(
        'This is me feeling bored.',
        "When I'm bored, I sigh.",
        'Waiting a long time makes me bored.',
        "When I'm bored, I find something new to do.",
        `What do you do when you're bored, ${c.friend}?`,
      ),
  },
  {
    id: 'worried',
    label: 'Worried',
    section: 'more',
    color: '#7C5CC4',
    pattern: 'worried',
    gesture: 'scared',
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
    id: 'frustrated',
    label: 'Frustrated',
    section: 'more',
    color: '#C9582C',
    pattern: 'frustrated',
    gesture: 'angry',
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
  {
    id: 'shy',
    label: 'Shy',
    section: 'more',
    color: '#D77FA1',
    pattern: 'shy',
    gesture: 'scared',
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
    id: 'confused',
    label: 'Confused',
    section: 'more',
    color: '#5A9BD5',
    pattern: 'confused',
    gesture: 'surprised',
    about: "Confused is when something doesn't make sense yet.",
    clues: ['Tilted head', 'Scrunched face', 'Questions'],
    lines: (c) =>
      feeling(
        'This is me feeling confused.',
        "When I'm confused, I tilt my head.",
        'New rules can make me confused.',
        "When I'm confused, I ask a question.",
        `What can we do when we're confused, ${c.friend}?`,
      ),
  },

  /* ---------- Calm-down tools ---------- */
  {
    id: 'breaths',
    label: 'Deep breaths',
    section: 'calm',
    color: '#3FA36B',
    pattern: 'balloon',
    gesture: 'calm',
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
    color: '#2BB3B1',
    pattern: 'five',
    gesture: 'calm',
    about: 'Counting slowly gives the body time to settle before acting.',
    lines: () => routine("Let's count to five together.", ['One… two… three…', 'Four… five.'], 'I feel calmer now.'),
  },
  {
    id: 'squeeze',
    label: 'Squeeze and let go',
    section: 'calm',
    color: '#3B7DD8',
    pattern: 'ball',
    gesture: 'calm',
    about: 'Squeezing the hands tight and then relaxing them lets tension out of the body.',
    lines: () =>
      routine(
        "Let's squeeze our hands tight.",
        ['Squeeze, squeeze, squeeze…', 'Now let go. Floppy hands!'],
        'My body feels softer now.',
      ),
  },
  {
    id: 'quiet',
    label: 'Quiet time',
    section: 'calm',
    color: '#5B6FD8',
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
    pattern: 'hand',
    gesture: 'wave',
    about: 'Asking a grown-up is always a good choice when something feels too big.',
    lines: (c) =>
      routine(
        'When something is too hard, I ask for help.',
        ['I can say: help please.', 'I can point or tap too.'],
        `Asking for help is brave, ${c.friend}!`,
      ),
  },
];

/** Starter lines for a tile the adult makes. */
export function defaultLines(label: string, kind: TileKind, c: Ctx): string[] {
  const l = label.trim().toLowerCase() || 'this';
  return kind === 'calm'
    ? [`Let's try this together: ${l}.`, `Great job, ${c.friend}! I feel calmer.`]
    : [`This is me feeling ${l}.`, `What makes you feel ${l}, ${c.friend}?`];
}

function fromCustom(c: CustomEmotion, ctx: Ctx, section: Section, base?: Tile): Tile {
  const kind = c.kind ?? base?.kind ?? 'feeling';
  return {
    id: c.id,
    label: c.label,
    kind,
    section,
    color: c.color,
    pattern: c.pattern ?? base?.pattern ?? 'sparkle',
    move: c.motion ?? c.gesture ?? base?.move ?? 'happy',
    about: base?.about,
    clues: base?.clues,
    lines: (c.lines ?? defaultLines(c.label, kind, ctx)).map((text) => ({ text })),
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
    return edit ? fromCustom(edit, ctx, p.section, tile) : tile;
  });
  const mine = s.customEmotions.filter((c) => !c.replaces).map((c) => fromCustom(c, ctx, 'mine'));
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

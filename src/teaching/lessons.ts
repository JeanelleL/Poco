// Lesson plans: an ordered list of steps the adult moves through with Next.
// "poco" steps make Poco act out a tile and say a line; "teacher" steps are
// cues only the adult sees (Poco stays still). Presets are templates filled
// from the child's profile, like the tiles.

import { useMemo } from 'react';
import { useApp } from '../app/AppProvider';
import { makeCtx, type Ctx } from './tiles';

export type LessonStep = { kind: 'poco'; tileId: string; text: string } | { kind: 'teacher'; text: string };

export interface Lesson {
  id: string;
  title: string;
  /** What the child practices, shown on the card. */
  goal: string;
  steps: LessonStep[];
  preset?: boolean;
}

const poco = (tileId: string, text: string): LessonStep => ({ kind: 'poco', tileId, text });
const cue = (text: string): LessonStep => ({ kind: 'teacher', text });

function presetLessons(c: Ctx): Lesson[] {
  const waitCue = `Give ${c.child} time to answer. Words, pointing or tapping all count.`;
  return [
    {
      id: 'lesson-meet-happy',
      title: 'Meet Happy',
      goal: 'Name happy and notice what it looks like.',
      steps: [
        poco('happy', `Hi ${c.friend}! Today let's learn about happy.`),
        poco('happy', 'This is my happy face. My belly glows yellow.'),
        cue(`Point to Poco's smile. Ask ${c.child} to show a happy face.`),
        poco('happy', "When I'm happy, I smile and bounce!"),
        poco('happy', c.favorite ? `I feel happy when I think about ${c.favorite}.` : 'I feel happy when I play.'),
        poco('happy', `What makes you happy, ${c.friend}?`),
        cue(waitCue),
        poco('happy', `Thank you for sharing, ${c.friend}!`),
      ],
    },
    {
      id: 'lesson-happy-or-sad',
      title: 'Happy or Sad?',
      goal: 'Tell happy and sad faces apart.',
      steps: [
        poco('calm', "Let's play a game. Is my face happy or sad?"),
        poco('happy', 'Look at my face. How do I feel?'),
        cue(waitCue),
        poco('happy', 'Yes! I feel happy.'),
        poco('sad', 'Look again. How do I feel now?'),
        cue(waitCue),
        poco('sad', 'Yes, I feel sad. My belly is blue.'),
        poco('happy', `Great job, ${c.friend}!`),
      ],
    },
    {
      id: 'lesson-angry',
      title: 'When I Feel Angry',
      goal: 'Notice anger and practice a way to calm down.',
      steps: [
        poco('angry', 'This is me feeling angry.'),
        poco('angry', 'My face feels hot and my hands squeeze.'),
        cue(`Ask ${c.child}: what makes you angry?`),
        poco('breaths', c.calming ? `When I'm angry, I ${c.calming}.` : "When I'm angry, I take deep breaths."),
        poco('breaths', 'Breathe in, like filling a balloon…'),
        poco('breaths', 'And blow it out slowly…'),
        poco('calm', 'Now I feel calm. My belly is green.'),
        cue(`Practice together. Praise ${c.child} for trying.`),
      ],
    },
    {
      id: 'lesson-scared',
      title: "It's Okay to Feel Scared",
      goal: 'Name scared and practice asking for help.',
      steps: [
        poco('scared', 'This is me feeling scared.'),
        poco('scared', 'Loud noises can make me feel scared.'),
        cue(`Ask ${c.child}: what feels scary?`),
        poco('help', "When I'm scared, I ask a grown-up for help."),
        poco('help', 'I can say: help please. Or I can point.'),
        cue(`Practice asking for help with ${c.obj}.`),
        poco('calm', 'Now I feel safe and calm.'),
      ],
    },
    {
      id: 'lesson-check-in',
      title: 'Morning Check-in',
      goal: 'Start the day by choosing how we feel.',
      steps: [
        poco('happy', `Good morning, ${c.friend}!`),
        poco('calm', "Let's check in. How do you feel today?"),
        poco('happy', 'Do you feel happy?'),
        poco('sad', 'Do you feel sad?'),
        poco('tired', 'Do you feel tired?'),
        poco('angry', 'Do you feel angry?'),
        cue(`Let ${c.child} point, say or tap a feeling. Go back to any face to show it again.`),
        poco('calm', `Thank you for telling me, ${c.friend}.`),
      ],
    },
    {
      id: 'lesson-balloon',
      title: 'Balloon Breathing',
      goal: 'Practice slow breathing to calm the body.',
      steps: [
        poco('breaths', "Let's do balloon breathing together."),
        cue(`Sit facing Poco. Model the breathing for ${c.child}.`),
        poco('breaths', 'Breathe in slowly… fill up the balloon.'),
        poco('breaths', 'Now blow it out… slowly…'),
        poco('breaths', "Let's do it again. In…"),
        poco('breaths', 'And out…'),
        poco('calm', `My body feels calm. Great job, ${c.friend}!`),
      ],
    },
  ].map((l) => ({ ...l, preset: true }));
}

/** Presets first, then the adult's own. */
export function useLessons() {
  const { state } = useApp();
  return useMemo(() => {
    const all = [...presetLessons(makeCtx(state)), ...state.lessons];
    return { all, byId: (id: string) => all.find((l) => l.id === id) };
  }, [state]);
}

/** Rough length for the card: about 20 seconds a step. */
export function lessonMinutes(l: Lesson): number {
  return Math.max(1, Math.round((l.steps.length * 20) / 60));
}

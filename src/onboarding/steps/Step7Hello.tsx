import { useEffect, useRef, useState } from 'react';
import { ORANGE } from '../../poco/emotions';
import type { PatternKey } from '../../poco/patterns';
import type { Gesture } from '../../poco/pocoClient';
import { ChunkyButton } from '../../ui/ChunkyButton';
import { useApp, usePocoLine } from '../../app/AppProvider';
import { calmingPhrase, firstFavorite } from '../childProfile';
import { StepHeader } from '../StepHeader';
import { childOrDefault, friendOrName } from '../stepMeta';

const LINE_MS = 3800;

interface ScriptLine {
  text: string;
  gesture: Gesture;
  pattern: PatternKey;
  color: string;
  action: string;
}

type Phase = 'ready' | 'playing' | 'done';

export function Step7Hello() {
  const { state, play, complete } = useApp();
  const [phase, setPhase] = useState<Phase>('ready');
  const [current, setCurrent] = useState(-1);
  const timers = useRef<number[]>([]);

  const child = childOrDefault(state.child.name);
  const friend = friendOrName(state.child.name);
  const pointOrTap = state.child.communication !== 'Speaking';
  const favorite = firstFavorite(state.child.favorites);
  const calming = calmingPhrase(state.child.calming);

  const script: ScriptLine[] = [
    { text: `Hi ${friend}! I'm Poco.`, gesture: 'wave', pattern: 'hi', color: ORANGE, action: 'Waves' },
    {
      text: "I'm a penguin, and I'm learning about feelings too.",
      gesture: 'calm',
      pattern: 'heart',
      color: ORANGE,
      action: 'Sways',
    },
    {
      text: favorite
        ? `When I think about ${favorite}, I feel happy and my belly glows yellow!`
        : 'When I feel happy, my belly glows yellow!',
      gesture: 'happy',
      pattern: 'happy',
      color: '#FFCE00',
      action: 'Happy dance',
    },
    {
      text: calming
        ? `When I feel upset, I ${calming}. Then I feel calm and glow green.`
        : 'When I feel calm, my belly glows green.',
      gesture: 'calm',
      // The whole belly glows green (like emotions.py show_color), matching the words.
      pattern: 'solid',
      color: '#3FA36B',
      action: 'Slow sway',
    },
    {
      text: pointOrTap ? 'You can point or tap to answer me. Ready to play?' : 'Want to learn some feelings with me?',
      gesture: 'wave',
      pattern: 'heart',
      color: ORANGE,
      action: 'Waves',
    },
  ];

  usePocoLine(phase === 'ready' ? `I'm ready to meet ${friend}!` : null);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const start = () => {
    clearTimers();
    setPhase('playing');
    setCurrent(0);
    script.forEach((line, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setCurrent(i);
          play(line.gesture, line.color, line.pattern, line.text);
        }, i * LINE_MS),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setCurrent(script.length);
        setPhase('done');
        // Heart, leading into the heart in the wake-up intro that follows.
        play('happy', ORANGE, 'heart', "That was fun! Let's go learn some feelings.");
      }, script.length * LINE_MS),
    );
  };

  return (
    <>
      <StepHeader
        step={7}
        title={`Say hello to ${child}`}
        helper={`Turn Poco to face ${child}, then tap Start. Poco will introduce themself with this script.`}
      />
      <ol className="script rise d3" aria-label="Poco's hello script">
        {script.map((line, i) => {
          const active = phase === 'playing' && i === current;
          const done = phase !== 'ready' && i < current;
          return (
            <li
              key={i}
              className={`script-row${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
              aria-current={active ? 'true' : undefined}
            >
              <span className="script-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="script-text">{line.text}</span>
              <span className="script-action">{line.action}</span>
            </li>
          );
        })}
      </ol>
      <div className="hello-actions rise d4">
        {phase === 'ready' && (
          <ChunkyButton variant="orange" onClick={start}>
            Start
          </ChunkyButton>
        )}
        {phase === 'playing' && <p className="saying">Poco is saying hello…</p>}
        {phase === 'done' && (
          <>
            <ChunkyButton onClick={complete}>Start using Poco</ChunkyButton>
            <ChunkyButton variant="secondary" onClick={start}>
              Play again
            </ChunkyButton>
          </>
        )}
      </div>
    </>
  );
}

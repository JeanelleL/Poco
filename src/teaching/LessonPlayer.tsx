import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppProvider';
import { friendOrName } from '../onboarding/stepMeta';
import { ORANGE } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { ChunkyButton } from '../ui/ChunkyButton';
import { BackRow, PlayIcon, type Go } from './TeachingScreen';
import { useLessons, type LessonStep } from './lessons';
import { useTiles } from './tiles';

/**
 * Runs a lesson at the adult's pace: nothing advances on a timer. Next moves
 * on, Back and tapping any step jump around, Say again repeats. Teacher cues
 * are shown to the adult only; Poco holds still on them.
 */
export function LessonPlayer({ id, go }: { id: string; go: Go }) {
  const { state, play, say } = useApp();
  const { byId: lessonById } = useLessons();
  const { byId: tileById } = useTiles();
  const lesson = lessonById(id);
  // -1 = not started; steps.length = finished.
  const [current, setCurrent] = useState(-1);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  if (!lesson) {
    return (
      <>
        <BackRow label="All lessons" onBack={() => go({ name: 'lessons' })} />
        <h1 className="headline" tabIndex={-1}>
          This lesson was deleted
        </h1>
      </>
    );
  }

  const steps = lesson.steps;
  const done = current >= steps.length;

  const perform = (step: LessonStep) => {
    if (step.kind === 'teacher') return;
    const tile = tileById(step.tileId);
    if (tile) play(tile.move, tile.color, tile.pattern, step.text);
    else say(step.text);
  };

  const goTo = (i: number) => {
    setCurrent(i);
    if (i < steps.length) perform(steps[i]);
    else play('good_job', ORANGE, 'star', `Great job, ${friendOrName(state.child.name)}!`);
  };

  return (
    <>
      <BackRow label="All lessons" onBack={() => go({ name: 'lessons' })}>
        {lesson.preset ? (
          <button
            type="button"
            className="btn btn-secondary small-btn"
            onClick={() => go({ name: 'build', copyOf: lesson.id })}
          >
            Copy and edit
          </button>
        ) : (
          <button type="button" className="btn btn-secondary small-btn" onClick={() => go({ name: 'build', id: lesson.id })}>
            Edit
          </button>
        )}
      </BackRow>

      <header className="screen-header">
        <p className="eyebrow">{lesson.preset ? 'Ready-made lesson' : 'Your lesson'}</p>
        <h1 className="headline" tabIndex={-1}>
          {lesson.title}
        </h1>
        {lesson.goal && <p className="helper">{lesson.goal}</p>}
      </header>

      <ol ref={listRef} className="lesson-steps" aria-label="Lesson steps">
        {steps.map((s, i) => {
          const tile = s.kind === 'poco' ? tileById(s.tileId) : undefined;
          const status = i === current ? ' is-current' : i < current ? ' is-done' : '';
          return (
            <li key={i}>
              <button
                type="button"
                className={`step-row${s.kind === 'teacher' ? ' is-cue' : ''}${status}`}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                {s.kind === 'poco' ? (
                  <span className="step-led" aria-hidden="true">
                    <LedMatrix pattern={tile?.pattern ?? 'sparkle'} color={tile?.color ?? 'var(--muted)'} size={4} gap={1.5} />
                  </span>
                ) : (
                  <span className="step-you">You</span>
                )}
                <span className="step-text">
                  {s.kind === 'poco' && tile && <span className="sr-only">Poco, {tile.label}: </span>}
                  {s.kind === 'teacher' && <span className="sr-only">Your cue: </span>}
                  {s.text}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="lesson-controls">
        {current === -1 && (
          <ChunkyButton variant="orange" onClick={() => goTo(0)}>
            Start lesson
          </ChunkyButton>
        )}
        {current >= 0 && !done && (
          <>
            <ChunkyButton variant="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>
              Back
            </ChunkyButton>
            <ChunkyButton
              variant="secondary"
              disabled={steps[current].kind === 'teacher'}
              onClick={() => perform(steps[current])}
            >
              <PlayIcon />
              Say again
            </ChunkyButton>
            <span className="editor-actions-gap" />
            <ChunkyButton onClick={() => goTo(current + 1)}>
              {current === steps.length - 1 ? 'Finish' : 'Next'}
            </ChunkyButton>
          </>
        )}
        {done && (
          <>
            <p className="lesson-done">Lesson done!</p>
            <span className="editor-actions-gap" />
            <ChunkyButton variant="secondary" onClick={() => goTo(0)}>
              Play again
            </ChunkyButton>
            <ChunkyButton onClick={() => go({ name: 'lessons' })}>All lessons</ChunkyButton>
          </>
        )}
      </div>
    </>
  );
}

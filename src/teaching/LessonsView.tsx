import type { CSSProperties } from 'react';
import { PlusIcon, type Go } from './TeachingScreen';
import { lessonMinutes, useLessons, type Lesson } from './lessons';
import { useTiles } from './tiles';

export function LessonsView({ go }: { go: Go }) {
  const { all } = useLessons();
  const presets = all.filter((l) => l.preset);
  const mine = all.filter((l) => !l.preset);

  return (
    <>

      {/* The adult's own lessons lead once there are some; until then the presets do. */}
      {mine.length > 0 && <MyLessons mine={mine} go={go} />}
      <section className="tile-section" aria-labelledby="sec-presets">
        <h2 id="sec-presets" className="section-title">
          Ready-made lessons
        </h2>
        <div className="lesson-grid">
          {presets.map((l, i) => (
            <LessonCard key={l.id} lesson={l} index={i} onOpen={() => go({ name: 'play', id: l.id })} />
          ))}
        </div>
      </section>
      {mine.length === 0 && <MyLessons mine={mine} go={go} />}
    </>
  );
}

function MyLessons({ mine, go }: { mine: Lesson[]; go: Go }) {
  return (
    <section className="tile-section" aria-labelledby="sec-mine">
      <h2 id="sec-mine" className="section-title">
        My lessons
      </h2>
      <div className="lesson-grid">
        {mine.map((l, i) => (
          <LessonCard key={l.id} lesson={l} index={i} onOpen={() => go({ name: 'play', id: l.id })} />
        ))}
        <button type="button" className="lesson-card is-new" onClick={() => go({ name: 'build' })}>
          <PlusIcon />
          <span className="lesson-new-title">New lesson</span>
          <span className="lesson-new-hint">
            {mine.length ? 'Plan another one' : 'Start from scratch, or open a ready-made lesson and tap Copy and edit'}
          </span>
        </button>
      </div>
    </section>
  );
}

function LessonCard({ lesson, index, onOpen }: { lesson: Lesson; index: number; onOpen: () => void }) {
  const { byId } = useTiles();
  // One colored dot per feeling or tool the lesson uses, in order of first use.
  const colors = [
    ...new Set(lesson.steps.flatMap((s) => (s.kind === 'poco' ? [byId(s.tileId)?.color ?? 'var(--muted)'] : []))),
  ];
  return (
    <button type="button" className="lesson-card grid-in" style={{ '--i': index } as CSSProperties} onClick={onOpen}>
      <span className="lesson-tag">{lesson.preset ? 'Ready-made' : 'Yours'}</span>
      <span className="lesson-title">{lesson.title}</span>
      {lesson.goal && <span className="lesson-goal">{lesson.goal}</span>}
      <span className="lesson-meta">
        <span className="lesson-dots" aria-hidden="true">
          {colors.slice(0, 6).map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        {lesson.steps.length} steps · about {lessonMinutes(lesson)} min
      </span>
    </button>
  );
}

import { useState } from 'react';
import { useApp } from '../app/AppProvider';
import { childOrDefault } from '../onboarding/stepMeta';
import { LedMatrix } from '../poco/LedMatrix';
import { ChunkyButton } from '../ui/ChunkyButton';
import { ConfirmButton } from '../ui/ConfirmButton';
import { BackRow, PlusIcon, type Go } from './TeachingScreen';
import { CrossIcon } from './TileEditor';
import { useLessons, type Lesson, type LessonStep } from './lessons';
import { useTiles, type Tile } from './tiles';

const MAX_STEPS = 30;

/** Plan a lesson: a name, a goal, and steps that are either Poco lines or cues for the adult. */
export function LessonBuilder({ id, copyOf, go }: { id?: string; copyOf?: string; go: Go }) {
  const { state, saveLesson, removeLesson } = useApp();
  const { byId } = useLessons();
  const { all: allTiles, visible, byId: tileById } = useTiles();
  const editing = id ? byId(id) : undefined;
  const source = editing ?? (copyOf ? byId(copyOf) : undefined);
  const firstTile = visible[0] ?? allTiles[0];
  const cueExample = `e.g. Give ${childOrDefault(state.child.name)} time to answer`;

  const [title, setTitle] = useState(() => (copyOf && source ? `${source.title} (my version)` : source?.title ?? ''));
  const [goal, setGoal] = useState(source?.goal ?? '');
  const [steps, setSteps] = useState<LessonStep[]>(
    () => source?.steps ?? [{ kind: 'poco', tileId: firstTile.id, text: firstTile.lines[0]?.text ?? '' }],
  );
  // Which Poco step has its tile picker open.
  const [picking, setPicking] = useState<number | null>(null);

  const kept = steps.filter((s) => s.text.trim());
  const canSave = !!title.trim() && kept.length > 0;

  const update = (i: number, s: LessonStep) => setSteps((all) => all.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const remove = (i: number) => setSteps((all) => all.filter((_, j) => j !== i));

  const pickTile = (i: number, t: Tile) => {
    const s = steps[i];
    if (s.kind !== 'poco') return;
    // Swap in the new tile's first line unless the adult already wrote their own.
    const old = tileById(s.tileId);
    const keepText = s.text.trim() && s.text !== old?.lines[0]?.text;
    update(i, { kind: 'poco', tileId: t.id, text: keepText ? s.text : t.lines[0]?.text ?? '' });
    setPicking(null);
  };

  const addPoco = () => {
    const last = [...steps].reverse().find((s) => s.kind === 'poco');
    const tile = (last?.kind === 'poco' && tileById(last.tileId)) || firstTile;
    setSteps((all) => [...all, { kind: 'poco', tileId: tile.id, text: '' }]);
  };

  const save = () => {
    if (!canSave) return;
    const lesson: Lesson = {
      id: editing?.id ?? `lesson-${Date.now()}`,
      title: title.trim(),
      goal: goal.trim(),
      steps: kept.map((s) => ({ ...s, text: s.text.trim() })),
    };
    saveLesson(lesson);
    go({ name: 'play', id: lesson.id });
  };

  const back = () => go(source ? { name: 'play', id: source.id } : { name: 'lessons' });

  return (
    <>
      <BackRow label={source ? source.title : 'All lessons'} onBack={back} />
      <header className="screen-header">
        <p className="eyebrow">{editing ? 'Edit lesson' : 'New lesson'}</p>
        <h1 className="headline" tabIndex={-1}>
          {title.trim() || 'Plan a lesson'}
        </h1>
      </header>

      <div className="editor-grid is-even">
        <div className="field">
          <label htmlFor="lesson-title" className="field-label">
            Lesson name
          </label>
          <input
            id="lesson-title"
            className="input"
            type="text"
            placeholder="e.g. Going to lunch"
            maxLength={40}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </div>
        <div className="field">
          <label htmlFor="lesson-goal" className="field-label">
            Goal <span className="field-optional">(optional)</span>
          </label>
          <input
            id="lesson-goal"
            className="input"
            type="text"
            placeholder="e.g. Know what to do when it's loud"
            maxLength={80}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </div>
      </div>

      <h2 className="section-title">Steps</h2>
      <p className="section-hint">
        Poco steps show a tile and say a line. Your cues are reminders only you see; Poco waits on them.
      </p>
      <ol className="build-steps">
        {steps.map((s, i) => {
          const tile = s.kind === 'poco' ? tileById(s.tileId) : undefined;
          return (
            <li key={i} className={`build-step${s.kind === 'teacher' ? ' is-cue' : ''}`}>
              <div className="build-row">
                <span className="line-num">{String(i + 1).padStart(2, '0')}</span>
                {s.kind === 'poco' ? (
                  <button
                    type="button"
                    className="tile-pick"
                    aria-expanded={picking === i}
                    aria-label={`Tile: ${tile?.label ?? 'deleted'}. Change`}
                    onClick={() => setPicking(picking === i ? null : i)}
                  >
                    <LedMatrix pattern={tile?.pattern ?? 'sparkle'} color={tile?.color ?? 'var(--muted)'} size={4} gap={1.5} />
                    <span className="tile-pick-label">{tile?.label ?? 'Deleted tile'}</span>
                    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
                      <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <span className="step-you">Your cue</span>
                )}
                <input
                  className="input line-input"
                  type="text"
                  aria-label={s.kind === 'poco' ? `Step ${i + 1}: what Poco says` : `Step ${i + 1}: your cue`}
                  placeholder={s.kind === 'poco' ? 'What Poco says' : cueExample}
                  maxLength={120}
                  value={s.text}
                  onChange={(e) => update(i, { ...s, text: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
                <div className="build-tools">
                  <button type="button" className="icon-btn" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowIcon up />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowIcon />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => remove(i)}>
                    <CrossIcon />
                  </button>
                </div>
              </div>
              {picking === i && (
                <div className="tile-picker" role="group" aria-label="Choose a tile">
                  {visible.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tile-chip${t.id === tile?.id ? ' is-on' : ''}`}
                      aria-pressed={t.id === tile?.id}
                      onClick={() => pickTile(i, t)}
                    >
                      <LedMatrix pattern={t.pattern} color={t.color} size={3} gap={1} />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {steps.length < MAX_STEPS && (
        <div className="build-add">
          <button type="button" className="add-line" onClick={addPoco}>
            <PlusIcon />
            Poco step
          </button>
          <button
            type="button"
            className="add-line"
            onClick={() => setSteps((all) => [...all, { kind: 'teacher', text: '' }])}
          >
            <PlusIcon />
            Your cue
          </button>
        </div>
      )}

      <div className="editor-actions">
        <ChunkyButton variant="secondary" onClick={back}>
          Cancel
        </ChunkyButton>
        <span className="editor-actions-gap" />
        {editing && (
          <ConfirmButton
            label="Delete lesson"
            confirmLabel="Tap again to delete"
            onConfirm={() => {
              removeLesson(editing.id);
              go({ name: 'lessons' });
            }}
          />
        )}
        <ChunkyButton disabled={!canSave} onClick={save}>
          Save lesson
        </ChunkyButton>
      </div>
    </>
  );
}

function ArrowIcon({ up }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={up ? undefined : { transform: 'rotate(180deg)' }}>
      <path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

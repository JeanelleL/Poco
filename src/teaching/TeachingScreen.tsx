import { useLayoutEffect, useRef, useState } from 'react';
import { FeelingsView } from './FeelingsView';
import { LessonBuilder } from './LessonBuilder';
import { LessonPlayer } from './LessonPlayer';
import { LessonsView } from './LessonsView';
import { TileDetail } from './TileDetail';
import { TileEditor } from './TileEditor';
import { useIndicator } from '../ui/useIndicator';
import './teaching.css';

/**
 * Teaching mode has two lists (Feelings, Lessons) and focused views on top of
 * them. Views aren't saved: after a reload the adult starts from the tiles.
 */
export type View =
  | { name: 'feelings' }
  | { name: 'tile'; id: string }
  | { name: 'editTile'; id?: string }
  | { name: 'lessons' }
  | { name: 'play'; id: string }
  | { name: 'build'; id?: string; copyOf?: string };

export type Go = (view: View) => void;

export function TeachingScreen() {
  const [view, setView] = useState<View>({ name: 'feelings' });
  const rootRef = useRef<HTMLDivElement>(null);

  // Each view starts at the top with focus on its heading.
  useLayoutEffect(() => {
    const root = rootRef.current;
    root?.closest('.shell-body')?.scrollTo(0, 0);
    root?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [view]);

  // One bar for both lists, so its underline can slide between Feelings and Lessons.
  const list = view.name === 'feelings' || view.name === 'lessons' ? view.name : null;

  return (
    <div ref={rootRef} className="teaching">
      {/* Same header as the other modes; focused views (a tile, the editor, a lesson) have their own. */}
      {list && (
        <header className="screen-header">
          <p className="eyebrow">Teaching mode</p>
          <h1 className="headline" tabIndex={-1}>
            Feelings, one tile at a time
          </h1>
          <p className="helper">Tap a tile and Poco shows that feeling with their belly, their color and a movement.</p>
        </header>
      )}
      {list && (
        <TeachBar
          current={list}
          go={setView}
          action={
            list === 'feelings'
              ? { label: 'New tile', onClick: () => setView({ name: 'editTile' }) }
              : { label: 'New lesson', onClick: () => setView({ name: 'build' }) }
          }
        />
      )}
      {view.name === 'feelings' && <FeelingsView go={setView} />}
      {view.name === 'tile' && <TileDetail id={view.id} go={setView} />}
      {view.name === 'editTile' && <TileEditor id={view.id} go={setView} />}
      {view.name === 'lessons' && <LessonsView go={setView} />}
      {view.name === 'play' && <LessonPlayer id={view.id} go={setView} />}
      {view.name === 'build' && <LessonBuilder id={view.id} copyOf={view.copyOf} go={setView} />}
    </div>
  );
}

const LISTS = ['feelings', 'lessons'] as const;

/** Feelings | Lessons switch plus the list's main action, shared by both lists. */
function TeachBar({
  current,
  go,
  action,
}: {
  current: 'feelings' | 'lessons';
  go: Go;
  action: { label: string; onClick: () => void };
}) {
  const line = useIndicator<HTMLDivElement>(LISTS.indexOf(current));
  return (
    <div className="teach-bar">
      <div ref={line.ref} className={`teach-switch${line.ready ? ' has-indicator' : ''}`} role="group" aria-label="Teaching">
        <span className="teach-line" style={line.style} aria-hidden="true" />
        {LISTS.map((v) => (
          <button
            key={v}
            type="button"
            data-tab
            className={`teach-switch-btn${current === v ? ' is-on' : ''}`}
            aria-pressed={current === v}
            onClick={() => go({ name: v })}
          >
            {v === 'feelings' ? 'Feelings' : 'Lessons'}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-secondary teach-add" onClick={action.onClick}>
        <PlusIcon />
        {action.label}
      </button>
    </div>
  );
}

/** "‹ All tiles" row at the top of focused views, with optional actions on the right. */
export function BackRow({ label, onBack, children }: { label: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="back-row">
      <button type="button" className="back-btn" onClick={onBack}>
        <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
          <path d="M10 2 3 9l7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {children && <div className="back-actions">{children}</div>}
    </div>
  );
}

export function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
      <path d="M2 1.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

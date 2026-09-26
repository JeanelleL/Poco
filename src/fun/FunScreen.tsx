import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../app/AppProvider';
import { SPEED_MULTIPLIER, friendOrName } from '../onboarding/stepMeta';
import { ORANGE } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { ChunkyButton } from '../ui/ChunkyButton';
import { FUN_ROUTINES, type FunRoutine, type FunStep } from './funRoutines';
import './fun.css';

/**
 * Tap a dance or game and Poco starts right away. Timed ones loop their moves
 * until time is up; Copy Me waits for the adult's Next move. Stop (here or in
 * the bar at the bottom) ends whatever is playing.
 */
export function FunScreen() {
  const { state, poco, play, stop } = useApp();
  const speed = SPEED_MULTIPLIER[state.comfort.speed];
  const [active, setActive] = useState<{ id: string; runId: number } | null>(null);
  const [move, setMove] = useState(0);
  const loopTimer = useRef<number>();
  const endTimer = useRef<number>();

  const clearTimers = () => {
    window.clearTimeout(loopTimer.current);
    window.clearTimeout(endTimer.current);
  };
  useEffect(() => clearTimers, []);

  // Stop Poco (anywhere) ends the routine too.
  const seenStop = useRef(poco.stopId);
  useEffect(() => {
    if (poco.stopId === seenStop.current) return;
    seenStop.current = poco.stopId;
    clearTimers();
    setActive(null);
  }, [poco.stopId]);

  const perform = (s: FunStep) => play(s.motion, s.color, s.pattern, s.say);

  const start = (r: FunRoutine) => {
    clearTimers();
    setActive({ id: r.id, runId: Date.now() });
    setMove(0);
    if (!r.seconds) {
      perform(r.steps[0]);
      return;
    }
    let i = 0;
    const tick = () => {
      const s = r.steps[i % r.steps.length];
      perform(s);
      i += 1;
      loopTimer.current = window.setTimeout(tick, s.ms * speed);
    };
    tick();
    endTimer.current = window.setTimeout(() => {
      window.clearTimeout(loopTimer.current);
      setActive(null);
      play('happy', ORANGE, 'star', `Great dancing, ${friendOrName(state.child.name)}!`);
    }, r.seconds * 1000);
  };

  const nextMove = (r: FunRoutine) => {
    const i = (move + 1) % r.steps.length;
    setMove(i);
    perform(r.steps[i]);
  };

  const current = active && FUN_ROUTINES.find((r) => r.id === active.id);
  const dances = FUN_ROUTINES.filter((r) => r.kind === 'dance');
  const games = FUN_ROUTINES.filter((r) => r.kind === 'game');

  return (
    <div className="fun">
      <header className="screen-header">
        <p className="eyebrow">Fun mode</p>
        <h1 className="headline" tabIndex={-1}>
          Dance breaks and games
        </h1>
        <p className="helper">Even Poco needs breaks sometimes. Let's have some fun and dance!</p>
      </header>

      {current && active && (
        <section className="fun-now" style={{ '--c': current.color } as CSSProperties} aria-live="polite">
          <div className="fun-icon">
            <LedMatrix key={active.runId} pattern={current.icon} color={current.color} size={8} gap={3} glow scan />
          </div>
          <div className="fun-now-text">
            <p className="fun-now-label">Now playing</p>
            <h2 className="fun-now-title">{current.title}</h2>
            {current.seconds ? (
              <div className="fun-progress" aria-hidden="true">
                <span key={active.runId} style={{ animationDuration: `${current.seconds}s` }} />
              </div>
            ) : (
              <p className="fun-now-hint">
                Move {move + 1} of {current.steps.length}. Tap Next move when {friendOrName(state.child.name)} is ready.
              </p>
            )}
          </div>
          <div className="fun-now-actions">
            {!current.seconds && <ChunkyButton onClick={() => nextMove(current)}>Next move</ChunkyButton>}
            <ChunkyButton variant="secondary" onClick={stop}>
              Stop
            </ChunkyButton>
          </div>
        </section>
      )}

      <FunSection title="Dance breaks" routines={dances} active={active} onStart={start} />
      <FunSection title="Games" routines={games} active={active} onStart={start} />
    </div>
  );
}

function FunSection({
  title,
  routines,
  active,
  onStart,
}: {
  title: string;
  routines: FunRoutine[];
  active: { id: string; runId: number } | null;
  onStart: (r: FunRoutine) => void;
}) {
  return (
    <section className="fun-section">
      <h2 className="fun-section-title">{title}</h2>
      <div className="fun-grid">
        {routines.map((r) => {
          const on = r.id === active?.id;
          return (
            <button
              key={r.id}
              type="button"
              className={`fun-card${on ? ' is-on' : ''}`}
              style={{ '--c': r.color } as CSSProperties}
              aria-pressed={on}
              onClick={() => onStart(r)}
            >
              {on && <span key={active!.runId} className="fun-glow flash" aria-hidden="true" />}
              <span className="fun-icon">
                <LedMatrix pattern={r.icon} color={r.color} size={6} gap={2} />
              </span>
              <span className="fun-card-title">{r.title}</span>
              <span className="fun-card-blurb">{r.blurb}</span>
              <span className="fun-card-meta">
                {on ? 'Playing' : r.seconds ? `${Math.round(r.seconds / 60 * 2) / 2} min` : 'You set the pace'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

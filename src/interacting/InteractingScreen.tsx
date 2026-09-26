import { useEffect, useRef, useState } from 'react';
import { useApp, type InteractSession } from '../app/AppProvider';
import { EMOTIONS, ORANGE } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { pocoClient } from '../poco/pocoClient';
import { ChunkyButton } from '../ui/ChunkyButton';
import { FeedbackForm } from './FeedbackForm';
import { SessionDetail } from './SessionSummary';
import { countFeelings, dayLabel, effectiveEvents, minutesLabel, weeklyTrend } from './sessionStats';
import './interacting.css';

const PAST_SHOWN = 10;
// Very short Start/Pause taps aren't worth keeping in the history.
const MIN_SESSION_MS = 20000;

/**
 * Poco does the watching and responding himself; this screen is his on/off
 * switch, one setting, and what he noticed: this session as feeling bars, and
 * past sessions (saved on this iPad) with a one-line weekly trend. Leaving the
 * screen or Stop Poco pauses him, so he never keeps going unseen.
 */
export function InteractingScreen() {
  const { state, poco, play, showBelly, mirror, saveSession } = useApp();
  const [session, setSession] = useState<InteractSession | null>(null);
  /** Id of the session whose feedback form is open. */
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening or closing the feedback form starts at the top, with focus on its heading.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const root = rootRef.current;
    root?.closest('.shell-body')?.scrollTo(0, 0);
    root?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [reviewing]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const running = !!session;

  const keep = (s: InteractSession) => {
    if (s.events.length || s.end - s.start >= MIN_SESSION_MS) saveSession(s);
  };

  const finish = () => {
    const s = sessionRef.current;
    if (!s) return;
    keep({ ...s, end: Date.now() });
    setSession(null);
  };

  // Tell the robot when interacting starts or stops.
  useEffect(() => {
    pocoClient.setInteracting(running);
  }, [running]);

  // Leaving the screen pauses Poco and saves the session (runs once, on unmount).
  useEffect(
    () => () => {
      pocoClient.setInteracting(false);
      const s = sessionRef.current;
      if (s) keep({ ...s, end: Date.now() });
    },
    [],
  );

  // Record what Poco noticed (saved as it happens) and mirror it in the "Poco says" bar.
  useEffect(() => {
    if (!running) return;
    return pocoClient.onEvent((e) => {
      const s = sessionRef.current;
      if (!s) return;
      const next = { ...s, end: e.at, events: [...s.events, { feeling: e.feeling, said: e.said, at: e.at }] };
      setSession(next);
      saveSession(next);
      const feeling = EMOTIONS.find((x) => x.id === e.feeling);
      if (feeling) mirror(feeling.pattern, feeling.color, e.said);
    });
  }, [running, mirror, saveSession]);

  // Keep the session length current while running.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, [running]);

  // Stop Poco (in the bar) pauses interacting too.
  const seenStop = useRef(poco.stopId);
  useEffect(() => {
    if (poco.stopId === seenStop.current) return;
    seenStop.current = poco.stopId;
    finish();
  }, [poco.stopId]);

  const start = () => {
    const now = Date.now();
    setSession({ id: `session-${now}`, start: now, end: now, events: [] });
    play('wave', ORANGE, 'heart', "I'm watching and listening!");
  };

  const pause = () => {
    finish();
    showBelly('heart', ORANGE);
  };

  // While running, the summary is this session; otherwise the most recent saved one.
  const [latest, ...older] = state.sessions;
  const shown = session ?? latest;
  const past = session ? state.sessions : older;
  const trend = weeklyTrend(state.sessions);
  const reviewSession = reviewing ? state.sessions.find((s) => s.id === reviewing) : undefined;

  if (reviewSession) {
    return (
      <div ref={rootRef} className="interacting">
        <FeedbackForm session={reviewSession} onDone={() => setReviewing(null)} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="interacting">
      <header className="screen-header">
        <p className="eyebrow">Interacting mode</p>
        <h1 className="headline" tabIndex={-1}>
          Poco joins in
        </h1>
        <p className="helper">
          Poco watches faces, listens to voices and responds with his own feelings, words and moves. You just switch him on.
        </p>
      </header>

      <section className={`int-status${running ? ' is-on' : ''}`} aria-live="polite">
        <div className="int-eye" aria-hidden="true">
          <LedMatrix pattern="heart" color={running ? ORANGE : 'var(--muted)'} size={9} gap={3} glow={running} />
        </div>
        <div className="int-status-text">
          <p className="int-status-label">{running ? 'On' : 'Paused'}</p>
          <h2 className="int-status-title">{running ? 'Poco is interacting' : 'Poco is paused'}</h2>
          <p className="int-status-hint">
            {running ? 'Watching, listening and responding…' : 'Tap Start and Poco will join in.'}
          </p>
        </div>
        {running ? (
          <ChunkyButton variant="secondary" onClick={pause}>
            Pause
          </ChunkyButton>
        ) : (
          <ChunkyButton variant="orange" onClick={start}>
            Start
          </ChunkyButton>
        )}
      </section>

      <section className="int-section">
        <div className="int-section-head">
          <h2 className="int-section-title">{session ? 'This session' : 'Last session'}</h2>
          {shown && (
            <p className="int-meta">
              {!session && `${dayLabel(shown.start)} · `}
              {minutesLabel(shown.start, session ? Date.now() : shown.end)} · {shown.events.length} noticed
            </p>
          )}
        </div>
        {shown ? (
          <SessionDetail
            key={shown.id}
            session={shown}
            onFeedback={session ? undefined : () => setReviewing(shown.id)}
            live={!!session}
          />
        ) : (
          <p className="int-empty">Start Poco to see what he notices. Each session is saved on this iPad.</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="int-section">
          <h2 className="int-section-title">Past sessions</h2>
          {trend && <p className="int-trend">{trend}</p>}
          <ul className="past-list">
            {past.slice(0, PAST_SHOWN).map((s) => (
              <PastSession key={s.id} session={s} onFeedback={() => setReviewing(s.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PastSession({ session, onFeedback }: { session: InteractSession; onFeedback: () => void }) {
  const [open, setOpen] = useState(false);
  const top = countFeelings(effectiveEvents(session)).slice(0, 3);
  const rating = session.feedback?.rating;
  return (
    <li className={`past-item${open ? ' is-open' : ''}`}>
      <button type="button" className="past-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="past-when">{dayLabel(session.start)}</span>
        <span className="past-meta">
          {minutesLabel(session.start, session.end)} · {session.events.length} noticed
        </span>
        <span className="past-top">
          {top.map((c) => {
            const e = EMOTIONS.find((x) => x.id === c.feeling);
            return (
              <span key={c.feeling} className="past-chip">
                {e && <LedMatrix pattern={e.pattern} color={e.color} size={3} gap={1} />}
                {e?.label ?? c.feeling} {c.count}
              </span>
            );
          })}
        </span>
        {rating && <span className={`past-rating is-${rating.toLowerCase()}`}>{rating}</span>}
        <svg className="past-caret" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
          <path d="M1.5 1.5 7 7l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="past-detail">
          <SessionDetail session={session} onFeedback={onFeedback} />
        </div>
      )}
    </li>
  );
}

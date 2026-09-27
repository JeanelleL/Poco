import { useEffect, useRef, useState } from 'react';
import { useApp, type InteractSession } from '../app/AppProvider';
import { EMOTIONS, ORANGE } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { pocoClient } from '../poco/pocoClient';
import { ChunkyButton } from '../ui/ChunkyButton';
import { FeedbackForm } from './FeedbackForm';
import { SessionDetail } from './SessionSummary';
import { dayLabel, minutesLabel, notesLabel } from './sessionStats';
import './interacting.css';

const PAST_SHOWN = 10;
// Very short Start/Pause taps aren't worth keeping in the history.
const MIN_SESSION_MS = 20000;

/**
 * Social Mode: Poco faces the person the child is with, reads their face and
 * voice, and guides the child. Poco does that themself; this screen is their
 * on/off switch and quick notes of what they took in, for this session and
 * past ones (saved on this iPad). Leaving the screen or Stop Poco pauses them,
 * so they never keep going unseen.
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
      const next = { ...s, end: e.at, events: [...s.events, { feeling: e.feeling, said: e.said, why: e.why, at: e.at }] };
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
    play('listen', ORANGE, 'heart', "I'm watching and listening!");
  };

  const pause = () => {
    finish();
    showBelly('heart', ORANGE);
  };

  // While running, the summary is this session; otherwise the most recent saved one.
  const [latest, ...older] = state.sessions;
  const shown = session ?? latest;
  // A running session is saved as it goes, so leave it out of the past list.
  const past = session ? state.sessions.filter((s) => s.id !== session.id) : older;
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
        <p className="eyebrow">Social mode</p>
        <h1 className="headline" tabIndex={-1}>
          Poco joins in
        </h1>
        <p className="helper">
          Turn Poco to face the person {state.child.name.trim() || 'your child'} is with. Poco reads their face and voice and helps{' '}
          {state.child.name.trim() || 'your child'} understand how they feel.
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
            {running
              ? 'Watching and listening. He waits for a pause, and says one thing at a time — tap Ask Poco if you want help now.'
              : 'Tap Start and Poco will join in.'}
          </p>
        </div>
        {running && (
          <ChunkyButton onClick={() => pocoClient.askForSuggestion()}>
            Ask Poco
          </ChunkyButton>
        )}
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
              {minutesLabel(shown.start, session ? Date.now() : shown.end)} · {notesLabel(shown.events.length)}
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
          <p className="int-empty">Start Poco to see quick notes of what they notice. Each session is saved on this iPad.</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="int-section">
          <h2 className="int-section-title">Past sessions</h2>
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
  const rating = session.feedback?.rating;
  return (
    <li className={`past-item${open ? ' is-open' : ''}`}>
      <button type="button" className="past-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="past-when">{dayLabel(session.start)}</span>
        <span className="past-meta">
          {minutesLabel(session.start, session.end)} · {notesLabel(session.events.length)}
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

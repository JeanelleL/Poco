import { useState, type CSSProperties } from 'react';
import type { InteractSession } from '../app/AppProvider';
import { EMOTIONS } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { NO_ONE, accuracy, countFeelings, effectiveEvents, type FeelingCount } from './sessionStats';
// .small-btn is shared with Teaching.
import '../teaching/teaching.css';

/**
 * One bar per feeling, in that feeling's belly color. Each row is labeled with
 * the face, name and exact count, so nothing depends on color alone (and no
 * hover is needed on a touch screen).
 */
export function FeelingBars({
  counts,
  label,
  pulse,
}: {
  counts: FeelingCount[];
  label: string;
  /** While Poco is live: the feeling he just noticed, and a counter to replay its glow. */
  pulse?: { feeling: string; n: number };
}) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <ul className="bars" aria-label={label}>
      {counts.map((c) => {
        const e = EMOTIONS.find((x) => x.id === c.feeling);
        return (
          <li key={c.feeling} className="bar-row">
            <span className="bar-name">
              {e && <LedMatrix pattern={e.pattern} color={e.color} size={3.5} gap={1.2} />}
              {e?.label ?? c.feeling}
            </span>
            <span className="bar-track" aria-hidden="true" style={{ '--c': e?.color ?? 'var(--muted)' } as CSSProperties}>
              <span className="bar-fill" style={{ width: `${(c.count / max) * 100}%` }}>
                {pulse?.feeling === c.feeling && <span key={pulse.n} className="bar-glow flash" />}
              </span>
            </span>
            <span className="bar-count">{c.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Went great · Poco was right 8 of 9 · note", or null before any feedback. */
export function feedbackLine(s: InteractSession): string | null {
  if (!s.feedback) return null;
  const parts: string[] = [];
  if (s.feedback.rating) parts.push(s.feedback.rating === 'OK' ? 'Went OK' : `Went ${s.feedback.rating.toLowerCase()}`);
  const acc = accuracy(s);
  if (acc) parts.push(`Poco was right ${acc.right} of ${acc.total}`);
  return parts.join(' · ') || 'Reviewed';
}

/**
 * Feeling bars for one session (with the adult's corrections applied), every
 * moment behind a toggle, and the optional feedback button at the bottom.
 */
export function SessionDetail({
  session,
  onFeedback,
  live = false,
}: {
  session: InteractSession;
  onFeedback?: () => void;
  /** Poco is running: glow the bar of whatever he just noticed. */
  live?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const events = effectiveEvents(session);
  const counts = countFeelings(events);
  const last = events[events.length - 1];
  const pulse = live && last ? { feeling: last.feeling, n: events.length } : undefined;
  const reviewed = feedbackLine(session);
  const fix = session.feedback?.corrections ?? {};

  return (
    <>
      {counts.length ? (
        <FeelingBars counts={counts} label="Feelings noticed" pulse={pulse} />
      ) : (
        <p className="int-empty">Poco didn't notice any feelings yet.</p>
      )}

      {session.events.length > 0 && (
        <button type="button" className="moments-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide moments' : `Show every moment (${session.events.length})`}
        </button>
      )}
      {open && (
        <ol className="int-feed">
          {[...session.events].reverse().map((ev) => {
            const real = fix[ev.at];
            const shown = EMOTIONS.find((x) => x.id === (real ?? ev.feeling));
            const guess = EMOTIONS.find((x) => x.id === ev.feeling);
            return (
              <li key={ev.at} className="int-row" style={{ '--c': shown?.color ?? 'var(--muted)' } as CSSProperties}>
                <span className="int-time">
                  {new Date(ev.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="int-feeling">
                  {shown && <LedMatrix pattern={shown.pattern} color={shown.color} size={4} gap={1.5} />}
                  {real === NO_ONE ? 'No one there' : shown?.label ?? ev.feeling}
                </span>
                <span className={`int-said${ev.said ? '' : ' is-quiet'}`}>
                  {ev.said ? `"${ev.said}"` : 'Showed it on his belly'}
                  {real && <span className="int-fixed"> Poco guessed {guess?.label ?? ev.feeling}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {onFeedback && (
        <div className="feedback-foot">
          {reviewed ? (
            <>
              <p className="feedback-done">
                <CheckIcon />
                {reviewed}
              </p>
              <button type="button" className="moments-toggle" onClick={onFeedback}>
                Edit feedback
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary small-btn" onClick={onFeedback}>
              Give feedback
            </button>
          )}
        </div>
      )}
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

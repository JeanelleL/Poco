import { useState } from 'react';
import type { InteractSession } from '../app/AppProvider';
import { noticedNote } from './sessionStats';
// .small-btn is shared with Teaching.
import '../teaching/teaching.css';

/** Newest notes shown before "Show all". */
const NOTES_SHOWN = 6;

/** "Went great", or null before any feedback. */
export function feedbackLine(s: InteractSession): string | null {
  if (!s.feedback) return null;
  const r = s.feedback.rating;
  return r ? (r === 'OK' ? 'Went OK' : `Went ${r.toLowerCase()}`) : 'Reviewed';
}

interface Note {
  at: number;
  /** What Poco picked up, or a status like "Started watching and listening". */
  noticed: string;
  /** What Poco decided to do. */
  did?: string;
  /** Poco's own words, if they spoke. */
  said?: string;
  /** Why Poco did it, as the robot reports it. */
  why?: string;
}

/**
 * The session as a log of Poco's thinking, newest first, so the teacher can
 * see Poco was working and why they acted: what they noticed, what they
 * decided (speak up, or stay quiet and show it on the belly) and the reason.
 * There are no feeling counts on purpose.
 */
function sessionNotes(s: InteractSession, live: boolean): Note[] {
  const notes: Note[] = [{ at: s.start, noticed: 'Started watching and listening' }];
  s.events.forEach((ev) =>
    notes.push({
      at: ev.at,
      noticed: noticedNote(ev.feeling),
      did: ev.said ? 'Said' : 'Stayed quiet, showed it on their belly',
      said: ev.said,
      why: ev.why,
    }),
  );
  if (!live) notes.push({ at: s.end, noticed: 'Paused' });
  return notes.reverse();
}

/** One session's log, with the optional feedback button at the bottom. */
export function SessionDetail({
  session,
  onFeedback,
  live = false,
}: {
  session: InteractSession;
  onFeedback?: () => void;
  /** Poco is still running, so there's no "Paused" note yet. */
  live?: boolean;
}) {
  const [all, setAll] = useState(false);
  const reviewed = feedbackLine(session);
  const notes = sessionNotes(session, live);
  const shown = all ? notes : notes.slice(0, NOTES_SHOWN);
  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <ol className="int-feed" aria-label="What Poco noticed and decided">
        {shown.map((n, i) => (
          <li key={`${n.at}-${i}`} className={`int-row${n.did ? '' : ' is-status'}`}>
            <span className="int-time">{time(n.at)}</span>
            <span className="int-note">
              <span className="int-noticed">{n.noticed}</span>
              {n.did && (
                <span className="int-did">
                  <span className="int-arrow" aria-hidden="true">
                    &rarr;
                  </span>
                  {n.did}
                  {n.said && <span className="int-said"> "{n.said}"</span>}
                </span>
              )}
              {n.why && <span className="int-why">Why: {n.why}</span>}
            </span>
          </li>
        ))}
      </ol>

      {notes.length > NOTES_SHOWN && (
        <button type="button" className="moments-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${notes.length} notes`}
        </button>
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

import { useState, type CSSProperties } from 'react';
import { useApp, type InteractSession, type SessionRating } from '../app/AppProvider';
import { EMOTIONS } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { ChunkyButton } from '../ui/ChunkyButton';
import { NO_ONE, dayLabel, minutesLabel } from './sessionStats';
// Chips, hints and the Cancel/Save row are shared with Teaching's editors.
import '../teaching/teaching.css';

const RATINGS: SessionRating[] = ['Tough', 'OK', 'Great'];

/**
 * Optional review of one session: how it went, a note, and fixing any moment
 * Poco got wrong. Every moment starts as "right", so a quick review is just
 * a rating and Save.
 */
export function FeedbackForm({ session, onDone }: { session: InteractSession; onDone: () => void }) {
  const { setFeedback } = useApp();
  const [rating, setRating] = useState<SessionRating | undefined>(session.feedback?.rating);
  const [note, setNote] = useState(session.feedback?.note ?? '');
  const [corrections, setCorrections] = useState<Record<number, string>>(session.feedback?.corrections ?? {});

  const correct = (at: number, value: string, guess: string) =>
    setCorrections((all) => {
      const next = { ...all };
      if (value === guess) delete next[at];
      else next[at] = value;
      return next;
    });

  const save = () => {
    setFeedback(session.id, { rating, note: note.trim() || undefined, corrections });
    onDone();
  };

  return (
    <div className="feedback">
      <header className="screen-header">
        <p className="eyebrow">Session feedback</p>
        <h1 className="headline" tabIndex={-1}>
          {dayLabel(session.start)}
        </h1>
        <p className="helper">
          {minutesLabel(session.start, session.end)} · {session.events.length} noticed. Everything here is optional.
        </p>
      </header>

      <section className="int-section">
        <h2 id="rating-label" className="int-section-title">
          How did it go?
        </h2>
        <div className="chips" role="group" aria-labelledby="rating-label">
          {RATINGS.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip rating-chip${rating === r ? ' is-on' : ''}`}
              aria-pressed={rating === r}
              onClick={() => setRating(rating === r ? undefined : r)}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <section className="int-section">
        <label htmlFor="session-note" className="int-section-title">
          Notes
        </label>
        <textarea
          id="session-note"
          className="input feedback-note"
          rows={3}
          maxLength={300}
          placeholder="e.g. Tired after lunch. New aide in the room."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      {session.events.length > 0 && (
        <section className="int-section">
          <h2 className="int-section-title">What Poco logged</h2>
          <p className="section-hint">Each one counts as right. Only change the ones Poco got wrong.</p>
          <ol className="int-feed">
            {session.events.map((ev) => {
              const guess = EMOTIONS.find((x) => x.id === ev.feeling);
              const value = corrections[ev.at] ?? ev.feeling;
              const changed = value !== ev.feeling;
              return (
                <li
                  key={ev.at}
                  className={`int-row review-row${changed ? ' is-changed' : ''}`}
                  style={{ '--c': guess?.color ?? 'var(--muted)' } as CSSProperties}
                >
                  <span className="int-time">
                    {new Date(ev.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="int-feeling">
                    {guess && <LedMatrix pattern={guess.pattern} color={guess.color} size={4} gap={1.5} />}
                    {guess?.label ?? ev.feeling}
                  </span>
                  <span className="int-said is-quiet">{ev.said ? `"${ev.said}"` : 'Showed it on their belly'}</span>
                  <select
                    className="review-select"
                    aria-label={`Was ${guess?.label ?? ev.feeling} right?`}
                    value={value}
                    onChange={(e) => correct(ev.at, e.target.value, ev.feeling)}
                  >
                    <option value={ev.feeling}>Right</option>
                    {EMOTIONS.filter((x) => x.id !== ev.feeling).map((x) => (
                      <option key={x.id} value={x.id}>
                        Actually {x.label.toLowerCase()}
                      </option>
                    ))}
                    <option value={NO_ONE}>No one was there</option>
                  </select>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="editor-actions">
        <ChunkyButton variant="secondary" onClick={onDone}>
          Cancel
        </ChunkyButton>
        <span className="editor-actions-gap" />
        <ChunkyButton onClick={save}>Save feedback</ChunkyButton>
      </div>
    </div>
  );
}

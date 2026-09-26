import { useState } from 'react';
import { useApp, type InteractSession, type SessionRating } from '../app/AppProvider';
import { ChunkyButton } from '../ui/ChunkyButton';
import { dayLabel, minutesLabel, notesLabel } from './sessionStats';
// Chips and the Cancel/Save row are shared with Teaching's editors.
import '../teaching/teaching.css';

const RATINGS: SessionRating[] = ['Tough', 'OK', 'Great'];

/** Optional review of one session: how it went and a note. */
export function FeedbackForm({ session, onDone }: { session: InteractSession; onDone: () => void }) {
  const { setFeedback } = useApp();
  const [rating, setRating] = useState<SessionRating | undefined>(session.feedback?.rating);
  const [note, setNote] = useState(session.feedback?.note ?? '');

  const save = () => {
    setFeedback(session.id, { rating, note: note.trim() || undefined });
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
          {minutesLabel(session.start, session.end)} · {notesLabel(session.events.length)}. Everything here is optional.
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

import { useLayoutEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import './poco.css';

const CHAR_MS = 28;

export function SpeechBubble({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);
  const [popKey, setPopKey] = useState(0);

  // Layout effect so a new line never paints with the old line's progress.
  useLayoutEffect(() => {
    setPopKey((k) => k + 1);
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(id);
    }, CHAR_MS);
    return () => window.clearInterval(id);
  }, [text, reduced]);

  const typing = !reduced && shown < text.length;

  return (
    <div className="bubble-wrap">
      <div key={popKey} className={`bubble${reduced ? '' : ' bubble-pop'}`}>
        <span className="bubble-tail" aria-hidden="true" />
        <p className="bubble-text" aria-hidden="true">
          {text.slice(0, shown)}
          {typing && <span className="caret" />}
          {/* Untyped remainder holds the bubble's final size so it doesn't grow line by line. */}
          <span className="bubble-ghost">{text.slice(shown)}</span>
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {text}
      </p>
    </div>
  );
}

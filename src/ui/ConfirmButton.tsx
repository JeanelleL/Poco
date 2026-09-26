import { useEffect, useRef, useState } from 'react';
import './ui.css';

/** A destructive button that asks for a second tap within 3 s instead of a dialog. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`btn btn-secondary danger-btn${armed ? ' is-armed' : ''}`}
      onClick={() => {
        if (armed) {
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

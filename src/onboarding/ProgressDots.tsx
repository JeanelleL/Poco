import { STEP_LABELS, type Step } from './stepMeta';

export function ProgressDots({ step }: { step: Step }) {
  return (
    <ol className="progress" aria-label="Setup progress">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const status = n < step ? 'done' : n === step ? 'current' : 'upcoming';
        return (
          <li key={label} className={`progress-item is-${status}`} aria-current={n === step ? 'step' : undefined}>
            <span className="progress-num">{String(n).padStart(2, '0')}</span>
            <span className="progress-label">
              {label}
              <span className="sr-only">
                {status === 'done' ? ', done' : status === 'current' ? ', current step' : ''}
              </span>
            </span>
            <span className="progress-dots" aria-hidden="true">
              {Array.from({ length: 9 }, (_, k) => (
                <span key={k} />
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

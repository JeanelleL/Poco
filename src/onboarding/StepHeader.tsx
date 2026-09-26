import type { ReactNode } from 'react';
import { STEP_COUNT } from './stepMeta';

interface StepHeaderProps {
  step: number;
  title: string;
  helper: ReactNode;
}

export function StepHeader({ step, title, helper }: StepHeaderProps) {
  return (
    <header className="step-header">
      <p className="eyebrow rise">
        Step {step} of {STEP_COUNT}
      </p>
      <h1 className="headline rise d1" tabIndex={-1}>
        {title}
      </h1>
      <p className="helper rise d2">{helper}</p>
    </header>
  );
}

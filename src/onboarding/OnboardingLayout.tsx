import { useEffect, useRef, type ComponentType, type FocusEvent, type FormEvent } from 'react';
import { useApp } from '../app/AppProvider';
import { PocoStage } from '../app/PocoStage';
import { ChunkyButton } from '../ui/ChunkyButton';
import { ProgressDots } from './ProgressDots';
import { STEP_COUNT } from './stepMeta';
import { Step1You } from './steps/Step1You';
import { Step2Child } from './steps/Step2Child';
import { Step3Support } from './steps/Step3Support';
import { Step4Comfort } from './steps/Step4Comfort';
import { Step5TryPoco } from './steps/Step5TryPoco';
import { Step6Connect } from './steps/Step6Connect';
import { Step7Hello } from './steps/Step7Hello';
import './steps/steps.css';

const STEPS: ComponentType[] = [
  Step1You,
  Step2Child,
  Step3Support,
  Step4Comfort,
  Step5TryPoco,
  Step6Connect,
  Step7Hello,
];

export function OnboardingLayout() {
  const { state, resetNonce, next, back } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const StepComponent = STEPS[state.step - 1];

  const canContinue =
    state.step === 1
      ? state.guide.name.trim() !== ''
      : state.step === 2
        ? state.child.name.trim() !== ''
        : state.step === 6
          ? state.connection === 'connected'
          : true;

  // On step change: scroll to top and move focus to the new headline.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    body.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [state.step]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (state.step < STEP_COUNT && canContinue) next();
  };

  // Keep text fields clear of the iPad keyboard.
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const isText = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text');
    if (!isText) return;
    window.setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  };

  return (
    <div className="app">
      <PocoStage />

      <main className="panel">
        <ProgressDots step={state.step} />
        <form className="panel-form" onSubmit={onSubmit} noValidate>
          <div className="panel-body" ref={bodyRef} onFocus={onFocusIn}>
            <StepComponent key={`${state.step}-${resetNonce}`} />
          </div>
          <footer className="panel-footer">
            {state.step > 1 ? (
              <ChunkyButton variant="secondary" onClick={back}>
                Back
              </ChunkyButton>
            ) : (
              <span />
            )}
            {state.step < STEP_COUNT && (
              <ChunkyButton type="submit" disabled={!canContinue}>
                Continue
              </ChunkyButton>
            )}
          </footer>
        </form>
      </main>
    </div>
  );
}

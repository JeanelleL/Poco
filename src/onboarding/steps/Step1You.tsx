import { PillGroup } from '../../ui/PillGroup';
import { useApp, usePocoLine, type Role } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';

const ROLES: readonly Role[] = ['Teacher', 'Therapist', 'Parent'];

export function Step1You() {
  const { state, patchGuide, setCurious } = useApp();
  usePocoLine("Hi! My name is Poco. What's yours?");

  return (
    <>
      <StepHeader
        step={1}
        title="Hi there!"
        helper="You'll guide Poco from this iPad. Poco will greet you by name."
      />
      <div className="field rise d3">
        <label htmlFor="guide-name" className="field-label">
          Your name
        </label>
        <input
          id="guide-name"
          className="input"
          type="text"
          placeholder="e.g. Ms. Rivera"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={40}
          value={state.guide.name}
          onChange={(e) => patchGuide({ name: e.target.value })}
          onFocus={() => setCurious(true)}
          onBlur={() => setCurious(false)}
        />
      </div>
      <PillGroup
        className="rise d4"
        id="guide-role"
        label="I'm a"
        options={ROLES}
        value={state.guide.role}
        onChange={(role) => patchGuide({ role })}
      />
    </>
  );
}

import { PillGroup } from '../../ui/PillGroup';
import { PRONOUNS } from '../childProfile';
import { useApp, usePocoLine, type Age, type Communication } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';
import { friendOrName } from '../stepMeta';

export const AGES: readonly Age[] = ['3–5', '6–8', '9–12', '13+'];
export const COMMUNICATION: readonly Communication[] = ['Speaking', 'Partially verbal', 'Nonverbal'];

export function Step2Child() {
  const { state, patchChild, setCurious } = useApp();
  const { child } = state;
  usePocoLine(`Nice to meet you, ${friendOrName(state.guide.name)}! Who am I going to meet?`);

  return (
    <>
      <StepHeader
        step={2}
        title="About your child"
        helper="Poco uses this to talk to them the right way. It stays on this iPad."
      />
      <div className="field rise d3">
        <label htmlFor="child-name" className="field-label">
          First name
        </label>
        <input
          id="child-name"
          className="input"
          type="text"
          placeholder="e.g. Maya"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={30}
          value={child.name}
          onChange={(e) => patchChild({ name: e.target.value })}
          onFocus={() => setCurious(true)}
          onBlur={() => setCurious(false)}
        />
      </div>
      <div className="row-2 rise d4">
        <PillGroup
          id="child-pronouns"
          label="Pronouns"
          options={PRONOUNS}
          value={child.pronouns}
          onChange={(pronouns) => patchChild({ pronouns })}
        />
        <PillGroup id="child-age" label="Age" options={AGES} value={child.age} onChange={(age) => patchChild({ age })} />
      </div>
      <PillGroup
        className="rise d5"
        id="child-communication"
        label="How they communicate"
        options={COMMUNICATION}
        value={child.communication}
        onChange={(communication) => patchChild({ communication })}
      />
    </>
  );
}

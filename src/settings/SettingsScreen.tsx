import { useApp } from '../app/AppProvider';
import { PRONOUNS, tagQuestion } from '../onboarding/childProfile';
import { childOrDefault } from '../onboarding/stepMeta';
import { ROLES } from '../onboarding/steps/Step1You';
import { AGES, COMMUNICATION } from '../onboarding/steps/Step2Child';
import { SPEEDS } from '../onboarding/steps/Step4Comfort';
import { ORANGE } from '../poco/emotions';
import { ChunkyButton } from '../ui/ChunkyButton';
import { ConfirmButton } from '../ui/ConfirmButton';
import { PillGroup } from '../ui/PillGroup';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import '../app/shell.css';
// Fields, comfort cards and toggles look the same as in onboarding.
import '../onboarding/steps/steps.css';

/**
 * Everything from setup on one scrolling page, edited in place. Changes save as
 * you go (the same state onboarding writes), so there's no Save button.
 */
export function SettingsScreen() {
  const { state, patchGuide, patchChild, patchComfort, connect, play, restartSetup, clearSessions } = useApp();
  const { guide, child, comfort } = state;
  const childName = childOrDefault(child.name);
  const sessions = state.sessions.length;

  return (
    <div className="settings">
      <header className="screen-header">
        <p className="eyebrow">Profile and settings</p>
        <h1 className="headline" tabIndex={-1}>
          {child.name.trim() ? `${child.name.trim()}'s profile` : 'Profile'}
        </h1>
        <p className="helper">Change anything here. It saves as you go and stays on this iPad.</p>
      </header>

      <section className="settings-block" aria-labelledby="set-child">
        <h2 id="set-child" className="settings-title">
          {child.name.trim() || 'Child'}
        </h2>
        <div className="field">
          <label htmlFor="set-child-name" className="field-label">
            First name
          </label>
          <input
            id="set-child-name"
            className="input"
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={30}
            value={child.name}
            onChange={(e) => patchChild({ name: e.target.value })}
          />
        </div>
        <div className="row-2">
          <PillGroup
            id="set-pronouns"
            label="Pronouns"
            options={PRONOUNS}
            value={child.pronouns}
            onChange={(pronouns) => patchChild({ pronouns })}
          />
          <PillGroup id="set-age" label="Age" options={AGES} value={child.age} onChange={(age) => patchChild({ age })} />
        </div>
        <PillGroup
          id="set-communication"
          label="How they communicate"
          options={COMMUNICATION}
          value={child.communication}
          onChange={(communication) => patchChild({ communication })}
        />
      </section>

      <section className="settings-block" aria-labelledby="set-support">
        <h2 id="set-support" className="settings-title">
          What works for {childName}
        </h2>
        <div className="field">
          <label htmlFor="set-favorites" className="field-label">
            Favorite things
          </label>
          <input
            id="set-favorites"
            className="input"
            type="text"
            placeholder="e.g. tractors, penguins, Bluey"
            autoComplete="off"
            maxLength={80}
            value={child.favorites}
            onChange={(e) => patchChild({ favorites: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="set-calming" className="field-label">
            What helps them calm down
          </label>
          <input
            id="set-calming"
            className="input"
            type="text"
            placeholder="e.g. Deep breaths, a quiet corner"
            autoComplete="off"
            maxLength={80}
            value={child.calming}
            onChange={(e) => patchChild({ calming: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="set-notes" className="field-label">
            Anything else Poco should know? <span className="field-optional">(optional)</span>
          </label>
          <textarea
            id="set-notes"
            className="input"
            rows={2}
            value={child.notes}
            onChange={(e) => patchChild({ notes: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-block" aria-labelledby="set-poco">
        <h2 id="set-poco" className="settings-title">
          Poco
        </h2>
        <div className="comfort-cards">
          <div className="card">
            <div className="card-head">
              <label htmlFor="set-volume" className="field-label">
                Volume
              </label>
              <span className="readout" aria-hidden="true">
                {comfort.volume}%
              </span>
            </div>
            <Slider
              id="set-volume"
              value={comfort.volume}
              valueText={`${comfort.volume}%`}
              onChange={(volume) => patchComfort({ volume })}
            />
          </div>
          <div className="card">
            <div className="card-head">
              <label htmlFor="set-brightness" className="field-label">
                Belly brightness
              </label>
              <span className="readout" aria-hidden="true">
                {comfort.brightness}%
              </span>
            </div>
            <Slider
              id="set-brightness"
              value={comfort.brightness}
              valueText={`${comfort.brightness}%`}
              onChange={(brightness) => patchComfort({ brightness })}
            />
          </div>
        </div>
        <PillGroup
          id="set-speed"
          label="Movement speed"
          options={SPEEDS}
          value={comfort.speed}
          onChange={(speed) => {
            patchComfort({ speed });
            play('happy', ORANGE, 'moon');
          }}
        />
        <div className="toggles">
          <Toggle
            id="set-sfx"
            label="Sound effects"
            description="Soft chimes that go with each movement"
            checked={comfort.soundEffects}
            onChange={(soundEffects) => patchComfort({ soundEffects })}
          />
          <Toggle
            id="set-speak"
            label="Poco talks out loud"
            description={`Says things like “${child.name.trim() || 'Your friend'} looks happy, ${tagQuestion(child.pronouns)}?”`}
            checked={comfort.speakAloud}
            onChange={(speakAloud) => patchComfort({ speakAloud })}
          />
        </div>
        <div className="settings-row">
          <p className="settings-status">
            {state.connection === 'connected'
              ? 'Poco is connected.'
              : state.connection === 'searching'
                ? 'Looking for Poco…'
                : 'Poco is not connected.'}
          </p>
          {state.connection === 'idle' && (
            <ChunkyButton variant="secondary" onClick={() => connect()}>
              Connect
            </ChunkyButton>
          )}
        </div>
      </section>

      <section className="settings-block" aria-labelledby="set-you">
        <h2 id="set-you" className="settings-title">
          You
        </h2>
        <div className="field">
          <label htmlFor="set-guide-name" className="field-label">
            Your name
          </label>
          <input
            id="set-guide-name"
            className="input"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={40}
            value={guide.name}
            onChange={(e) => patchGuide({ name: e.target.value })}
          />
        </div>
        <PillGroup id="set-role" label="I'm a" options={ROLES} value={guide.role} onChange={(role) => patchGuide({ role })} />
      </section>

      <section className="settings-block" aria-labelledby="set-history">
        <h2 id="set-history" className="settings-title">
          Social history
        </h2>
        <p className="helper">
          {sessions
            ? `${sessions} saved ${sessions === 1 ? 'session' : 'sessions'} of what Poco noticed. Only feeling names and times are kept, and only on this iPad.`
            : 'No sessions saved yet. When Poco interacts, what they notice is kept on this iPad only.'}
        </p>
        {sessions > 0 && (
          <div className="settings-actions">
            <ConfirmButton label="Clear history" confirmLabel="Tap again to clear" onConfirm={clearSessions} />
          </div>
        )}
      </section>

      <section className="settings-block">
        <p className="helper">Want to go through the full setup again?</p>
        <div className="settings-actions">
          <ChunkyButton variant="secondary" onClick={restartSetup}>
            Begin onboarding
          </ChunkyButton>
        </div>
      </section>
    </div>
  );
}

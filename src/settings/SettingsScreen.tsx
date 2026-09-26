import { useApp } from '../app/AppProvider';
import { childOrDefault } from '../onboarding/stepMeta';
import { ChunkyButton } from '../ui/ChunkyButton';
import { ConfirmButton } from '../ui/ConfirmButton';
import '../app/shell.css';

/** Placeholder until the Child / Poco / Feelings / You tabs are built. */
export function SettingsScreen() {
  const { state, restartSetup, clearSessions } = useApp();
  const child = childOrDefault(state.child.name);
  const count = state.sessions.length;

  return (
    <>
      <header className="screen-header">
        <p className="eyebrow rise">Profile and settings</p>
        <h1 className="headline rise d1" tabIndex={-1}>
          {state.child.name.trim() ? `${state.child.name.trim()}'s profile` : 'Profile'}
        </h1>
        <p className="helper rise d2">
          To change {child}'s details or Poco's volume, brightness and speed, run setup again. Your answers stay
          filled in.
        </p>
      </header>
      <div className="settings-actions rise d3">
        <ChunkyButton variant="secondary" onClick={restartSetup}>
          Start setup again
        </ChunkyButton>
      </div>

      <section className="settings-block rise d4">
        <h2 className="settings-title">Interacting history</h2>
        <p className="helper">
          {count
            ? `${count} saved ${count === 1 ? 'session' : 'sessions'} of what Poco noticed. Only feeling names and times are kept, and only on this iPad.`
            : 'No sessions saved yet. When Poco interacts, what he notices is kept on this iPad only.'}
        </p>
        {count > 0 && (
          <div className="settings-actions">
            <ConfirmButton label="Clear history" confirmLabel="Tap again to clear" onConfirm={clearSessions} />
          </div>
        )}
      </section>
    </>
  );
}

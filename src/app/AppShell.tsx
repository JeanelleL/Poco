import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { FunScreen } from '../fun/FunScreen';
import { InteractingScreen } from '../interacting/InteractingScreen';
import { ORANGE } from '../poco/emotions';
import { LedMatrix } from '../poco/LedMatrix';
import { useReducedMotion } from '../poco/useReducedMotion';
import { useIndicator } from '../ui/useIndicator';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TeachingScreen } from '../teaching/TeachingScreen';
import { idlePattern, useApp, type Connection, type Screen, type StartMode } from './AppProvider';
import { Wordmark } from './PocoStage';
import { WakeUpIntro } from './WakeUpIntro';
import './layout.css';
import './shell.css';

const MODES: StartMode[] = ['Teaching', 'Interacting', 'Fun'];

/** What the tabs say. 'Interacting' stays the saved id so older saves still work. */
export const MODE_LABELS: Record<StartMode, string> = { Teaching: 'Teaching', Interacting: 'Social', Fun: 'Fun' };

const SCREENS: Record<Screen, ComponentType> = {
  Teaching: TeachingScreen,
  Interacting: InteractingScreen,
  Fun: FunScreen,
  Settings: SettingsScreen,
};

/**
 * The app after setup. The adult is watching the real Poco, so there's no
 * on-screen penguin: modes on top, the full width for content, and a
 * now-playing bar (with Stop) along the bottom.
 */
export function AppShell() {
  const { state, resetNonce } = useApp();
  const bodyRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const ScreenComponent = SCREENS[state.screen];

  // On screen change: scroll to top and move focus to the new headline.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    body.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [state.screen]);

  return (
    <div className="shell">
      <header className="shell-top">
        <Wordmark />
        <ModeTabs />
        <ProfileChip />
      </header>
      <main className="shell-body" ref={bodyRef}>
        <ScreenComponent key={`${state.screen}-${resetNonce}`} />
      </main>
      <NowPlaying />
      {state.introPending && <WakeUpIntro />}
    </div>
  );
}

function ModeTabs() {
  const { state, setScreen } = useApp();
  const pill = useIndicator<HTMLElement>(MODES.indexOf(state.screen as StartMode));
  return (
    <nav ref={pill.ref} className={`mode-tabs${pill.ready ? ' has-indicator' : ''}`} aria-label="Modes">
      <span className="mode-pill" style={pill.style} aria-hidden="true" />
      {MODES.map((m) => {
        const on = state.screen === m;
        return (
          <button
            key={m}
            type="button"
            data-tab
            className={`mode-tab${on ? ' is-on' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => setScreen(m)}
          >
            {MODE_LABELS[m]}
          </button>
        );
      })}
    </nav>
  );
}

function ProfileChip() {
  const { state, setScreen } = useApp();
  const on = state.screen === 'Settings';
  const name = state.child.name.trim() || 'Profile';
  return (
    <button
      type="button"
      className={`profile-chip${on ? ' is-on' : ''}`}
      aria-current={on ? 'page' : undefined}
      aria-label={`${name}: profile and settings`}
      onClick={() => setScreen('Settings')}
    >
      <span className="profile-avatar" aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="profile-name">{name}</span>
    </button>
  );
}

/** What the real Poco is doing right now, plus the always-there Stop. */
function NowPlaying() {
  const { state, poco, stop } = useApp();
  const typed = useTypewriter(poco.line, poco.lineId);
  return (
    <footer className="now-playing">
      <div className="np-belly" aria-hidden="true">
        {/* Re-scans when Poco performs or speaks; not on every dot while drawing in the editor. */}
        <LedMatrix
          key={`${poco.playId}-${poco.lineId}-${poco.stopId}`}
          pattern={poco.pattern ?? idlePattern(state)}
          color={poco.color ?? ORANGE}
          size={5}
          gap={2}
          offColor="#2A4A60"
          scan
        />
      </div>
      <div className="np-text">
        <p className="np-label">Poco says</p>
        <p className="np-line" aria-hidden="true">
          {poco.line ? typed : <span className="np-idle">Nothing right now</span>}
        </p>
        <p className="sr-only" aria-live="polite">
          {poco.line}
        </p>
      </div>
      <ConnectionChip />
      <button type="button" className="btn stop-btn" onClick={stop}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="currentColor" />
        </svg>
        Stop Poco
      </button>
    </footer>
  );
}

const TYPE_MS = 24;

/** Types a line out letter by letter, like Poco's speech bubble in onboarding. */
function useTypewriter(text: string, replay: number): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(text.length);
  useEffect(() => {
    if (reduced || !text) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(id);
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [text, replay, reduced]);
  return text.slice(0, shown);
}

const CONNECTION: Record<Connection, { dot: string; label: string }> = {
  idle: { dot: '#9AA8B0', label: 'Not connected' },
  searching: { dot: 'var(--orange)', label: 'Connecting…' },
  connected: { dot: 'var(--success)', label: 'Connected' },
};

function ConnectionChip() {
  const { state, connect, play } = useApp();
  const { connection } = state;
  const c = CONNECTION[connection];

  const content = (
    <>
      <span
        className={`conn-dot${connection === 'searching' ? ' is-searching' : ''}`}
        style={{ '--c': c.dot } as CSSProperties}
        aria-hidden="true"
      />
      {c.label}
    </>
  );

  if (connection !== 'idle') {
    return (
      <span className="conn" role="status">
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="conn is-action"
      onClick={async () => {
        if (await connect()) play('wave', ORANGE, 'hi', "I'm awake!");
      }}
    >
      {content}
      <span className="conn-cta">Connect</span>
    </button>
  );
}

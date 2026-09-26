import { useEffect, useRef } from 'react';
import { SPEED_MULTIPLIER } from '../onboarding/stepMeta';
import { EMOTIONS, ORANGE } from '../poco/emotions';
import { PocoCharacter } from '../poco/PocoCharacter';
import { SpeechBubble } from '../poco/SpeechBubble';
import { idlePattern, useApp } from './AppProvider';
import './layout.css';

const FLAKES = [
  { left: '12%', top: '22%', size: 12, opacity: 0.8, delay: '0s', dur: '9s' },
  { left: '82%', top: '16%', size: 8, opacity: 0.6, delay: '-3s', dur: '11s' },
  { left: '88%', top: '52%', size: 16, opacity: 0.5, delay: '-6s', dur: '10s' },
  { left: '8%', top: '64%', size: 10, opacity: 0.9, delay: '-1.5s', dur: '8s' },
  { left: '70%', top: '84%', size: 9, opacity: 0.7, delay: '-4.5s', dur: '12s' },
];

const SHOW_DEV_PANEL = new URLSearchParams(window.location.search).has('dev');

/** Left side of onboarding: Poco acting out what the real robot will do. */
export function PocoStage() {
  const { state, poco } = useApp();

  return (
    <aside className="stage">
      <Wordmark />
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="flake"
          aria-hidden="true"
          style={{
            left: f.left,
            top: f.top,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDelay: f.delay,
            animationDuration: f.dur,
          }}
        />
      ))}
      <div className="stage-center">
        <SpeechBubble text={poco.line} />
        <PocoCharacter
          gesture={poco.gesture}
          playId={poco.playId}
          pattern={poco.pattern ?? idlePattern(state)}
          color={poco.color ?? ORANGE}
          brightness={state.comfort.brightness / 100}
          speed={SPEED_MULTIPLIER[state.comfort.speed]}
          curious={poco.curious}
        />
        <div className="floor" aria-hidden="true" />
      </div>
      {SHOW_DEV_PANEL && <DevPanel />}
    </aside>
  );
}

/** Wordmark. Long-press for 2s clears everything (for demos). */
export function Wordmark() {
  const { reset, play } = useApp();
  const timer = useRef<number>();

  const cancel = () => window.clearTimeout(timer.current);
  const start = () => {
    cancel();
    timer.current = window.setTimeout(() => {
      reset();
      play('wave', ORANGE, 'hi');
    }, 2000);
  };

  useEffect(() => cancel, []);

  return (
    <div
      className="wordmark"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="wordmark-name">Poco</span>
    </div>
  );
}

/** Temporary: open with ?dev to try every gesture. */
function DevPanel() {
  const { play } = useApp();
  return (
    <div className="dev-panel">
      {EMOTIONS.map((e) => (
        <button key={e.id} type="button" onClick={() => play(e.gesture, e.color, e.pattern)}>
          {e.id}
        </button>
      ))}
      <button type="button" onClick={() => play('wave', ORANGE, 'hi')}>
        wave
      </button>
    </div>
  );
}

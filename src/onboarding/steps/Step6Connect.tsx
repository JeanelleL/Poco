import { useEffect, useRef, type CSSProperties } from 'react';
import { ORANGE } from '../../poco/emotions';
import { ChunkyButton } from '../../ui/ChunkyButton';
import { useApp, usePocoLine, type Connection } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';
import { friendOrName } from '../stepMeta';

const STATUS: Record<Connection, { dot: string; title: string; hint: string }> = {
  idle: { dot: '#9AA8B0', title: 'Not connected', hint: 'Poco is waiting for you.' },
  searching: { dot: 'var(--orange)', title: 'Looking for Poco…', hint: 'This takes a few seconds.' },
  connected: { dot: 'var(--success)', title: 'Poco is connected', hint: 'All 10 motors and the belly lights answered.' },
};

export function Step6Connect() {
  const { state, connect, play, setStep } = useApp();
  const { connection } = state;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lines: Record<Connection, string> = {
    idle: 'Plug me in and tap Connect so I can wake up!',
    searching: 'Waking up…',
    connected: `I'm awake! Hi, ${friendOrName(state.guide.name)}!`,
  };
  usePocoLine(lines[connection]);

  const onConnect = async () => {
    const ok = await connect();
    if (ok && mounted.current) play('wave', ORANGE, 'hi');
  };

  const status = STATUS[connection];

  return (
    <>
      <StepHeader
        step={6}
        title="Connect Poco"
        helper="Plug Poco into the laptop with the USB cable, flip on the power switch, then tap Connect."
      />
      <div className="status-card rise d3">
        <span
          className={`status-dot${connection === 'searching' ? ' is-searching' : ''}`}
          style={{ '--c': status.dot } as CSSProperties}
          aria-hidden="true"
        />
        <div className="status-text" role="status">
          <p className="status-title">{status.title}</p>
          <p className="status-hint">{status.hint}</p>
        </div>
        {connection === 'connected' ? (
          <ChunkyButton variant="secondary" onClick={() => play('wave', ORANGE, 'hi')}>
            Test wave
          </ChunkyButton>
        ) : (
          <ChunkyButton disabled={connection === 'searching'} onClick={onConnect}>
            {connection === 'searching' ? 'Connecting…' : 'Connect'}
          </ChunkyButton>
        )}
      </div>
      {connection !== 'connected' && (
        <button type="button" className="text-button rise d4" onClick={() => setStep(7)}>
          Skip for now, I'll connect later
        </button>
      )}
    </>
  );
}

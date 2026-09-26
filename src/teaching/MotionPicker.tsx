import { useEffect, useState } from 'react';
import { useApp } from '../app/AppProvider';
import { SPEED_MULTIPLIER } from '../onboarding/stepMeta';
import { PocoCharacter } from '../poco/PocoCharacter';
import type { BodyMove, FlipperMove, Motion } from '../poco/pocoClient';
import { PlayIcon } from './TeachingScreen';

const BODY: { id: BodyMove; label: string; ms: number }[] = [
  { id: 'still', label: 'Still', ms: 0 },
  { id: 'bounce', label: 'Bounce', ms: 1500 },
  { id: 'slump', label: 'Slump', ms: 1200 },
  { id: 'shake', label: 'Shake', ms: 1000 },
  { id: 'tremble', label: 'Tremble', ms: 1400 },
  { id: 'jump', label: 'Jump', ms: 600 },
  { id: 'sway', label: 'Sway', ms: 3200 },
];

const FLIPPERS: { id: FlipperMove; label: string; ms: number }[] = [
  { id: 'rest', label: 'Rest', ms: 0 },
  { id: 'flap', label: 'Flap', ms: 1500 },
  { id: 'droop', label: 'Droop', ms: 1200 },
  { id: 'stiff', label: 'Stiff', ms: 300 },
  { id: 'cover', label: 'Cover eyes', ms: 350 },
  { id: 'up', label: 'Up high', ms: 600 },
  { id: 'wave', label: 'Wave', ms: 2400 },
];

/** Body move + flipper move; Poco plays both together. */
export function MotionControls({ value, onChange }: { value: Motion; onChange: (m: Motion) => void }) {
  return (
    <div className="motion-controls">
      <ChipRow label="Body">
        {BODY.map((b) => (
          <Chip key={b.id} on={value.body === b.id} onClick={() => onChange({ ...value, body: b.id })}>
            {b.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label="Flippers">
        {FLIPPERS.map((f) => (
          <Chip key={f.id} on={value.flippers === f.id} onClick={() => onChange({ ...value, flippers: f.id })}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

interface TilePreviewProps {
  /** Small label at the top, e.g. "New tile". */
  heading: string;
  label: string;
  motion: Motion;
  face: string[];
  color: string;
  /** Plays the tile on the real Poco. */
  onTry: () => void;
}

/**
 * The whole tile as Poco will show it: face, color and movement, looping.
 * Full brightness so the face reads clearly; the real belly uses the comfort setting.
 */
export function TilePreview({ heading, label, motion, face, color, onTry }: TilePreviewProps) {
  const { state } = useApp();
  const speed = SPEED_MULTIPLIER[state.comfort.speed];
  const [loop, setLoop] = useState(0);

  // Replay on a loop, with a short rest after the longer of the two parts finishes.
  const moveMs =
    Math.max(BODY.find((b) => b.id === motion.body)!.ms, FLIPPERS.find((f) => f.id === motion.flippers)!.ms) * speed;
  useEffect(() => {
    setLoop((n) => n + 1);
    const id = window.setInterval(() => setLoop((n) => n + 1), moveMs + 1200);
    return () => window.clearInterval(id);
  }, [motion.body, motion.flippers, moveMs]);

  return (
    <aside className="tile-preview" aria-label="Preview">
      <p className="tile-preview-label">{heading}</p>
      <div className="tile-preview-stage" aria-hidden="true">
        <div className="tile-preview-floor" />
        <div className="tile-preview-poco">
          <PocoCharacter
            gesture={motion}
            playId={loop}
            pattern={face}
            color={color}
            brightness={1}
            speed={speed}
            curious={false}
          />
        </div>
      </div>
      <p className="tile-preview-name">{label}</p>
      <p className="tile-preview-move">
        {BODY.find((b) => b.id === motion.body)!.label} + {FLIPPERS.find((f) => f.id === motion.flippers)!.label}
      </p>
      <button type="button" className="btn btn-secondary small-btn" onClick={onTry}>
        <PlayIcon />
        Try on Poco
      </button>
    </aside>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `motion-${label.toLowerCase()}`;
  return (
    <div className="motion-row">
      <span id={id} className="field-label">
        {label}
      </span>
      <div className="chips" role="group" aria-labelledby={id}>
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

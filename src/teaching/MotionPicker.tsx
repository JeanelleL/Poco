import { useEffect, useState } from 'react';
import { useApp } from '../app/AppProvider';
import { SPEED_MULTIPLIER } from '../onboarding/stepMeta';
import { PocoCharacter } from '../poco/PocoCharacter';
import {
  MAX_STEPS,
  POCO_MOVES,
  isMix,
  mixMs,
  moveInfo,
  type ArmCmd,
  type FeetCmd,
  type HeadCmd,
  type MixPart,
  type MoveMix,
  type MoveStep,
  type PocoMove,
} from '../poco/pocoClient';
import { PlayIcon, PlusIcon } from './TeachingScreen';
import { CrossIcon } from './TileEditor';

/** What a tile does: a ready-made movement, the adult's own steps, or nothing. */
export type MoveChoice = PocoMove | MoveMix | null;

// Commands are stored in Poco's own left/right (see MoveMix); labels are as you face them.
const HEAD: { id: HeadCmd; label: string }[] = [
  { id: 'nod', label: 'Nod' },
  { id: 'shake', label: 'Shake' },
  { id: 'tilt', label: 'Tilt' },
  { id: 'look_up', label: 'Look up' },
  { id: 'look_down', label: 'Look down' },
  { id: 'look_right', label: 'Look left' },
  { id: 'look_left', label: 'Look right' },
];
const ARM: { id: ArmCmd; label: string }[] = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'wave', label: 'Wave' },
  { id: 'flap', label: 'Flap' },
  { id: 'out', label: 'Out to side' },
  { id: 'bend', label: 'Bend' },
];
const FEET: { id: FeetCmd; label: string }[] = [
  { id: 'lift_right', label: 'Lift left foot' },
  { id: 'lift_left', label: 'Lift right foot' },
  { id: 'up_down', label: 'Both up and down' },
  { id: 'alternate', label: 'Alternate' },
];

// The rows of a step, top to bottom. "Left flipper" is Poco's right arm.
const ROWS: { part: MixPart; label: string; options: { id: string; label: string }[] }[] = [
  { part: 'head', label: 'Head', options: HEAD },
  { part: 'rightArm', label: 'Left flipper', options: ARM },
  { part: 'leftArm', label: 'Right flipper', options: ARM },
  { part: 'feet', label: 'Feet', options: FEET },
];

// A first step that visibly moves, so switching to Mix your own shows something right away.
const FIRST_MIX: MoveMix = { steps: [{ head: 'nod', rightArm: 'wave' }] };

const labelOf = (options: { id: string; label: string }[], id: string) => options.find((o) => o.id === id)!.label;

function stepLabel(s: MoveStep): string {
  const arm = (a: ArmCmd) => labelOf(ARM, a).toLowerCase();
  const flippers =
    s.leftArm && s.leftArm === s.rightArm
      ? [`Both flippers ${arm(s.leftArm)}`]
      : [s.rightArm && `Left flipper ${arm(s.rightArm)}`, s.leftArm && `Right flipper ${arm(s.leftArm)}`];
  const parts = [s.head && labelOf(HEAD, s.head), ...flippers, s.feet && labelOf(FEET, s.feet)].filter(Boolean);
  const text = parts.length ? parts.join(' + ') : 'Hold still';
  return (s.times ?? 1) > 1 ? `${text} (${s.times}×)` : text;
}

export function choiceLabel(m: MoveChoice): string {
  if (!m) return 'No movement';
  if (!isMix(m)) return `${moveInfo(m).label} movement`;
  return m.steps.map(stepLabel).join(', then ');
}

/**
 * Ready-made: Poco's feelings and a few moments (13 in all). Mix your own: up to
 * MAX_STEPS steps played in order; in each, tap what every part should do at
 * the same time (a part left alone holds still).
 */
export function MoveControls({ value, onChange }: { value: MoveChoice; onChange: (m: MoveChoice) => void }) {
  const [mode, setMode] = useState<'ready' | 'mix'>(isMix(value) ? 'mix' : 'ready');
  const mix = isMix(value) ? value : FIRST_MIX;

  const switchTo = (next: 'ready' | 'mix') => {
    if (next === mode) return;
    setMode(next);
    onChange(next === 'mix' ? mix : 'happy');
  };

  const setStep = (i: number, s: MoveStep) => onChange({ steps: mix.steps.map((old, j) => (j === i ? s : old)) });
  const removeStep = (i: number) => onChange({ steps: mix.steps.filter((_, j) => j !== i) });
  const addStep = () => onChange({ steps: [...mix.steps, {}] });

  return (
    <div className="move-groups">
      <div className="chips move-mode" role="group" aria-label="How Poco moves">
        <Chip on={mode === 'ready'} onClick={() => switchTo('ready')}>
          Ready-made
        </Chip>
        <Chip on={mode === 'mix'} onClick={() => switchTo('mix')}>
          Mix your own
        </Chip>
      </div>

      {mode === 'ready' ? (
        (['Feelings', 'Moments'] as const).map((group) => (
          <ChipRow key={group} id={`moves-${group.toLowerCase()}`} label={group}>
            {POCO_MOVES.filter((m) => m.group === group).map((m) => (
              <Chip key={m.id} on={value === m.id} onClick={() => onChange(m.id)}>
                {m.label}
              </Chip>
            ))}
            {group === 'Moments' && (
              <Chip on={value === null} onClick={() => onChange(null)}>
                No movement
              </Chip>
            )}
          </ChipRow>
        ))
      ) : (
        <>
          <p className="section-hint mix-hint">
            Poco plays the steps in order. In each step, tap everything Poco should do at the same time; tap again to
            undo. Left and right are as you face Poco.
          </p>
          <ol className="mix-steps">
            {mix.steps.map((s, i) => (
              <li key={i} className="mix-step" aria-label={`Step ${i + 1}`}>
                <div className="mix-step-head">
                  <span className="mix-step-title">Step {i + 1}</span>
                  {mix.steps.length > 1 && (
                    <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => removeStep(i)}>
                      <CrossIcon />
                    </button>
                  )}
                </div>
                {ROWS.map((row) => (
                  <ChipRow key={row.part} id={`step${i}-${row.part}`} label={row.label}>
                    {row.options.map((o) => {
                      const on = s[row.part] === o.id;
                      return (
                        <Chip key={o.id} on={on} onClick={() => setStep(i, { ...s, [row.part]: on ? undefined : o.id })}>
                          {o.label}
                        </Chip>
                      );
                    })}
                  </ChipRow>
                ))}
                <ChipRow id={`step${i}-times`} label="Play it">
                  {([1, 2, 3] as const).map((n) => (
                    <Chip key={n} on={(s.times ?? 1) === n} onClick={() => setStep(i, { ...s, times: n })}>
                      {n === 1 ? 'Once' : `${n} times`}
                    </Chip>
                  ))}
                </ChipRow>
              </li>
            ))}
          </ol>
          {mix.steps.length < MAX_STEPS ? (
            <button type="button" className="add-line mix-add" onClick={addStep}>
              <PlusIcon />
              Add a step
            </button>
          ) : (
            <p className="section-hint">That's the most steps a tile can have ({MAX_STEPS}).</p>
          )}
        </>
      )}
    </div>
  );
}

interface TilePreviewProps {
  /** Small label at the top, e.g. "New tile". */
  heading: string;
  label: string;
  move: MoveChoice;
  face: string[];
  color: string;
  /** Plays the tile on the real Poco. */
  onTry: () => void;
}

/**
 * The whole tile as Poco will show it: belly lights, color and movement, looping.
 * The drawn Poco only approximates the movement; the robot does the real one.
 * Full brightness so the lights read clearly; the real belly uses the comfort setting.
 */
export function TilePreview({ heading, label, move, face, color, onTry }: TilePreviewProps) {
  const { state } = useApp();
  const speed = SPEED_MULTIPLIER[state.comfort.speed];
  const [loop, setLoop] = useState(0);
  // A string key, so a new mix object with the same steps doesn't restart the loop.
  const moveKey = isMix(move) ? JSON.stringify(move.steps) : move;

  // Replay on a loop, with a short rest after the movement finishes.
  useEffect(() => {
    if (!move) return;
    setLoop((n) => n + 1);
    const ms = isMix(move) ? mixMs(move) : moveInfo(move).ms;
    const id = window.setInterval(() => setLoop((n) => n + 1), ms * speed + 1200);
    return () => window.clearInterval(id);
  }, [moveKey, speed]);

  return (
    <aside className="tile-preview" aria-label="Preview">
      <p className="tile-preview-label">{heading}</p>
      <div className="tile-preview-stage" aria-hidden="true">
        <div className="tile-preview-floor" />
        <div className="tile-preview-poco">
          <PocoCharacter
            gesture={move}
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
      <p className="tile-preview-move">{choiceLabel(move)}</p>
      <button type="button" className="btn btn-secondary small-btn" onClick={onTry}>
        <PlayIcon />
        Try on Poco
      </button>
    </aside>
  );
}

function ChipRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="motion-row">
      <span id={id} className="field-label move-group-label">
        {label}
      </span>
      <div className="chips motion-row-chips" role="group" aria-labelledby={id}>
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

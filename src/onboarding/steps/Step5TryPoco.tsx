import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CORE_EMOTIONS, CUSTOM_COLORS, ORANGE, customToEmotion, type Emotion } from '../../poco/emotions';
import { LedEditor } from '../../poco/LedEditor';
import { LedMatrix } from '../../poco/LedMatrix';
import { BLANK_ROWS, patternRows, type PatternKey } from '../../poco/patterns';
import type { Gesture } from '../../poco/pocoClient';
import { ChunkyButton } from '../../ui/ChunkyButton';
import { calmingPhrase } from '../childProfile';
import { useApp, usePocoLine, type StartMode } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';

const HARD_FEELINGS = ['sad', 'angry', 'worried'];

type Tab = 'feelings' | 'make' | 'modes';

const TABS: { id: Tab; label: string; line: string }[] = [
  { id: 'feelings', label: 'Feelings', line: "Tap a feeling and I'll act it out!" },
  { id: 'make', label: 'Make your own', line: 'Name a new feeling, pick a color and draw my face!' },
  { id: 'modes', label: 'Modes', line: 'I have three ways to play. Tap one to hear about it!' },
];

export function Step5TryPoco() {
  const { resetPoco } = useApp();
  const [tab, setTab] = useState<Tab>('feelings');
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  usePocoLine(TABS[0].line);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setSelectedEmotion(null);
    resetPoco(TABS.find((t) => t.id === next)!.line);
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    switchTab(TABS[j].id);
    tabRefs.current[j]?.focus();
  };

  return (
    <>
      <StepHeader
        step={5}
        title="Get to know Poco"
        helper="Here's what Poco can do. Tap anything to see it on screen. You'll connect the real Poco next."
      />
      <div className="tabs rise d3" role="tablist" aria-label="Poco tour" onKeyDown={onTabKey}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        key={tab}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="tabpanel rise d4"
      >
        {tab === 'feelings' && <FeelingsTab selected={selectedEmotion} onSelect={setSelectedEmotion} />}
        {tab === 'make' && (
          <MakeTab
            onAdded={(id) => {
              setTab('feelings');
              setSelectedEmotion(id);
            }}
          />
        )}
        {tab === 'modes' && <ModesTab />}
      </div>
    </>
  );
}

/* ---------- Feelings ---------- */

function FeelingsTab({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const { state, play } = useApp();
  const all: Emotion[] = [...CORE_EMOTIONS, ...state.customEmotions.map(customToEmotion)];
  const calming = calmingPhrase(state.child.calming);

  // For hard feelings, Poco models the child's own calming strategy.
  const lineFor = (e: Emotion) => {
    const feeling = e.label.toLowerCase();
    if (calming && HARD_FEELINGS.includes(e.id)) {
      return `This is me feeling ${feeling}. I ${calming} to feel better.`;
    }
    return `This is me feeling ${feeling}!`;
  };

  return (
    <div className="emo-grid" role="group" aria-label="Feelings">
      {all.map((e) => {
        const on = selected === e.id;
        const style: CSSProperties = on ? { borderColor: e.color, backgroundColor: `${e.color}26` } : {};
        return (
          <button
            key={e.id}
            type="button"
            className={`tile emo-tile${on ? ' is-on' : ''}`}
            style={style}
            aria-pressed={on}
            onClick={() => {
              onSelect(e.id);
              play(e.gesture, e.color, e.pattern, lineFor(e));
            }}
          >
            <LedMatrix pattern={e.pattern} color={e.color} size={6} gap={2} />
            <span className="emo-label">{e.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Make your own ---------- */

function MakeTab({ onAdded }: { onAdded: (id: string) => void }) {
  const { saveEmotion, play, showBelly } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CUSTOM_COLORS[0].hex);
  const [face, setFace] = useState<string[]>(() => patternRows('sparkle'));
  const trimmed = name.trim();
  const hasDots = face.some((row) => row.includes('#'));

  // Poco's belly mirrors the drawing as you make it.
  useEffect(() => {
    showBelly(face, color);
  }, [face, color, showBelly]);

  const add = () => {
    if (!trimmed || !hasDots) return;
    const label = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const id = `custom-${Date.now()}`;
    saveEmotion({ id, label, color, pattern: face });
    onAdded(id);
    play('happy', color, face, `I learned a new feeling: ${label}!`);
  };

  return (
    <div className="make">
      <div className="make-form">
        <div className="field field-tight">
          <label htmlFor="new-feeling" className="field-label">
            Name the feeling
          </label>
          <input
            id="new-feeling"
            className="input"
            type="text"
            placeholder="e.g. Proud"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the feeling rather than submitting the step.
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <div className="pill-field">
          <span id="swatch-label" className="field-label">
            Pick its color
          </span>
          <div className="swatches" role="group" aria-labelledby="swatch-label">
            {CUSTOM_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`swatch${color === c.hex ? ' is-on' : ''}`}
                style={{ backgroundColor: c.hex }}
                aria-label={c.name}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
              />
            ))}
          </div>
        </div>
        <ChunkyButton className="make-add" disabled={!trimmed || !hasDots} onClick={add}>
          Add feeling
        </ChunkyButton>
      </div>
      <div className="draw-card">
        <div className="draw-head">
          <span className="field-label">Draw its face</span>
          <button type="button" className="draw-clear" onClick={() => setFace([...BLANK_ROWS])}>
            Clear
          </button>
        </div>
        <LedEditor
          rows={face}
          color={color}
          onChange={setFace}
          label={`Draw the face for ${trimmed || 'your feeling'}`}
        />
      </div>
    </div>
  );
}

/* ---------- Modes ---------- */

const MODES: {
  id: StartMode;
  title: string;
  icon: PatternKey;
  description: string;
  say: string;
  gesture: Gesture;
}[] = [
  {
    id: 'Teaching',
    title: 'Teaching Mode',
    icon: 'apple',
    description: 'You tap a feeling. Poco acts it out with color, sound and movement.',
    say: 'In Teaching Mode, you tap a feeling and I act it out!',
    gesture: 'yes',
  },
  {
    id: 'Interacting',
    title: 'Social Mode',
    icon: 'heart',
    description: 'Poco watches, listens and joins in on their own with feelings, words and moves.',
    say: 'In Social Mode, I watch, listen and join in!',
    gesture: 'listen',
  },
  {
    id: 'Fun',
    title: 'Fun Mode',
    icon: 'note',
    description: 'Dance breaks and games for when everyone needs a reset.',
    say: 'Fun Mode means dance party!',
    gesture: 'happy_dance',
  },
];

function ModesTab() {
  const { state, setStartMode, play } = useApp();

  return (
    <div className="modes" role="group" aria-label="Starting mode">
      {MODES.map((m) => {
        const on = state.startMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`mode${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              setStartMode(m.id);
              play(m.gesture, ORANGE, m.icon, m.say);
            }}
          >
            <span className="mode-chip">
              <LedMatrix
                pattern={m.icon}
                color={on ? '#F4AE3C' : ORANGE}
                offColor={on ? '#2C4D63' : undefined}
                size={7}
                gap={3}
              />
            </span>
            <span className="mode-text">
              <span className="mode-title">{m.title}</span>
              <span className="mode-desc">{m.description}</span>
            </span>
            <span className={`mode-tag${on ? ' is-on' : ''}`}>{on ? 'Start here' : 'Tap to pick'}</span>
          </button>
        );
      })}
    </div>
  );
}

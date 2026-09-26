import { useEffect, useState } from 'react';
import { useApp } from '../app/AppProvider';
import { CUSTOM_COLORS, type CustomEmotion } from '../poco/emotions';
import { LedEditor } from '../poco/LedEditor';
import { BLANK_ROWS, patternRows } from '../poco/patterns';
import { toMotion, type Motion } from '../poco/pocoClient';
import { ChunkyButton } from '../ui/ChunkyButton';
import { MotionControls, TilePreview } from './MotionPicker';
import { ConfirmButton } from '../ui/ConfirmButton';
import { PlusIcon, type Go } from './TeachingScreen';
import { defaultLines, makeCtx, useTiles } from './tiles';
// Swatches and the drawing card are shared with onboarding's "Make your own".
import '../onboarding/steps/steps.css';

const MAX_LINES = 8;

/**
 * Make or edit a tile: one scrolling column of five short sections, with the
 * live Poco preview following alongside. Editing a preset saves a copy that
 * takes the preset's place in the grid (Reset to original deletes the copy).
 */
export function TileEditor({ id, go }: { id?: string; go: Go }) {
  const { state, saveEmotion, removeEmotion, play, showBelly } = useApp();
  const { byId } = useTiles();
  const existing = id ? byId(id) : undefined;
  const kind = existing?.kind ?? 'feeling';
  const ctx = makeCtx(state);

  const [label, setLabel] = useState(existing?.label ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? CUSTOM_COLORS[0].hex);
  const [face, setFace] = useState<string[]>(() => (existing ? patternRows(existing.pattern) : [...BLANK_ROWS]));
  const [motion, setMotion] = useState<Motion>(() => toMotion(existing?.move ?? 'happy'));
  const [lines, setLines] = useState<string[]>(
    () => existing?.lines.map((l) => l.text) ?? defaultLines('', kind, ctx),
  );
  // Starter lines follow the name until the adult edits them.
  const [linesTouched, setLinesTouched] = useState(!!existing);

  const name = label.trim();
  const cleanLines = lines.map((l) => l.trim()).filter(Boolean);
  const missing = !name
    ? 'Add a name to save'
    : !face.some((r) => r.includes('#'))
      ? 'Draw the belly lights to save'
      : !cleanLines.length
        ? 'Add a line for Poco to save'
        : '';
  const title = existing ? (existing.custom && !existing.custom.replaces ? 'Edit tile' : 'Edit ready-made tile') : 'New tile';
  // Keep a preset's own color pickable even if it isn't in the palette.
  const swatches =
    existing && !CUSTOM_COLORS.some((c) => c.hex === existing.color)
      ? [{ name: 'Original', hex: existing.color }, ...CUSTOM_COLORS]
      : CUSTOM_COLORS;

  // ctx and kind are left out on purpose: neither can change on this screen.
  useEffect(() => {
    if (!linesTouched) setLines(defaultLines(name, kind, ctx));
  }, [name, linesTouched]);

  // The real Poco's belly mirrors the drawing as you make it.
  useEffect(() => {
    showBelly(face, color);
  }, [face, color, showBelly]);

  const editLines = (next: string[]) => {
    setLinesTouched(true);
    setLines(next);
  };

  const save = () => {
    if (missing) return;
    const saved: CustomEmotion = {
      id: existing?.custom?.id ?? `custom-${Date.now()}`,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      color,
      pattern: face,
      motion,
      kind,
      lines: cleanLines,
      replaces: existing?.custom?.replaces ?? (existing && !existing.custom ? existing.id : undefined),
    };
    saveEmotion(saved);
    play(motion, color, face, cleanLines[0]);
    go({ name: 'tile', id: saved.id });
  };

  const back = () => go(existing ? { name: 'tile', id: existing.id } : { name: 'feelings' });

  return (
    <>
      <header className="screen-header">
        <p className="eyebrow">{title}</p>
        <h1 className="headline" tabIndex={-1}>
          {name || 'New tile'}
        </h1>
      </header>

      <div className="editor-grid">
        <div className="editor-form">
          <section className="editor-section">
            <label htmlFor="tile-name" className="editor-label">
              Name
            </label>
            <input
              id="tile-name"
              className="input"
              type="text"
              placeholder="e.g. Nervous"
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="done"
              maxLength={20}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            />
          </section>

          <section className="editor-section">
            <span id="tile-color-label" className="editor-label">
              Color
            </span>
            <div className="swatches" role="group" aria-labelledby="tile-color-label">
              {swatches.map((c) => (
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
          </section>

          <section className="editor-section">
            <div className="editor-label-row">
              <span className="editor-label">Belly lights</span>
              <button type="button" className="draw-clear" onClick={() => setFace([...BLANK_ROWS])}>
                Clear
              </button>
            </div>
            <p className="section-hint">Tap or drag to light up dots.</p>
            <div className="draw-card belly-card">
              <LedEditor rows={face} color={color} onChange={setFace} label={`Draw the belly lights for ${name || 'this tile'}`} />
            </div>
          </section>

          <section className="editor-section">
            <span className="editor-label">Movement</span>
            <p className="section-hint">Poco does the body move and the flipper move together.</p>
            <MotionControls value={motion} onChange={setMotion} />
          </section>

          <section className="editor-section">
            <span className="editor-label">What Poco says</span>
            <p className="section-hint">Short lines work best. The first one plays when you tap the tile.</p>
            <ol className="line-list">
              {lines.map((l, i) => (
                <li key={i} className="line-row">
                  <input
                    className="input line-input"
                    type="text"
                    aria-label={`Line ${i + 1}`}
                    maxLength={90}
                    value={l}
                    onChange={(e) => editLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => editLines(lines.filter((_, j) => j !== i))}
                  >
                    <CrossIcon />
                  </button>
                </li>
              ))}
            </ol>
            {lines.length < MAX_LINES && (
              <button type="button" className="add-line" onClick={() => editLines([...lines, ''])}>
                <PlusIcon />
                Add a line
              </button>
            )}
          </section>

          <div className="editor-actions">
            <ChunkyButton variant="secondary" onClick={back}>
              Cancel
            </ChunkyButton>
            <span className="editor-actions-gap" />
            {existing?.custom && (
              <ConfirmButton
                label={existing.custom.replaces ? 'Reset to original' : 'Delete'}
                confirmLabel="Tap again to confirm"
                onConfirm={() => {
                  removeEmotion(existing.custom!.id);
                  go(existing.custom!.replaces ? { name: 'tile', id: existing.custom!.replaces } : { name: 'feelings' });
                }}
              />
            )}
            <ChunkyButton disabled={!!missing} onClick={save}>
              Save tile
            </ChunkyButton>
          </div>
          {missing && <p className="editor-missing">{missing}</p>}
        </div>

        <TilePreview
          heading="Preview"
          label={name || 'New tile'}
          motion={motion}
          face={face}
          color={color}
          onTry={() => play(motion, color, face, cleanLines[0])}
        />
      </div>
    </>
  );
}

export function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

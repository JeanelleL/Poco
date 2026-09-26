import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { GRID, setDot } from './patterns';
import './poco.css';

interface LedEditorProps {
  rows: readonly string[];
  color: string;
  onChange: (rows: string[]) => void;
  /** Accessible name for the grid, e.g. "Draw the face for Proud". */
  label: string;
}

/**
 * An 8x8 LED grid you can draw on. Tap a dot to flip it; drag to paint
 * (the first dot decides whether the drag turns dots on or off).
 * Keyboard: arrows move, Space/Enter flips.
 */
export function LedEditor({ rows, color, onChange, label }: LedEditorProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const paint = useRef<{ on: boolean; last: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(GRID * 3 + 3);

  const isLit = (i: number) => rowsRef.current[Math.floor(i / GRID)][i % GRID] === '#';

  const apply = (i: number, on: boolean) => {
    if (isLit(i) === on) return;
    const next = setDot(rowsRef.current, Math.floor(i / GRID), i % GRID, on);
    rowsRef.current = next;
    onChange(next);
  };

  const cellAt = (x: number, y: number) => {
    const box = gridRef.current!.getBoundingClientRect();
    const c = Math.floor(((x - box.left) / box.width) * GRID);
    const r = Math.floor(((y - box.top) / box.height) * GRID);
    return r < 0 || r >= GRID || c < 0 || c >= GRID ? -1 : r * GRID + c;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    const on = !isLit(i);
    paint.current = { on, last: i };
    apply(i, on);
    setFocusIdx(i);
    gridRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!paint.current) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === paint.current.last) return;
    paint.current.last = i;
    apply(i, paint.current.on);
  };

  const endPaint = () => {
    paint.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -GRID, ArrowDown: GRID };
    const d = moves[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const c = focusIdx % GRID;
    if ((d === -1 && c === 0) || (d === 1 && c === GRID - 1)) return;
    const next = focusIdx + d;
    if (next < 0 || next >= GRID * GRID) return;
    setFocusIdx(next);
    cellRefs.current[next]?.focus();
  };

  return (
    <div
      ref={gridRef}
      className="led-editor"
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPaint}
      onPointerCancel={endPaint}
      onKeyDown={onKeyDown}
      style={{ '--led': color } as CSSProperties}
    >
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const on = rows[Math.floor(i / GRID)][i % GRID] === '#';
        return (
          <button
            key={i}
            ref={(el) => {
              cellRefs.current[i] = el;
            }}
            type="button"
            className={`led-cell${on ? ' is-on' : ''}`}
            aria-label={`Row ${Math.floor(i / GRID) + 1}, dot ${(i % GRID) + 1}`}
            aria-pressed={on}
            tabIndex={i === focusIdx ? 0 : -1}
            // Pointer taps are handled on the grid (so drags paint); this is keyboard only.
            onClick={(e) => {
              if (e.detail === 0) apply(i, !on);
            }}
          >
            <span className="led-cell-dot" />
          </button>
        );
      })}
    </div>
  );
}

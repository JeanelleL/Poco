import type { CSSProperties } from 'react';
import { PATTERNS, type PatternKey } from './patterns';
import './poco.css';

interface LedMatrixProps {
  pattern: PatternKey | readonly string[];
  color: string;
  /** 0..1 */
  brightness?: number;
  size?: number;
  gap?: number;
  glow?: boolean;
  /** Unlit dot color. Defaults to --dot-off. */
  offColor?: string;
  /** Light up row by row when mounted, like an LED scan (remount to replay). */
  scan?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function LedMatrix({
  pattern,
  color,
  brightness = 1,
  size = 11,
  gap = 5,
  glow = false,
  offColor,
  scan = false,
  className,
  style,
}: LedMatrixProps) {
  const rows: readonly string[] = typeof pattern === 'string' ? PATTERNS[pattern] : pattern;
  const b = Math.min(1, Math.max(0, brightness));

  const lit: CSSProperties = {
    backgroundColor: color,
    opacity: 0.3 + 0.7 * b,
    boxShadow: glow ? `0 0 ${3 + 10 * b}px ${color}` : 'none',
  };
  const off: CSSProperties = {
    backgroundColor: offColor ?? 'var(--dot-off)',
    opacity: 1,
    boxShadow: 'none',
  };

  return (
    <div
      className={`led${scan ? ' led-scan' : ''}${className ? ` ${className}` : ''}`}
      style={{ gridTemplateColumns: `repeat(7, ${size}px)`, gap, ...style }}
      aria-hidden="true"
    >
      {rows.flatMap((row, r) =>
        row.split('').map((ch, c) => (
          <span
            key={r * 7 + c}
            className="led-dot"
            style={{ width: size, height: size, ...(ch === '#' ? lit : off), '--r': r } as CSSProperties}
          />
        )),
      )}
    </div>
  );
}

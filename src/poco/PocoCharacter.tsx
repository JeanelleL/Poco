import { useEffect, useState, type CSSProperties } from 'react';
import { LedMatrix } from './LedMatrix';
import type { Pattern } from './patterns';
import { toMotion, type Move } from './pocoClient';
import './poco.css';

interface PocoCharacterProps {
  /** null = idle breathing */
  gesture: Move | null;
  /** Bumped on every play so the same gesture can be replayed. */
  playId: number;
  pattern: Pattern;
  color: string;
  /** 0..1 */
  brightness: number;
  /** Duration multiplier (Gentle 1.6, Normal 1, Lively 0.7). */
  speed: number;
  curious: boolean;
}

export function PocoCharacter({
  gesture,
  playId,
  pattern,
  color,
  brightness,
  speed,
  curious,
}: PocoCharacterProps) {
  const [gestureClass, setGestureClass] = useState<string | null>('idle');
  const motion = gesture && toMotion(gesture);
  const moveClass = motion ? `b-${motion.body} f-${motion.flippers}` : null;

  // Retrigger: drop the class, then add it back ~30ms later so the CSS
  // animation restarts even when the same move plays twice.
  useEffect(() => {
    if (!moveClass) {
      setGestureClass('idle');
      return;
    }
    setGestureClass(null);
    const t = window.setTimeout(() => setGestureClass(moveClass), 30);
    return () => window.clearTimeout(t);
  }, [moveClass, playId]);

  const className = ['poco', gestureClass, curious ? 'curious' : null].filter(Boolean).join(' ');

  return (
    <div className={className} style={{ '--spd': speed } as CSSProperties}>
      <div className="tilt">
        <div className="bodyg">
          <svg
            width="300"
            height="340"
            viewBox="0 0 300 340"
            aria-hidden="true"
            focusable="false"
            style={{ overflow: 'visible' }}
          >
            <g className="flipL">
              <ellipse cx="44" cy="208" rx="30" ry="64" fill="#868A90" transform="rotate(32 44 208)" />
            </g>
            <g className="flipR">
              <ellipse cx="256" cy="208" rx="30" ry="64" fill="#868A90" transform="rotate(-32 256 208)" />
            </g>
            <ellipse cx="104" cy="322" rx="40" ry="16" fill="#F4AE3C" />
            <ellipse cx="196" cy="322" rx="40" ry="16" fill="#F4AE3C" />
            <ellipse cx="150" cy="216" rx="112" ry="110" fill="#9A9EA4" />
            <ellipse cx="150" cy="112" rx="102" ry="94" fill="#9A9EA4" />
            <path
              d="M150 70 C120 38 56 50 56 112 C56 154 96 176 150 178 C204 176 244 154 244 112 C244 50 180 38 150 70 Z"
              fill="#FBFAF7"
            />
            <ellipse cx="150" cy="236" rx="84" ry="90" fill="#FBFAF7" />
            <g className="eyes">
              <ellipse cx="112" cy="108" rx="8" ry="10" fill="#1B1B1F" />
              <ellipse cx="188" cy="108" rx="8" ry="10" fill="#1B1B1F" />
              <circle cx="115" cy="104" r="2.6" fill="#FFFFFF" />
              <circle cx="191" cy="104" r="2.6" fill="#FFFFFF" />
            </g>
            <path d="M128 124 Q150 114 172 124 Q168 148 150 152 Q132 148 128 124 Z" fill="#F4AE3C" />
          </svg>
          <LedMatrix
            className="belly-led"
            pattern={pattern}
            color={color}
            brightness={brightness}
            size={11}
            gap={5}
            glow
          />
        </div>
      </div>
    </div>
  );
}

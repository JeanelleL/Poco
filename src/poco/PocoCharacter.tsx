import { useEffect, useState, type CSSProperties } from 'react';
import { LedMatrix } from './LedMatrix';
import type { Pattern } from './patterns';
import { STEP_MS, isMix, upgradeMix, toRobotMove, type Move, type MoveStep } from './pocoClient';
import './moves.css';
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

function stepClass(s: MoveStep): string {
  return [
    'x-step',
    s.head && `x-head-${s.head}`,
    s.rightArm && `x-rarm-${s.rightArm}`,
    s.leftArm && `x-larm-${s.leftArm}`,
    s.feet && `x-feet-${s.feet}`,
  ]
    .filter(Boolean)
    .join(' ');
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
  // Named movements each have their own animation (moves.css, after servos/gestures.py);
  // older body + flipper pairs still use the b-* / f-* classes.
  // A mix plays one STEP_MS beat per step (repeats included), each part with its own
  // class. Poco's right arm is the flipper on the left of the screen (.flipL), so it
  // gets the x-rarm-* class, and vice versa.
  const beats = !gesture
    ? null
    : typeof gesture === 'string'
      ? [`m-${toRobotMove(gesture)}`]
      : isMix(gesture)
        ? upgradeMix(gesture).steps.flatMap((s) => Array<string>(s.times ?? 1).fill(stepClass(s)))
        : [`b-${gesture.body} f-${gesture.flippers}`];
  const beatsKey = beats?.join('|') ?? null;

  // Retrigger: drop the class, then add it back ~30ms later so the CSS
  // animation restarts even when the same move (or step) plays twice.
  useEffect(() => {
    if (!beats) {
      setGestureClass('idle');
      return;
    }
    setGestureClass(null);
    const timers = beats.flatMap((c, i) => {
      const at = i * STEP_MS * speed;
      return [window.setTimeout(() => setGestureClass(null), at), window.setTimeout(() => setGestureClass(c), at + 30)];
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [beatsKey, playId, speed]);

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
            {/* Poco's right foot is on the left of the screen, like their flippers. */}
            <g className="footL">
              <ellipse cx="104" cy="322" rx="40" ry="16" fill="#F4AE3C" />
            </g>
            <g className="footR">
              <ellipse cx="196" cy="322" rx="40" ry="16" fill="#F4AE3C" />
            </g>
            <ellipse cx="150" cy="216" rx="112" ry="110" fill="#9A9EA4" />
            <ellipse cx="150" cy="112" rx="102" ry="94" fill="#9A9EA4" />
            <ellipse cx="150" cy="236" rx="84" ry="90" fill="#FBFAF7" />
            {/* The face moves inside the head for nods, head shakes, looking and peeking. */}
            <g className="face">
              <path
                d="M150 70 C120 38 56 50 56 112 C56 154 96 176 150 178 C204 176 244 154 244 112 C244 50 180 38 150 70 Z"
                fill="#FBFAF7"
              />
              <g className="eyes">
                <ellipse cx="112" cy="108" rx="8" ry="10" fill="#1B1B1F" />
                <ellipse cx="188" cy="108" rx="8" ry="10" fill="#1B1B1F" />
                <circle cx="115" cy="104" r="2.6" fill="#FFFFFF" />
                <circle cx="191" cy="104" r="2.6" fill="#FFFFFF" />
              </g>
              <path d="M128 124 Q150 114 172 124 Q168 148 150 152 Q132 148 128 124 Z" fill="#F4AE3C" />
            </g>
          </svg>
          <LedMatrix
            className="belly-led"
            pattern={pattern}
            color={color}
            brightness={brightness}
            size={10}
            gap={4}
            glow
          />
        </div>
      </div>
    </div>
  );
}

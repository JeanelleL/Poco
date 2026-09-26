import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { friendOrName } from '../onboarding/stepMeta';
import { ORANGE } from '../poco/emotions';
import { useReducedMotion } from '../poco/useReducedMotion';
import { useApp } from './AppProvider';

const GAP = 28; // px between dot centers (~1,300 dots on an iPad Air)
const TOTAL_MS = 2300;

/**
 * Played once, right after setup: the screen becomes a big white LED panel that
 * switches on from the center out, holds a glowing heart, then scatters away
 * to reveal the app. Tap to skip; skipped entirely with Reduce Motion.
 */
export function WakeUpIntro() {
  const { state, play, finishIntro } = useApp();
  const reduced = useReducedMotion();
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    finishIntro();
  };

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }
    // Poco says hello while the screen wakes up.
    play('wave', ORANGE, 'heart', `Hi ${friendOrName(state.child.name)}! Let's play.`);
    const t = window.setTimeout(finish, TOTAL_MS);
    return () => window.clearTimeout(t);
  }, []); // once, when the intro appears

  const dots = useMemo(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = Math.ceil(w / GAP) + 1;
    const rows = Math.ceil(h / GAP) + 1;
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.hypot(cx, cy);
    // Big enough that the notch at the top and the point at the bottom read clearly.
    const heartScale = h * 0.27;
    const out: { x: number; y: number; d: number; r: number; dx: number; dy: number; heart: boolean }[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * GAP + GAP / 2 - ((cols * GAP - w) / 2);
        const y = row * GAP + GAP / 2 - ((rows * GAP - h) / 2);
        // Heart curve (x² + y² − 1)³ − x²y³ ≤ 0, centered and a little raised.
        const hx = (x - cx) / heartScale;
        const hy = -(y - cy) / heartScale + 0.25;
        const heart = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0;
        // Scatter outward from the center when the dots go out.
        const dist = Math.hypot(x - cx, y - cy) || 1;
        const push = 20 + Math.random() * 40;
        out.push({
          x,
          y,
          d: dist / reach,
          r: Math.random(),
          dx: ((x - cx) / dist) * push,
          dy: ((y - cy) / dist) * push,
          heart,
        });
      }
    }
    return out;
  }, []);

  if (reduced) return null;

  return (
    <div className="wake" onClick={finish} role="presentation" aria-hidden="true">
      {dots.map((p, i) => (
        <span
          key={i}
          className={`wake-dot${p.heart ? ' is-heart' : ''}`}
          style={{ left: p.x, top: p.y, '--d': p.d, '--r': p.r, '--dx': `${p.dx}px`, '--dy': `${p.dy}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

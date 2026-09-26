import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * One highlight that slides between tabs instead of each tab switching its own
 * background. Put `ref` on the tab row, `data-tab` on each tab, and render an
 * element with `style` inside the row. `active` = -1 hides the highlight.
 */
export function useIndicator<T extends HTMLElement>(active: number) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  // No slide on the very first placement, only when the tab changes.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const tab = ref.current?.querySelectorAll<HTMLElement>('[data-tab]')[active];
      setBox(tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null);
    };
    measure();
    // Tab widths change once the web fonts arrive, and on rotation.
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    const raf = window.requestAnimationFrame(() => setAnimate(true));
    return () => {
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(raf);
    };
  }, [active]);

  const style: CSSProperties = box
    ? { width: box.w, transform: `translateX(${box.x}px)`, opacity: 1, transition: animate ? undefined : 'none' }
    : { opacity: 0 };
  return { ref, style, ready: !!box };
}

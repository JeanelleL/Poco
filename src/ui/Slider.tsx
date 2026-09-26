import type { CSSProperties } from 'react';
import './ui.css';

interface SliderProps {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Spoken value, e.g. "40%". */
  valueText?: string;
}

export function Slider({ id, value, onChange, min = 0, max = 100, step = 5, valueText }: SliderProps) {
  const p = (value - min) / (max - min);
  return (
    <div className="slider" style={{ '--p': p } as CSSProperties}>
      <div className="slider-track" aria-hidden="true">
        <div className="slider-fill" />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

import './ui.css';

interface PillGroupProps<T extends string> {
  id: string;
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function PillGroup<T extends string>({ id, label, options, value, onChange, className }: PillGroupProps<T>) {
  const labelId = `${id}-label`;
  return (
    <div className={`pill-field${className ? ` ${className}` : ''}`}>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="pills">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`pill${option === value ? ' is-on' : ''}`}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

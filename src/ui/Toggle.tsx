import './ui.css';

interface ToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Toggle({ id, label, description, checked, onChange, className }: ToggleProps) {
  return (
    <div className={`toggle-row${className ? ` ${className}` : ''}`}>
      <div className="toggle-text" onClick={() => onChange(!checked)}>
        <span id={`${id}-label`} className="toggle-title">
          {label}
        </span>
        <span id={`${id}-desc`} className="toggle-desc">
          {description}
        </span>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

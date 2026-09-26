import type { ButtonHTMLAttributes } from 'react';
import './ui.css';

type Variant = 'primary' | 'secondary' | 'orange';

interface ChunkyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function ChunkyButton({ variant = 'primary', className, type = 'button', ...rest }: ChunkyButtonProps) {
  return <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...rest} />;
}

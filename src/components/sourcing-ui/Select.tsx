import type { SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  error?: string | null;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, required, error, options, placeholder, className = '', ...rest }: Props) {
  return (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-accent">*</span>}
        </label>
      )}
      <select className={`input appearance-none ${error ? 'border-[color:var(--c-red)]' : ''} ${className}`} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-[12px]" style={{ color: 'var(--c-red)' }}>{error}</p>}
    </div>
  );
}

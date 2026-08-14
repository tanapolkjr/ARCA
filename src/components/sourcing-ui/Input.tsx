import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps { label?: string; required?: boolean; error?: string | null; hint?: string }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  ({ label, required, error, hint, className = '', ...rest }, ref) => (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-accent">*</span>}
        </label>
      )}
      <input ref={ref} className={`input ${error ? 'border-[color:var(--c-red)]' : ''} ${className}`} {...rest} />
      {error && <p className="mt-1 text-[12px]" style={{ color: 'var(--c-red)' }}>{error}</p>}
      {!error && hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
    </div>
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  ({ label, required, error, className = '', ...rest }, ref) => (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-accent">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        className={`input h-auto min-h-[72px] py-2 resize-y ${error ? 'border-[color:var(--c-red)]' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="mt-1 text-[12px]" style={{ color: 'var(--c-red)' }}>{error}</p>}
    </div>
  ),
);
Textarea.displayName = 'Textarea';

/** Right-aligned tabular numeric input, with optional suffix (%, ฿). */
export function NumberInput({
  label, required, error, hint, suffix, value, onValue, placeholder, disabled,
}: FieldProps & {
  suffix?: string;
  value: number | '' ;
  onValue: (n: number | '') => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-accent">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          disabled={disabled}
          className={`input tnum text-right ${suffix ? 'pr-8' : ''} ${error ? 'border-[color:var(--c-red)]' : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValue(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-[12px]" style={{ color: 'var(--c-red)' }}>{error}</p>}
      {!error && hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

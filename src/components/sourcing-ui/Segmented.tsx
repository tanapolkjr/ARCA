/** Segmented control — preferred over dropdowns for ≤4 fixed options (spec §15). */
export function Segmented<T extends string>({
  options, value, onChange, label, disabled,
}: {
  options: readonly T[] | T[];
  value: T | null;
  onChange: (v: T) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="inline-flex rounded border border-line bg-subtle p-0.5 gap-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={`h-8 px-3 rounded text-[13px] font-medium transition-colors disabled:opacity-50
              ${value === o ? 'bg-surface text-ink-1 border border-line shadow-sm' : 'text-ink-2 hover:text-ink-1'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

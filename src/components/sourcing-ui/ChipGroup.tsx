/** Multi-select pill group — used for the 7 fixed Target Channels (spec §9). */
export function ChipGroup<T extends string>({
  label, options, value, onChange, disabled,
}: {
  label?: string;
  options: readonly T[] | T[];
  value: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  const toggle = (o: T) =>
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={`h-8 px-3 rounded-full border text-[13px] transition-colors disabled:opacity-50
                ${on
                  ? 'border-accent text-ink-1 font-medium'
                  : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink-1'}`}
              style={on ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

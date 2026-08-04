import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/** Chip-style tag input: type and Enter to add, × to remove, datalist suggestions. */
export function TagInput({
  label, value, onChange, placeholder, suggestions = [], disabled,
}: {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const listId = label ? `tags-${label.replace(/\s+/g, '-')}` : undefined;

  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className={`input h-auto min-h-9 flex flex-wrap items-center gap-1.5 py-1.5 ${disabled ? 'opacity-60' : ''}`}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface border border-line text-[12px]">
            {t}
            {!disabled && (
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}
                className="p-0.5 rounded-full hover:bg-subtle text-ink-3 hover:text-ink-1">
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            className="flex-1 min-w-[120px] bg-transparent outline-none text-[13px]"
            value={draft}
            list={listId}
            placeholder={value.length ? '' : placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => draft && add(draft)}
          />
        )}
        {listId && (
          <datalist id={listId}>
            {suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}
          </datalist>
        )}
      </div>
    </div>
  );
}

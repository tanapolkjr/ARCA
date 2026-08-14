/** Notion-style underline tabs (spec §9). */
export function Tabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: readonly T[] | T[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <nav className="flex gap-1 border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={active === t}
          onClick={() => onChange(t)}
          className={`h-10 px-4 text-[14px] -mb-px border-b-2 transition-colors
            ${active === t
              ? 'border-accent text-ink-1 font-medium'
              : 'border-transparent text-ink-2 hover:text-ink-1'}`}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}

import React, { useMemo, useState } from "react";
import { ChevronDown, Search, Plus, X } from "lucide-react";

export function StatCard({ icon: Icon, label, value, sub, subColor, chip }) {
  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm p-5 flex items-start justify-between">
      <div>
        <div className="text-sm text-stone-500 dark:text-stone-400 mb-2">{label}</div>
        <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">{value}</div>
        {sub && <div className={`text-xs font-medium mt-1 ${subColor || "text-stone-400"}`}>{sub}</div>}
      </div>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${chip}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-stone-600 dark:text-stone-300 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-500 bg-stone-50 dark:bg-stone-900 focus:bg-white dark:focus:bg-stone-800 transition-colors disabled:opacity-60"
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-100 bg-stone-50 dark:bg-stone-900 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900"
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <div className="relative">
      <select
        {...props}
        className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-500 bg-stone-50 dark:bg-stone-900 focus:bg-white dark:focus:bg-stone-800 transition-colors"
      >
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

export function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300",
    indigo: "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
    blue: "bg-stone-50 text-stone-600 dark:bg-stone-500/20 dark:text-stone-300",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-stone-900" : "bg-stone-200 dark:bg-stone-600"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}

// Autocomplete input with an inline "add new" affordance
export function SearchSelect({ label, required, options, asyncSearch, value, onChange, placeholder, addLabel, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [asyncResults, setAsyncResults] = useState(null); // [{ label, id }] | null
  const [searching, setSearching] = useState(false);

  const filtered = useMemo(() => {
    if (asyncSearch) return null; // async mode handles its own results below
    if (!query) return options;
    return options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  }, [query, options, asyncSearch]);

  // Debounced live search against Supabase when `asyncSearch(query)` is provided
  // (e.g. Site/Customer pickers — see api/contacts.js). Falls back to the
  // static `options` list filter above when this prop isn't passed.
  React.useEffect(() => {
    if (!asyncSearch) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await asyncSearch(query);
        if (!cancelled) setAsyncResults(results);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, asyncSearch]);

  const items = asyncSearch ? (asyncResults || []) : (filtered || []).map((o) => ({ label: o, id: null }));

  // Keep the visible text box in sync if the parent resets `value` externally
  // (e.g. loading a different record) without the user having typed anything.
  React.useEffect(() => {
    setQuery(value || "");
  }, [value]);

  return (
    <Field label={label} required={required}>
      <div className="relative">
        <TextInput
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("", null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        {open && (
          <div className="absolute z-10 mt-1.5 w-full bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-lg max-h-56 overflow-auto py-1.5">
            {searching && <div className="px-3.5 py-2 text-sm text-stone-400">กำลังค้นหา...</div>}
            {!searching && items.length === 0 && <div className="px-3.5 py-2 text-sm text-stone-400">ไม่พบผลลัพธ์ที่ตรงกัน</div>}
            {!searching && items.map((o) => (
              <button
                key={o.id || o.label}
                onMouseDown={() => {
                  setQuery(o.label);
                  onChange(o.label, o.id, o.raw);
                  setOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/10 hover:text-stone-900 dark:hover:text-stone-300 transition-colors"
              >
                {o.label}
              </button>
            ))}
            {onAddNew && (
              <div className="border-t border-stone-100 dark:border-stone-700 mt-1 pt-1">
                <button
                  onMouseDown={() => {
                    setOpen(false);
                    onAddNew(query);
                  }}
                  className="w-full flex items-center gap-2 text-left px-3.5 py-2 text-sm font-medium text-stone-900 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/10 transition-colors"
                >
                  <Plus className="w-4 h-4" /> {addLabel}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900 bg-opacity-40" onClick={onClose} />
      <div className="relative bg-white dark:bg-stone-800 rounded-2xl shadow-lg w-full max-w-lg max-h-full overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-700">
          <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function StatusCounterCard({ label, count, chip, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white dark:bg-stone-800 rounded-2xl border shadow-sm p-4 transition-colors ${
        active ? "border-stone-400 ring-2 ring-stone-100 dark:ring-stone-900/20" : "border-stone-200 dark:border-stone-700 hover:border-stone-300"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${chip}`} />
        <span className="text-sm text-stone-500 dark:text-stone-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1.5">{count}</div>
    </button>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Banner({ tone = "error", children }) {
  const tones = {
    error: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300",
    info: "bg-stone-100 dark:bg-stone-800/10 text-stone-900 dark:text-stone-100",
  };
  return <div className={`text-sm rounded-xl p-4 mb-5 ${tones[tone]}`}>{children}</div>;
}

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** 420px right-side sheet — keeps the list visible behind (spec §8). */
export function Sheet({
  open, onClose, title, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute right-0 top-0 h-full w-full max-w-[420px] bg-surface border-l border-line shadow-overlay flex flex-col"
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-subtle text-ink-2">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">{children}</div>
        {footer && <footer className="border-t border-line p-4 flex justify-end gap-2 shrink-0">{footer}</footer>}
      </div>
    </div>
  );
}

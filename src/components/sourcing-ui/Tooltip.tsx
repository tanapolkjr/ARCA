import type { ReactNode } from 'react';

/** Lightweight CSS tooltip — sufficient for criterion anchors and disabled-button hints. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-40
          w-max max-w-[260px] rounded bg-ink-1 text-app text-[12px] leading-snug px-2.5 py-1.5
          opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150
          whitespace-pre-line text-left shadow-overlay"
        style={{ background: 'var(--text-1)', color: 'var(--bg-surface)' }}
      >
        {content}
      </span>
    </span>
  );
}

/** Skeleton rows matching real layout instead of spinners (spec §18). */
export function SkeletonRows({ rows = 5, height = 40 }: { rows?: number; height?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-line px-3" style={{ height }}>
          <div className="h-3 rounded bg-subtle" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
          <div className="h-3 w-16 rounded bg-subtle ml-auto" />
        </div>
      ))}
    </div>
  );
}

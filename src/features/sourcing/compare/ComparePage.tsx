import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Columns3, Plus, TriangleAlert, X } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { listProductSummaries } from '@/sourcing-api/products';
import { ProductThumb } from '@/components/sourcing-ui/ProductThumb';
import { DecisionBadge } from '@/components/sourcing-ui/Badge';
import { EmptyState } from '@/components/sourcing-ui/EmptyState';
import { Tooltip } from '@/components/sourcing-ui/Tooltip';
import { CRITERIA } from '@/sourcing-lib/constants';
import { segmentColorVar } from '@/sourcing-lib/calculations';
import { fmtPercent, fmtScore, fmtTHB } from '@/sourcing-lib/format';
import type { ProductSummary } from '@/sourcing-lib/types';

const MAX = 4;

type MetricKey = 'landed' | 'ssp' | 'margin' | 'roi' | 'score';

interface Metric {
  key: MetricKey;
  label: string;
  value: (p: ProductSummary) => number | null;
  format: (v: number | null) => string;
  best: 'min' | 'max';
}

const METRICS: Metric[] = [
  { key: 'landed', label: 'Landed cost', value: (p) => p.latest_cost?.landed_cost ?? null, format: fmtTHB, best: 'min' },
  { key: 'ssp', label: 'Suggested price', value: (p) => p.latest_cost?.suggested_selling_price ?? null, format: fmtTHB, best: 'max' },
  { key: 'margin', label: 'Gross margin', value: (p) => p.latest_cost?.gross_margin ?? null, format: (v) => fmtPercent(v), best: 'max' },
  { key: 'roi', label: 'ROI', value: (p) => p.latest_cost?.roi ?? null, format: (v) => fmtPercent(v), best: 'max' },
  { key: 'score', label: 'Overall score', value: (p) => p.evaluation?.overall_score ?? null, format: fmtScore, best: 'max' },
];

/** Best value per row gets a soft green highlight + ▲; ties all highlight (spec §12). */
function bestIds(products: ProductSummary[], metric: Metric): Set<string> {
  const values = products
    .map((p) => ({ id: p.id, v: metric.value(p) }))
    .filter((x): x is { id: string; v: number } => x.v != null);
  if (values.length < 2) return new Set();
  const target = metric.best === 'min'
    ? Math.min(...values.map((x) => x.v))
    : Math.max(...values.map((x) => x.v));
  return new Set(values.filter((x) => x.v === target).map((x) => x.id));
}

export function ComparePage() {
  const { data: products, loading } = useQuery(listProductSummaries, []);
  const [ids, setIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const chosen = useMemo(
    () => ids.map((id) => products?.find((p) => p.id === id)).filter((p): p is ProductSummary => !!p),
    [ids, products],
  );

  /* Suggest same-category candidates first — like-for-like comparisons decide better. */
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = (products ?? []).filter((p) => !ids.includes(p.id));
    const filtered = q ? pool.filter((p) => p.name.toLowerCase().includes(q)) : pool;
    const cats = new Set(chosen.map((c) => c.category));
    return [...filtered].sort((a, b) =>
      Number(cats.has(b.category)) - Number(cats.has(a.category)) || a.name.localeCompare(b.name),
    ).slice(0, 8);
  }, [products, ids, search, chosen]);

  const add = (id: string) => {
    if (ids.length >= MAX) return;
    setIds((x) => [...x, id]);
    setSearch('');
    setPickerOpen(false);
  };

  const sameCategory = new Set(chosen.map((c) => c.category)).size <= 1;

  if (!loading && (products?.length ?? 0) < 2) {
    return (
      <EmptyState
        icon={Columns3}
        title="Comparison needs at least two products"
        body="Add more products first — then line them up side by side here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Compare</h1>

      {/* Picker */}
      <div className="flex flex-wrap items-center gap-2">
        {chosen.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 h-8 pl-1.5 pr-1 rounded-full border border-line bg-surface text-[13px]">
            <ProductThumb path={p.hero_url} size={22} />
            {p.name}
            <button aria-label={`Remove ${p.name}`} onClick={() => setIds((x) => x.filter((i) => i !== p.id))}
              className="p-1 rounded-full hover:bg-subtle text-ink-3 hover:text-ink-1">
              <X size={12} />
            </button>
          </span>
        ))}
        {ids.length < MAX && (
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="h-8 px-3 rounded-full border border-dashed border-line text-[13px] text-ink-2
                hover:border-ink-3 hover:text-ink-1 inline-flex items-center gap-1"
            >
              <Plus size={13} /> Add product ({ids.length}/{MAX})
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-9 z-40 card shadow-overlay w-72 p-1">
                <input
                  autoFocus
                  className="input mb-1"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {candidates.map((p) => (
                  <button key={p.id} onClick={() => add(p.id)}
                    className="w-full flex items-center gap-2 px-2 h-10 rounded hover:bg-subtle text-left">
                    <ProductThumb path={p.hero_url} size={26} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium truncate">{p.name}</span>
                      <span className="block text-[11px] text-ink-3 truncate">{p.category}</span>
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="px-2 py-3 text-[12px] text-ink-3">No matches.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!sameCategory && chosen.length >= 2 && (
        <p className="text-[12px] text-ink-3 flex items-center gap-1.5">
          <TriangleAlert size={12} /> These products are in different categories — numbers may not be like-for-like.
        </p>
      )}

      {chosen.length < 2 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: MAX }).map((_, i) => (
            <div key={i} className="rounded-card border border-dashed border-line h-40 flex items-center justify-center text-[12px] text-ink-3">
              {chosen[i] ? chosen[i].name : `Product ${i + 1}`}
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th className="table-th sticky left-0 bg-subtle w-40" />
                {chosen.map((p) => (
                  <th key={p.id} className="table-th font-normal normal-case tracking-normal">
                    <div className="flex flex-col items-start gap-1.5 py-2">
                      <ProductThumb path={p.hero_url} size={72} alt={p.name} />
                      <span className="text-[13px] font-semibold text-ink-1">{p.name}</span>
                      <span className="text-[11px] text-ink-3">
                        {p.category}{p.factory ? ` · ${p.factory.name}` : ''}
                      </span>
                      <DecisionBadge status={p.decision_status} size="sm" />
                      <Link to={`/sourcing/products/${p.id}`} className="text-[12px] text-accent hover:underline">Open</Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tnum">
              {METRICS.map((m) => {
                const best = bestIds(chosen, m);
                return (
                  <tr key={m.key}>
                    <td className="table-td sticky left-0 bg-surface text-[12px] font-medium text-ink-2 w-40">
                      {m.label}
                    </td>
                    {chosen.map((p) => {
                      const v = m.value(p);
                      const isBest = best.has(p.id);
                      return (
                        <td key={p.id} className="table-td"
                          style={isBest ? { background: 'color-mix(in srgb, var(--c-green) 8%, transparent)' } : undefined}>
                          <span className={isBest ? 'font-semibold' : ''} style={isBest ? { color: 'var(--c-green)' } : undefined}>
                            {m.format(v)} {isBest && '▲'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Per-criterion detail strips */}
              <tr>
                <td colSpan={chosen.length + 1} className="table-td">
                  <button
                    className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                    onClick={() => setDetailsOpen((v) => !v)}
                  >
                    {detailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {detailsOpen ? 'Hide criterion detail' : 'Show criterion detail'}
                  </button>
                </td>
              </tr>
              {detailsOpen && CRITERIA.map((c) => (
                <tr key={c.key}>
                  <td className="table-td sticky left-0 bg-surface text-[12px] text-ink-2 w-40">{c.name}</td>
                  {chosen.map((p) => {
                    const s = p.evaluation?.scores?.[c.key];
                    return (
                      <td key={p.id} className="table-td">
                        {typeof s === 'number' ? (
                          <Tooltip content={`${c.name}: ${s}/5`}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="flex h-1.5 w-14 rounded-full bg-subtle overflow-hidden">
                                <span style={{ width: `${(s / 5) * 100}%`, background: segmentColorVar(s) }} />
                              </span>
                              <span className="text-[12px]">{s}</span>
                            </span>
                          </Tooltip>
                        ) : <span className="text-ink-3 text-[12px]">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

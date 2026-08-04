import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { listProductSummaries } from '@/sourcing-api/products';
import { MetricCard } from '@/components/sourcing-ui/Card';
import { Button } from '@/components/sourcing-ui/Button';
import { EmptyState } from '@/components/sourcing-ui/EmptyState';
import { SkeletonRows } from '@/components/sourcing-ui/Skeleton';
import { DecisionBadge } from '@/components/sourcing-ui/Badge';
import { ProductCard } from './ProductCard';
import { PRODUCT_STATUSES } from '@/sourcing-lib/constants';
import { relativeTime, fmtTHB } from '@/sourcing-lib/format';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: products, loading } = useQuery(listProductSummaries, []);

  const stats = useMemo(() => {
    const list = products ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const decidedThisMonth = (status: string) =>
      list.filter((p) =>
        p.decision_status === status &&
        p.evaluation?.evaluated_at &&
        new Date(p.evaluation.evaluated_at) >= monthStart,
      ).length;
    return {
      total: list.length,
      underEval: list.filter((p) => p.status === 'Under Evaluation').length,
      approved: decidedThisMonth('Approved'),
      rejected: decidedThisMonth('Rejected'),
    };
  }, [products]);

  const byStatus = useMemo(() => {
    const map = new Map(PRODUCT_STATUSES.map((s) => [s, [] as NonNullable<typeof products>]));
    for (const p of products ?? []) map.get(p.status)?.push(p);
    return map;
  }, [products]);

  const recent = useMemo(
    () => [...(products ?? [])]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10),
    [products],
  );

  if (!loading && (products?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        body="Add your first factory to get started."
        action={<Button variant="primary" onClick={() => navigate('/sourcing/factories?new=factory')}><Plus size={14} /> New Factory</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Sourcing overview</h1>
        <Button variant="primary" onClick={() => navigate('/sourcing/factories?new=product')}>
          <Plus size={14} /> New Product
        </Button>
      </div>

      {/* Row 1 — metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Products" value={stats.total} onClick={() => navigate('/sourcing/factories')} />
        <MetricCard label="Under Evaluation" value={stats.underEval} onClick={() => navigate('/sourcing/factories')} />
        <MetricCard label="Approved This Month" value={stats.approved} color="var(--c-green)" onClick={() => navigate('/sourcing/reports')} />
        <MetricCard label="Rejected This Month" value={stats.rejected} color="var(--c-red)" onClick={() => navigate('/sourcing/reports')} />
      </div>

      {/* Row 2 — status board (read-only: status changes only via real actions) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
        {PRODUCT_STATUSES.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <section key={status} className="rounded-card bg-subtle border border-line p-2 min-h-[120px]">
              <header className="flex items-center justify-between px-1 pb-2">
                <h2 className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-2">{status}</h2>
                <span className="text-[11px] tnum text-ink-3 bg-surface border border-line rounded-full px-1.5">
                  {items.length}
                </span>
              </header>
              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
                {items.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </section>
          );
        })}
      </div>

      {/* Row 3 — recently updated */}
      <section className="card">
        <header className="flex items-center justify-between px-4 h-11 border-b border-line">
          <h2 className="text-[15px] font-semibold">Recently updated</h2>
          <button className="text-[13px] text-accent hover:underline" onClick={() => navigate('/sourcing/factories')}>
            View all
          </button>
        </header>
        {loading ? <SkeletonRows rows={5} /> : (
          <ul>
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => navigate(`/sourcing/products/${p.id}`)}
                  className="w-full flex items-center gap-3 px-4 h-11 border-t border-line first:border-t-0 hover:bg-subtle text-left"
                >
                  <span className="text-[13px] font-medium truncate">{p.name}</span>
                  <DecisionBadge status={p.decision_status} size="sm" />
                  {p.latest_cost && (
                    <span className="text-[12px] text-ink-2 tnum">Landed {fmtTHB(p.latest_cost.landed_cost)}</span>
                  )}
                  <span className="ml-auto text-[12px] text-ink-3 shrink-0">{relativeTime(p.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

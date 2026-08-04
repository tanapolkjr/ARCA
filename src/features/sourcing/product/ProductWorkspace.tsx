import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { getProductSummary } from '@/sourcing-api/products';
import { Tabs } from '@/components/sourcing-ui/Tabs';
import { StatusBadge, DecisionBadge } from '@/components/sourcing-ui/Badge';
import { ProductThumb } from '@/components/sourcing-ui/ProductThumb';
import { SkeletonRows } from '@/components/sourcing-ui/Skeleton';
import { fmtTHB, fmtScore } from '@/sourcing-lib/format';
import { scoreColorVar } from '@/sourcing-lib/calculations';
import { InfoTab } from './InfoTab';
import { CostTab } from './CostTab';
import { EvaluationTab } from './EvaluationTab';

const TABS = ['Info', 'Cost', 'Evaluation'] as const;
type Tab = (typeof TABS)[number];

/**
 * The product workspace: one place where a product goes from photo to
 * decision. Tab state lives in the URL (?tab=) so links are shareable.
 */
export function ProductWorkspace() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'Info';

  const { data: product, loading, error, refetch } = useQuery(() => getProductSummary(id), [id]);

  const setTab = useCallback(
    (t: Tab) => setParams(t === 'Info' ? {} : { tab: t }, { replace: true }),
    [setParams],
  );

  if (loading) return <div className="card"><SkeletonRows rows={8} /></div>;
  if (error || !product) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[14px] font-medium">This product could not be loaded.</p>
        <p className="mt-1 text-[13px] text-ink-2">{error ?? 'It may have been deleted.'}</p>
        <Link to="/sourcing/factories" className="mt-3 inline-block text-[13px] text-accent hover:underline">
          Back to Factory
        </Link>
      </div>
    );
  }

  const score = product.evaluation?.overall_score ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <Link to="/sourcing/factories" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink-1 w-fit">
        <ChevronLeft size={14} /> Factory / {product.factory?.name ?? '—'}
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <ProductThumb path={product.hero_url} size={64} alt={product.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight truncate">{product.name}</h1>
            <StatusBadge status={product.status} />
          </div>
          <p className="text-[13px] text-ink-2 truncate">
            {product.model_number ? `${product.model_number} · ` : ''}
            {product.category === 'Others' && product.custom_category_name
              ? product.custom_category_name : product.category}
            {product.factory ? ` · ${product.factory.name}` : ''}
          </p>
        </div>

        {/* Decision-critical numbers, always visible (spec §9) */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[12px] text-ink-2">Landed Cost</div>
            <div className="text-[18px] font-semibold tnum">{fmtTHB(product.latest_cost?.landed_cost ?? null)}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-ink-2">Overall Score</div>
            <div
              className="text-[18px] font-semibold tnum"
              style={score != null ? { color: scoreColorVar(score) } : undefined}
            >
              {fmtScore(score)}
            </div>
          </div>
          <DecisionBadge status={product.decision_status} />
        </div>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Info' && <InfoTab product={product} onChanged={refetch} />}
      {tab === 'Cost' && <CostTab product={product} onChanged={refetch} />}
      {tab === 'Evaluation' && <EvaluationTab product={product} onChanged={refetch} />}
    </div>
  );
}

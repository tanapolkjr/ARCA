import { useNavigate } from 'react-router-dom';
import { DecisionBadge } from '@/components/sourcing-ui/Badge';
import { ProductThumb } from '@/components/sourcing-ui/ProductThumb';
import { daysSince } from '@/sourcing-lib/format';
import type { ProductSummary } from '@/sourcing-lib/types';

/** The canonical product card reused across the app (spec §7). */
export function ProductCard({ product }: { product: ProductSummary }) {
  const navigate = useNavigate();
  const days = daysSince(product.updated_at);
  // Staleness nudge: amber at 7+, red at 14+ days.
  const dayColor = days >= 14 ? 'var(--c-red)' : days >= 7 ? 'var(--c-amber)' : 'var(--text-3)';

  return (
    <button
      onClick={() => navigate(`/sourcing/products/${product.id}`)}
      className="card card-hover w-full p-3 text-left flex flex-col gap-2"
    >
      <div className="flex gap-2.5">
        <ProductThumb path={product.hero_url} size={56} alt={product.name} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate">{product.name}</p>
          <p className="text-[12px] text-ink-2 truncate">
            {product.category === 'Others' && product.custom_category_name
              ? product.custom_category_name : product.category}
            {product.factory ? ` · ${product.factory.name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <DecisionBadge status={product.decision_status} size="sm" />
        <span className="text-[11px] tnum" style={{ color: dayColor }}>{days}d</span>
      </div>
    </button>
  );
}

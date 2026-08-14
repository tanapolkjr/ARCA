import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Factory as FactoryIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { useToast } from '@/hooks/useToast.jsx';
import { listFactories, deleteFactory } from '@/sourcing-api/factories';
import { listProductSummaries } from '@/sourcing-api/products';
import { Button } from '@/components/sourcing-ui/Button';
import { StatusBadge, DecisionBadge } from '@/components/sourcing-ui/Badge';
import { ProductThumb } from '@/components/sourcing-ui/ProductThumb';
import { SkeletonRows } from '@/components/sourcing-ui/Skeleton';
import { EmptyState } from '@/components/sourcing-ui/EmptyState';
import { ConfirmDialog } from '@/components/sourcing-ui/ConfirmDialog';
import { Tooltip } from '@/components/sourcing-ui/Tooltip';
import { fmtTHB, relativeTime } from '@/sourcing-lib/format';
import type { Factory, ProductSummary } from '@/sourcing-lib/types';
import { FactorySheet } from './FactorySheet';
import { NewProductSheet } from './NewProductSheet';

/** Decision-status roll-up micro-bar per factory (spec §8). */
function RollupBar({ products }: { products: ProductSummary[] }) {
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.decision_status, (counts.get(p.decision_status) ?? 0) + 1);
  const colors: Record<string, string> = {
    Approved: 'var(--c-green)', Interested: 'var(--c-blue)', Waiting: 'var(--c-amber)',
    Rejected: 'var(--c-red)', 'Not Yet Evaluated': 'var(--text-3)',
  };
  if (!products.length) return <span className="text-[12px] text-ink-3">—</span>;
  const tooltip = [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(' · ');
  return (
    <Tooltip content={tooltip}>
      <span className="flex h-1.5 w-24 rounded-full overflow-hidden bg-subtle">
        {[...counts.entries()].map(([status, n]) => (
          <span key={status} style={{ width: `${(n / products.length) * 100}%`, background: colors[status] }} />
        ))}
      </span>
    </Tooltip>
  );
}

export function FactoryPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [editFactory, setEditFactory] = useState<Factory | 'new' | null>(null);
  const [newProductFactory, setNewProductFactory] = useState<Factory | 'pick' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Factory | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const factoriesQ = useQuery(listFactories, []);
  const productsQ = useQuery(listProductSummaries, []);
  const loading = factoriesQ.loading || productsQ.loading;

  // Deep links from the sidebar "+ New" menu and command palette.
  useEffect(() => {
    const intent = params.get('new');
    if (intent === 'factory') setEditFactory('new');
    if (intent === 'product') setNewProductFactory('pick');
    const focus = params.get('focus');
    if (focus) setExpanded((s) => new Set(s).add(focus));
    if (intent || focus) setParams({}, { replace: true });
  }, [params, setParams]);

  const productsByFactory = useMemo(() => {
    const map = new Map<string, ProductSummary[]>();
    for (const p of productsQ.data ?? []) {
      if (!map.has(p.factory_id)) map.set(p.factory_id, []);
      map.get(p.factory_id)!.push(p);
    }
    return map;
  }, [productsQ.data]);

  /* Search filters factories AND products; matching products auto-expand their factory. */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const factories = factoriesQ.data ?? [];
    if (!q) return { factories, autoExpand: new Set<string>() };
    const autoExpand = new Set<string>();
    const keep = factories.filter((f) => {
      const fMatch = f.name.toLowerCase().includes(q);
      const pMatch = (productsByFactory.get(f.id) ?? []).some((p) => p.name.toLowerCase().includes(q));
      if (pMatch) autoExpand.add(f.id);
      return fMatch || pMatch;
    });
    return { factories: keep, autoExpand };
  }, [search, factoriesQ.data, productsByFactory]);

  const isExpanded = (f: Factory) =>
    allExpanded ||
    expanded.has(f.id) ||
    visible.autoExpand.has(f.id) ||
    (productsByFactory.get(f.id) ?? []).length === 0; // zero-product factories always show their empty state

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onDelete = async (f: Factory) => {
    try {
      await deleteFactory(f.id);
      toast(`Factory “${f.name}” deleted.`);
      void factoriesQ.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
    }
    setConfirmDelete(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Factories &amp; products</h1>
        <Button variant="primary" onClick={() => setEditFactory('new')}><Plus size={14} /> New Factory</Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search factories and products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={() => setAllExpanded((v) => !v)}>
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="table-th w-8" />
              <th className="table-th">Name</th>
              <th className="table-th">Platform</th>
              <th className="table-th">Country</th>
              <th className="table-th text-right">MOQ</th>
              <th className="table-th">Lead time</th>
              <th className="table-th text-right"># Products</th>
              <th className="table-th">Decisions</th>
              <th className="table-th w-32" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9}><SkeletonRows rows={6} /></td></tr>
            )}
            {!loading && visible.factories.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={FactoryIcon}
                    title={search ? `No matches for “${search}”` : 'No factories yet'}
                    body={search ? undefined : 'A factory is where products are sourced from. Add one to start.'}
                    action={!search && (
                      <Button variant="primary" onClick={() => setEditFactory('new')}><Plus size={14} /> New Factory</Button>
                    )}
                  />
                </td>
              </tr>
            )}
            {visible.factories.map((f) => {
              const products = productsByFactory.get(f.id) ?? [];
              const open = isExpanded(f);
              return (
                <FactoryRows
                  key={f.id}
                  factory={f}
                  products={products}
                  open={open}
                  highlightId={highlightId}
                  onToggle={() => toggle(f.id)}
                  onEdit={() => setEditFactory(f)}
                  onDelete={() => setConfirmDelete(f)}
                  onAddProduct={() => setNewProductFactory(f)}
                  onOpenProduct={(id) => navigate(`/sourcing/products/${id}`)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <FactorySheet
        open={editFactory !== null}
        factory={editFactory === 'new' ? null : editFactory}
        existingNames={(factoriesQ.data ?? []).map((f) => f.name)}
        onClose={() => setEditFactory(null)}
        onSaved={(f) => {
          setEditFactory(null);
          setHighlightId(f.id);
          setTimeout(() => setHighlightId(null), 1400);
          void factoriesQ.refetch();
        }}
      />

      <NewProductSheet
        open={newProductFactory !== null}
        factory={newProductFactory === 'pick' ? null : newProductFactory}
        factories={factoriesQ.data ?? []}
        onClose={() => setNewProductFactory(null)}
        onCreated={(id) => navigate(`/sourcing/products/${id}`)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete “${confirmDelete?.name}”?`}
        body="This removes the factory from the directory. Factories with products can’t be deleted."
        confirmLabel="Delete factory"
        danger
        onConfirm={() => confirmDelete && void onDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function FactoryRows({
  factory: f, products, open, highlightId, onToggle, onEdit, onDelete, onAddProduct, onOpenProduct,
}: {
  factory: Factory;
  products: ProductSummary[];
  open: boolean;
  highlightId: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddProduct: () => void;
  onOpenProduct: (id: string) => void;
}) {
  const hasProducts = products.length > 0;
  return (
    <>
      <tr className={`group hover:bg-subtle ${highlightId === f.id ? 'row-highlight' : ''}`}>
        <td className="table-td">
          <button onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}
            className="p-1 rounded hover:bg-surface text-ink-3">
            <ChevronRight size={14} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
          </button>
        </td>
        <td className="table-td font-medium cursor-pointer" onClick={onToggle}>{f.name}</td>
        <td className="table-td">
          {f.platform
            ? <span className="badge-outline" style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}>{f.platform}</span>
            : <span className="text-ink-3">—</span>}
        </td>
        <td className="table-td text-ink-2">
          {[f.city, f.country].filter(Boolean).join(', ') || '—'}
        </td>
        <td className="table-td text-right tnum">{f.moq != null ? f.moq.toLocaleString() : '—'}</td>
        <td className="table-td text-ink-2">{f.lead_time ?? '—'}</td>
        <td className="table-td text-right tnum">{products.length}</td>
        <td className="table-td"><RollupBar products={products} /></td>
        <td className="table-td">
          <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip content="Add product">
              <button onClick={onAddProduct} aria-label="Add product" className="p-1.5 rounded hover:bg-surface text-ink-2"><Plus size={14} /></button>
            </Tooltip>
            <Tooltip content="Edit factory">
              <button onClick={onEdit} aria-label="Edit factory" className="p-1.5 rounded hover:bg-surface text-ink-2"><Pencil size={14} /></button>
            </Tooltip>
            <Tooltip content={hasProducts ? 'Remove or reassign this factory’s products first.' : 'Delete factory'}>
              <button
                onClick={onDelete}
                disabled={hasProducts}
                aria-label="Delete factory"
                className="p-1.5 rounded hover:bg-surface text-ink-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </div>
        </td>
      </tr>

      {open && hasProducts && products.map((p) => (
        <tr
          key={p.id}
          onClick={() => onOpenProduct(p.id)}
          className="cursor-pointer hover:bg-subtle"
        >
          <td className="table-td" />
          <td className="table-td" colSpan={4}>
            {/* Hairline left rail connects sub-rows to the parent (spec §8). */}
            <div className="flex items-center gap-2.5 pl-4 border-l-2 border-line ml-1">
              <ProductThumb path={p.hero_url} size={32} alt={p.name} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{p.name}</p>
                <p className="text-[11px] text-ink-3 truncate">
                  {p.category === 'Others' && p.custom_category_name ? p.custom_category_name : p.category}
                </p>
              </div>
            </div>
          </td>
          <td className="table-td"><StatusBadge status={p.status} /></td>
          <td className="table-td text-right tnum">{fmtTHB(p.latest_cost?.landed_cost ?? null)}</td>
          <td className="table-td"><DecisionBadge status={p.decision_status} size="sm" /></td>
          <td className="table-td text-right text-[12px] text-ink-3">{relativeTime(p.updated_at)}</td>
        </tr>
      ))}

      {open && !hasProducts && (
        <tr>
          <td className="table-td" />
          <td className="table-td" colSpan={8}>
            <div className="flex items-center gap-3 pl-4 border-l-2 border-line ml-1 text-[13px] text-ink-2">
              No products yet —
              <Button variant="ghost" size="sm" onClick={onAddProduct}><Plus size={12} /> Add Product</Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

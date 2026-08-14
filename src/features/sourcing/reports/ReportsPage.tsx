import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { listProductSummaries } from '@/sourcing-api/products';
import { listUsers } from '@/sourcing-api/users';
import { listChannels } from '@/sourcing-api/channels';
import { Tabs } from '@/components/sourcing-ui/Tabs';
import { Button } from '@/components/sourcing-ui/Button';
import { DecisionBadge } from '@/components/sourcing-ui/Badge';
import { ProductThumb } from '@/components/sourcing-ui/ProductThumb';
import { SkeletonRows } from '@/components/sourcing-ui/Skeleton';
import { CATEGORIES, CHANNELS, DECISION_LABEL, DECISION_STATUSES } from '@/sourcing-lib/constants';
import { downloadCSV } from '@/sourcing-lib/csv';
import { APP_SLUG } from '@/sourcing-lib/constants';
import { fmtDate, fmtPercent, fmtTHB } from '@/sourcing-lib/format';
import type { ProductSummary } from '@/sourcing-lib/types';

const TABS = ['Decision Log', 'Margin Summary', 'Channel Summary'] as const;
type Tab = (typeof TABS)[number];

interface Filters {
  from: string;
  to: string;
  category: string;
  decision: string;
  channel: string;
}

const noFilters: Filters = { from: '', to: '', category: '', decision: '', channel: '' };

export function ReportsPage() {
  const { data: products, loading } = useQuery(listProductSummaries, []);
  const { data: users } = useQuery(() => listUsers(true), []);
  const { data: channelOptions } = useQuery(listChannels, []);
  const [tab, setTab] = useState<Tab>('Decision Log');
  const [f, setF] = useState<Filters>(noFilters);

  const userName = (id: string | null | undefined) =>
    users?.find((u) => u.id === id)?.name ?? '—';

  /* One filter bar drives all three tabs (spec §13). */
  const filtered = useMemo(() => {
    return (products ?? []).filter((p) => {
      if (f.category && p.category !== f.category) return false;
      if (f.decision && p.decision_status !== f.decision) return false;
      if (f.channel && !p.target_channels.includes(f.channel as never)) return false;
      const at = p.evaluation?.evaluated_at;
      if (f.from && (!at || at < new Date(f.from).toISOString())) return false;
      if (f.to) {
        const end = new Date(f.to);
        end.setDate(end.getDate() + 1);
        if (!at || at >= end.toISOString()) return false;
      }
      return true;
    });
  }, [products, f]);

  const decided = useMemo(
    () => filtered
      .filter((p) => p.decision_status !== 'Not Yet Evaluated' && p.evaluation)
      .sort((a, b) => (b.evaluation!.evaluated_at ?? '').localeCompare(a.evaluation!.evaluated_at ?? '')),
    [filtered],
  );

  const headline = useMemo(() => ({
    decided: decided.length,
    approved: decided.filter((p) => p.decision_status === 'Approved').length,
    rejected: decided.filter((p) => p.decision_status === 'Rejected').length,
  }), [decided]);

  /* Margin summary by category (all filtered products with a cost estimate). */
  const marginRows = useMemo(() => {
    const withCost = filtered.filter((p) => p.latest_cost);
    const byCat = new Map<string, ProductSummary[]>();
    for (const p of withCost) {
      const label = p.category === 'Others' && p.custom_category_name ? p.custom_category_name : p.category;
      if (!byCat.has(label)) byCat.set(label, []);
      byCat.get(label)!.push(p);
    }
    const avg = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const rows = [...byCat.entries()].map(([category, list]) => ({
      category,
      count: list.length,
      landed: avg(list.map((p) => p.latest_cost!.landed_cost)),
      ssp: avg(list.map((p) => p.latest_cost!.suggested_selling_price)),
      margin: avg(list.map((p) => p.latest_cost!.gross_margin)),
      roi: avg(list.map((p) => p.latest_cost!.roi)),
    })).sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1));
    const all = {
      category: 'All categories',
      count: withCost.length,
      landed: avg(withCost.map((p) => p.latest_cost!.landed_cost)),
      ssp: avg(withCost.map((p) => p.latest_cost!.suggested_selling_price)),
      margin: avg(withCost.map((p) => p.latest_cost!.gross_margin)),
      roi: avg(withCost.map((p) => p.latest_cost!.roi)),
    };
    return { rows, all };
  }, [filtered]);

  /* Live channel list = Settings options ∪ tags already used on products,
     so removed channels still report their historical products. */
  const channelNames = useMemo(() => {
    const fromSettings = channelOptions?.map((c) => c.name) ?? CHANNELS;
    const inUse = (products ?? []).flatMap((p) => p.target_channels);
    return [...new Set([...fromSettings, ...inUse])];
  }, [channelOptions, products]);

  /* Channel summary: products per target channel (arrays un-nested). */
  const channelRows = useMemo(() => {
    const counts = channelNames.map((channel) => ({
      channel,
      count: filtered.filter((p) => p.target_channels.includes(channel)).length,
      approved: filtered.filter((p) => p.target_channels.includes(channel) && p.decision_status === 'Approved').length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return { counts, max };
  }, [filtered, channelNames]);

  const exportCSV = () => {
    if (tab === 'Decision Log') {
      downloadCSV(`${APP_SLUG}-decision-log.csv`,
        ['Product', 'Category', 'Factory', 'Decision', 'Decided by', 'Date', 'Reason'],
        decided.map((p) => [
          p.name,
          p.category === 'Others' && p.custom_category_name ? p.custom_category_name : p.category,
          p.factory?.name ?? '',
          DECISION_LABEL[p.decision_status],
          userName(p.evaluation?.evaluated_by),
          fmtDate(p.evaluation?.evaluated_at),
          p.evaluation?.decision_reason ?? '',
        ]));
    } else if (tab === 'Margin Summary') {
      downloadCSV(`${APP_SLUG}-margin-summary.csv`,
        ['Category', 'Products', 'Avg landed cost (THB)', 'Avg suggested price (THB)', 'Avg gross margin %', 'Avg ROI %'],
        [...marginRows.rows, marginRows.all].map((r) => [
          r.category, r.count,
          r.landed?.toFixed(2) ?? '', r.ssp?.toFixed(2) ?? '',
          r.margin?.toFixed(1) ?? '', r.roi?.toFixed(1) ?? '',
        ]));
    } else {
      downloadCSV(`${APP_SLUG}-channel-summary.csv`,
        ['Channel', 'Products targeting', 'Approved'],
        channelRows.counts.map((c) => [c.channel, c.count, c.approved]));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold tracking-tight">Sourcing reports</h1>
        <div className="flex gap-2">
          <Button onClick={exportCSV}><Download size={14} /> Export CSV</Button>
          <Button onClick={() => window.print()}><Printer size={14} /> Print</Button>
        </div>
      </div>

      {/* Shared filter bar */}
      <div className="flex flex-wrap items-end gap-2 no-print">
        <div>
          <span className="label">From</span>
          <input type="date" className="input w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </div>
        <div>
          <span className="label">To</span>
          <input type="date" className="input w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
        <div>
          <span className="label">Category</span>
          <select className="input w-44" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Decision</span>
          <select className="input w-44" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })}>
            <option value="">All decisions</option>
            {DECISION_STATUSES.filter((d) => d !== 'Not Yet Evaluated').map((d) => (
              <option key={d} value={d}>{DECISION_LABEL[d]}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Channel</span>
          <select className="input w-44" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            <option value="">All channels</option>
            {channelNames.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {JSON.stringify(f) !== JSON.stringify(noFilters) && (
          <Button variant="ghost" size="sm" onClick={() => setF(noFilters)}>Clear</Button>
        )}
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <div className="card p-3"><p className="text-[12px] text-ink-2">Decisions</p><p className="text-[24px] font-semibold tnum">{headline.decided}</p></div>
        <div className="card p-3"><p className="text-[12px] text-ink-2">Approved</p><p className="text-[24px] font-semibold tnum" style={{ color: 'var(--c-green)' }}>{headline.approved}</p></div>
        <div className="card p-3"><p className="text-[12px] text-ink-2">Rejected</p><p className="text-[24px] font-semibold tnum" style={{ color: 'var(--c-red)' }}>{headline.rejected}</p></div>
      </div>

      <div className="no-print">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {loading && <div className="card"><SkeletonRows rows={6} /></div>}

      {!loading && tab === 'Decision Log' && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr>
                <th className="table-th">Product</th>
                <th className="table-th">Category</th>
                <th className="table-th">Decision</th>
                <th className="table-th">Decided by</th>
                <th className="table-th">Date</th>
                <th className="table-th w-2/5">Reason</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((p) => (
                <tr key={p.id} className="align-top hover:bg-subtle">
                  <td className="table-td py-2">
                    <Link to={`/sourcing/products/${p.id}`} className="flex items-center gap-2 hover:underline">
                      <ProductThumb path={p.hero_url} size={28} />
                      <span className="text-[13px] font-medium">{p.name}</span>
                    </Link>
                  </td>
                  <td className="table-td text-ink-2">
                    {p.category === 'Others' && p.custom_category_name ? p.custom_category_name : p.category}
                  </td>
                  <td className="table-td"><DecisionBadge status={p.decision_status} size="sm" /></td>
                  <td className="table-td text-ink-2">{userName(p.evaluation?.evaluated_by)}</td>
                  <td className="table-td text-ink-2 whitespace-nowrap">{fmtDate(p.evaluation?.evaluated_at)}</td>
                  <td className="table-td text-ink-2">
                    <span className="line-clamp-2">{p.evaluation?.decision_reason}</span>
                  </td>
                </tr>
              ))}
              {decided.length === 0 && (
                <tr><td colSpan={6} className="table-td text-ink-3 h-16">No decisions match these filters yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'Margin Summary' && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px] tnum">
            <thead>
              <tr>
                <th className="table-th">Category</th>
                <th className="table-th text-right">Products</th>
                <th className="table-th text-right">Avg landed</th>
                <th className="table-th text-right">Avg suggested price</th>
                <th className="table-th">Avg gross margin</th>
                <th className="table-th text-right">Avg ROI</th>
              </tr>
            </thead>
            <tbody>
              {marginRows.rows.map((r) => (
                <tr key={r.category} className="hover:bg-subtle">
                  <td className="table-td font-medium">{r.category}</td>
                  <td className="table-td text-right">{r.count}</td>
                  <td className="table-td text-right">{fmtTHB(r.landed)}</td>
                  <td className="table-td text-right">{fmtTHB(r.ssp)}</td>
                  <td className="table-td">
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-1.5 w-24 rounded-full bg-subtle overflow-hidden">
                        <span style={{
                          width: `${Math.min(100, Math.max(0, r.margin ?? 0))}%`,
                          background: (r.margin ?? 0) >= 30 ? 'var(--c-green)' : 'var(--c-amber)',
                        }} />
                      </span>
                      {fmtPercent(r.margin)}
                    </span>
                  </td>
                  <td className="table-td text-right">{fmtPercent(r.roi)}</td>
                </tr>
              ))}
              {marginRows.rows.length === 0 && (
                <tr><td colSpan={6} className="table-td text-ink-3 h-16">No cost estimates match these filters yet.</td></tr>
              )}
            </tbody>
            {marginRows.rows.length > 0 && (
              <tfoot>
                <tr className="bg-subtle font-medium">
                  <td className="table-td">{marginRows.all.category}</td>
                  <td className="table-td text-right">{marginRows.all.count}</td>
                  <td className="table-td text-right">{fmtTHB(marginRows.all.landed)}</td>
                  <td className="table-td text-right">{fmtTHB(marginRows.all.ssp)}</td>
                  <td className="table-td">{fmtPercent(marginRows.all.margin)}</td>
                  <td className="table-td text-right">{fmtPercent(marginRows.all.roi)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!loading && tab === 'Channel Summary' && (
        <div className="card p-5 flex flex-col gap-3 max-w-2xl">
          {channelRows.counts.map((c) => (
            <div key={c.channel} className="grid grid-cols-[180px_1fr_auto] items-center gap-3">
              <span className="text-[13px]">{c.channel}</span>
              <span className="flex h-2 rounded-full bg-subtle overflow-hidden">
                <span style={{ width: `${(c.count / channelRows.max) * 100}%`, background: 'var(--accent)' }} />
              </span>
              <span className="text-[12px] text-ink-2 tnum whitespace-nowrap">
                {c.count} {c.count === 1 ? 'product' : 'products'}
                {c.approved > 0 && <span style={{ color: 'var(--c-green)' }}> · {c.approved} approved</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

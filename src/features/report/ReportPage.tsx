/**
 * Module Report — มุมมองเจ้าของธุรกิจและผู้ถือหุ้น
 *
 * หน้าเดียว 4 มุมมอง (เปลี่ยนด้วย ?view= ให้กดย้อนกลับของเบราว์เซอร์ได้):
 *   overview    ภาพรวม: รายได้รวม · สรุปยอดเก็บเงิน · ยอดค้างรับ · ยอดขายแยก 3 มิติ
 *   collection  ใบเสนอราคาที่ขายได้ ทีละใบ — ขาย / วางบิล / เก็บได้ + เอกสารลูก
 *   ar          ยอดค้างรับรายใบ / รายลูกค้า แยกตามกำหนดชำระ
 *   sales       ยอดขายตามสินค้า / ลูกค้า / แหล่งที่มา พร้อมไส้ในและใบต้นทาง
 *
 * ตัวเลขทุกตัวก่อน VAT · นิยามอยู่ที่ accounting-lib/report.ts
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { loadReportData } from '@/accounting-api/report';
import {
  buildReport, pct, periodOf, type ArRow, type Bucket, type Report, type Slice,
} from '@/accounting-lib/report';
import { AR_DOC_LABEL } from '@/accounting-lib/types';

// ------------------------------------------------------------------ helpers

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthLabel = (ym: string) => TH_MONTH[Number(ym.slice(5, 7)) - 1];
const thDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const docHref = (type: string, id: string) => `/accounting/${type}/${id}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const card = 'bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 md:p-6 min-w-0';
const eyebrow = 'text-xs font-semibold tracking-wider uppercase text-stone-500 dark:text-stone-400';
const more = 'inline-flex items-center gap-1 text-sm font-medium text-stone-800 dark:text-stone-200 px-3 py-2 -mx-3 -my-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800';

const BUCKET: Record<Bucket, { label: string; box: string; text: string; bar: string; pill: string }> = {
  over:  { label: 'เกินกำหนดชำระ', box: 'border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900',
           text: 'text-orange-800 dark:text-orange-300', bar: 'bg-orange-700',
           pill: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900' },
  soon:  { label: 'ครบกำหนดภายใน 7 วัน', box: 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900',
           text: 'text-blue-800 dark:text-blue-300', bar: 'bg-blue-600',
           pill: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900' },
  later: { label: 'ยังไม่ถึงกำหนด', box: 'border-stone-200 bg-white dark:bg-stone-900 dark:border-stone-800',
           text: 'text-stone-700 dark:text-stone-300', bar: 'bg-stone-400',
           pill: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700' },
  nodue: { label: 'ไม่ได้ระบุวันครบกำหนด', box: 'border-dashed border-stone-300 bg-white dark:bg-stone-900 dark:border-stone-700',
           text: 'text-stone-600 dark:text-stone-400', bar: 'bg-stone-300',
           pill: 'bg-white text-stone-600 border-stone-300 border-dashed dark:bg-stone-900 dark:text-stone-400' },
};

function whenText(r: ArRow) {
  if (r.days == null) return 'ไม่ระบุกำหนด';
  if (r.days < 0) return `เกิน ${-r.days} วัน`;
  if (r.days === 0) return 'ครบกำหนดวันนี้';
  return `อีก ${r.days} วัน`;
}
function arStatus(r: ArRow) {
  return r.paid_any ? 'รับแล้วบางส่วน' : 'วางบิลแล้ว ยังไม่รับเงิน';
}

// ------------------------------------------------------------------ page

type View = 'overview' | 'collection' | 'ar' | 'sales' | 'profit';
type Mode = 'all' | 'year' | 'month';

export default function ReportPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'overview';
  const go = (v: View, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    Object.entries(extra).forEach(([k, val]) => next.set(k, val));
    if (v === 'overview') next.delete('view');
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  const now = new Date();
  const [mode, setMode] = useState<Mode>('all');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const period = useMemo(() => periodOf(mode, year, month), [mode, year, month]);
  const periodText = mode === 'all' ? 'ตั้งแต่เปิดบริษัท'
    : mode === 'year' ? `ปี ${year}` : `${TH_MONTH[month - 1]} ${year}`;

  const dataQ = useQuery(() => loadReportData(), []);
  const today = todayStr();
  const report = useMemo(
    () => (dataQ.data ? buildReport(dataQ.data.docs, dataQ.data.items, dataQ.data.allocs,
                                    dataQ.data.sources, period, today,
                                    dataQ.data.pos, dataQ.data.poItems) : null),
    [dataQ.data, period, today]);

  const years = useMemo(() => {
    const ys = new Set<number>([now.getFullYear()]);
    dataQ.data?.docs.forEach((d) => ys.add(Number(d.doc_date.slice(0, 4))));
    return [...ys].sort((a, b) => b - a);
  }, [dataQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-16">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          {view !== 'overview' && (
            <button onClick={() => go('overview')}
                    className="self-start inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 py-1.5">
              <ArrowLeft className="w-4 h-4" /> ภาพรวม Report
            </button>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-50">
            {view === 'overview' && 'ภาพรวมธุรกิจ'}
            {view === 'collection' && 'สรุปยอดเก็บเงิน'}
            {view === 'ar' && 'ยอดค้างรับ'}
            {view === 'sales' && 'ยอดขายแยกตามมิติ'}
            {view === 'profit' && 'กำไรต่องาน'}
            {view !== 'ar' && <span className="font-normal text-stone-500"> · {periodText}</span>}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            ยอดก่อน VAT · ไม่นับเอกสารที่ยกเลิก · กดตัวเลขหรือแถวเพื่อดูเอกสารต้นทาง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-stone-100 dark:bg-stone-800 rounded-xl p-1 gap-0.5" role="group" aria-label="ช่วงเวลา">
            {([['all', 'ทั้งหมด'], ['year', 'รายปี'], ['month', 'รายเดือน']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                      className={`text-sm px-3.5 py-2 rounded-lg min-h-[36px] ${mode === m
                        ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-50 font-semibold shadow-sm'
                        : 'text-stone-500 hover:text-stone-800'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode !== 'all' && (
            <select aria-label="ปี" value={year} onChange={(e) => setYear(Number(e.target.value))}
                    className="text-sm border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-xl px-3 py-2 min-h-[40px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {mode === 'month' && (
            <select aria-label="เดือน" value={month} onChange={(e) => setMonth(Number(e.target.value))}
                    className="text-sm border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 rounded-xl px-3 py-2 min-h-[40px]">
              {TH_MONTH.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <button onClick={() => void dataQ.refetch()} title="โหลดข้อมูลใหม่" aria-label="โหลดข้อมูลใหม่"
                  className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-900 bg-white dark:bg-stone-900">
            <RefreshCw className={`w-4 h-4 ${dataQ.loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {dataQ.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
          โหลดข้อมูลไม่สำเร็จ: {dataQ.error instanceof Error ? dataQ.error.message : String(dataQ.error)}
        </div>
      )}
      {!report && !dataQ.error && <div className="py-24 text-center text-stone-400">กำลังคำนวณ…</div>}

      {report && view === 'overview' && <Overview r={report} go={go} periodText={periodText} mode={mode} />}
      {report && view === 'collection' && <CollectionView r={report} />}
      {report && view === 'profit' && <ProfitView r={report} />}
      {report && view === 'ar' && <ArView r={report} />}
      {report && view === 'sales' && (
        <SalesView r={report} dim={(params.get('dim') as 'p' | 'c' | 's') || 'p'}
                   setDim={(d) => go('sales', { dim: d })} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ r, go, periodText, mode }: {
  r: Report; go: (v: View, extra?: Record<string, string>) => void; periodText: string; mode: Mode;
}) {
  const max = Math.max(1, ...r.monthly.map((m) => m.amount));
  const b = r.ar.byBucket;
  const debtors = useMemo(() => groupByCustomer(r.ar.rows).slice(0, 8), [r]);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* รายได้รวม */}
        <section className={`${card} flex flex-col gap-5`}>
          <div className="flex justify-between items-center gap-3">
            <h2 className={eyebrow}>รายได้รวม · {periodText}</h2>
            <button className={more} onClick={() => go('profit')}>กำไรต่องาน <ArrowUpRight className="w-4 h-4" /></button>
          </div>
          <div>
            <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">฿{fmt(r.revenue)}</div>
            <div className="text-sm text-stone-500 mt-1">
              เงินที่ลูกค้าชำระแล้ว จาก {r.revenueCount} ใบวางบิล
              {mode !== 'all' && <> · ตั้งแต่เปิดบริษัท ฿{fmt(r.revenueAllTime)}</>}
            </div>
          </div>
          <RevenueSplit r={r} onOpen={() => go('profit')} />
          <div>
            <div className="flex items-end gap-1.5 h-36 border-b border-stone-200 dark:border-stone-700">
              {r.monthly.map((m) => (
                <div key={m.month} className="flex-1 h-full flex flex-col justify-end group relative" title={`${monthLabel(m.month)} ${m.month.slice(0, 4)} · ฿${fmt(m.amount)}`}>
                  <div className="rounded-t-md bg-stone-800 dark:bg-stone-300 group-hover:bg-stone-950"
                       style={{ height: `${Math.max(m.amount > 0 ? 3 : 0, m.amount / max * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {r.monthly.map((m) => (
                <div key={m.month} className="flex-1 text-center text-[11px] text-stone-500">{monthLabel(m.month)}</div>
              ))}
            </div>
          </div>
        </section>

        {/* สรุปยอดเก็บเงิน */}
        <section className={`${card} flex flex-col gap-5`}>
          <div className="flex justify-between items-center gap-3">
            <h2 className={eyebrow}>สรุปยอดเก็บเงิน · {periodText}</h2>
            <button className={more} onClick={() => go('collection')}>ดูรายใบ <ArrowUpRight className="w-4 h-4" /></button>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl md:text-5xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">
              {pct(r.soldCollected, r.sold)}%
            </div>
            <div className="text-sm text-stone-500">ของยอดที่ขายได้ เก็บเป็นเงินแล้ว</div>
          </div>
          <div className="flex flex-col gap-4">
            <Funnel label="ขายได้" hint={`${r.soldCount} ใบเสนอราคาที่อนุมัติและวางบิลแล้ว`} amount={r.sold} p={100} tone="bg-stone-400" onClick={() => go('collection')} />
            <Funnel label="วางบิลแล้ว" hint={`${pct(r.soldBilled, r.sold)}%`} amount={r.soldBilled} p={pct(r.soldBilled, r.sold)} tone="bg-stone-600" onClick={() => go('collection')} />
            <Funnel label="เก็บเงินได้" hint={`${pct(r.soldCollected, r.sold)}%`} amount={r.soldCollected} p={pct(r.soldCollected, r.sold)} tone="bg-stone-900 dark:bg-stone-100" onClick={() => go('collection')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => go('collection')} className="text-left bg-stone-50 dark:bg-stone-800/60 rounded-xl px-4 py-3 hover:bg-stone-100">
              <div className="text-xs text-stone-500">ขายแล้ว ยังวางบิลไม่ครบ</div>
              <div className="text-lg font-semibold tabular-nums">฿{fmt(r.unbilledOfSold)}</div>
            </button>
            <button onClick={() => go('ar')} className="text-left bg-stone-50 dark:bg-stone-800/60 rounded-xl px-4 py-3 hover:bg-stone-100">
              <div className="text-xs text-stone-500">วางบิลแล้ว ยังเก็บไม่ได้</div>
              <div className="text-lg font-semibold tabular-nums">฿{fmt(Math.max(0, r.soldBilled - r.soldCollected))}</div>
            </button>
          </div>
        </section>
      </div>

      {/* ยอดค้างรับ */}
      <section className={`${card} flex flex-col gap-5`}>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className={eyebrow}>ยอดค้างรับ · ณ วันนี้</h2>
            <span className="text-2xl font-bold tabular-nums">฿{fmt(r.ar.total)}</span>
            <span className="text-sm text-stone-500">{r.ar.rows.length} ใบ จาก {groupByCustomer(r.ar.rows).length} ลูกค้า</span>
          </div>
          <button className={more} onClick={() => go('ar')}>ดูทุกใบ <ArrowUpRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['over', 'soon', 'later'] as Bucket[]).map((k) => (
            <button key={k} onClick={() => go('ar', { bucket: k })}
                    className={`text-left border rounded-2xl p-4 ${BUCKET[k].box}`}>
              <div className={`text-sm font-semibold ${BUCKET[k].text}`}>{BUCKET[k].label}</div>
              <div className={`text-3xl font-bold tabular-nums ${BUCKET[k].text}`}>
                {b[k].count} <span className="text-base font-medium">รายการ</span>
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-400 tabular-nums">฿{fmt(b[k].amount)}</div>
            </button>
          ))}
        </div>
        {b.nodue.count > 0 && (
          <button onClick={() => go('ar', { bucket: 'nodue' })}
                  className="self-start text-sm text-stone-600 underline underline-offset-4 decoration-stone-300 py-1">
            มี {b.nodue.count} ใบที่ไม่ได้ระบุวันครบกำหนด (฿{fmt(b.nodue.amount)}) — ควรเข้าไปใส่วันครบกำหนด
          </button>
        )}
        {debtors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs text-stone-500 text-left">
                  <th className="font-normal pb-2 px-2">ลูกค้า</th>
                  <th className="font-normal pb-2 px-2 text-right">ใบ</th>
                  <th className="font-normal pb-2 px-2 text-right">ยอดค้าง</th>
                  <th className="font-normal pb-2 px-2">สถานะปัจจุบัน</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((d) => (
                  <tr key={d.name} onClick={() => go('ar', { view2: 'cus' })}
                      className="border-t border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer">
                    <td className="py-3 px-2 font-medium">{d.name}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-stone-500">{d.count}</td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold">฿{fmt(d.amount)}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border ${BUCKET[d.worst.bucket].pill}`}>
                        {whenText(d.worst)} · {arStatus(d.worst)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-stone-400">ไม่มียอดค้างรับ</p>}
      </section>

      {/* ยอดขายแยก 3 มิติ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {([['p', 'ยอดขายตามสินค้า', r.byProduct], ['c', 'ยอดขายตามลูกค้า', r.byCustomer], ['s', 'ยอดขายตามแหล่งที่มา', r.bySource]] as [string, string, Slice[]][])
          .map(([dim, title, slices]) => (
            <section key={dim} className={`${card} flex flex-col gap-4`}>
              <div className="flex justify-between items-center gap-3">
                <h2 className={eyebrow}>{title}</h2>
                <button className={more} onClick={() => go('sales', { dim })}>ดูละเอียด <ArrowUpRight className="w-4 h-4" /></button>
              </div>
              <SliceBars slices={topWithOther(slices, 5, r.sold)} onPick={() => go('sales', { dim })} />
              <p className="text-xs text-stone-500 mt-auto">จากยอดขายได้ ฿{fmt(r.sold)}</p>
            </section>
          ))}
      </div>
    </>
  );
}

function Funnel({ label, hint, amount, p, tone, onClick }: {
  label: string; hint: string; amount: number; p: number; tone: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left flex flex-col gap-1.5">
      <span className="flex justify-between gap-3 text-sm w-full">
        <span>{label} <span className="text-stone-500">{hint}</span></span>
        <span className="font-semibold tabular-nums">฿{fmt(amount)}</span>
      </span>
      <span className="h-3 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, p)}%` }} />
      </span>
    </button>
  );
}

function topWithOther(slices: Slice[], n: number, total: number): Slice[] {
  if (slices.length <= n + 1) return slices;
  const rest = slices.slice(n);
  const amount = rest.reduce((s, x) => s + x.amount, 0);
  return [...slices.slice(0, n), {
    key: '__other', name: `อื่นๆ (${rest.length})`, amount, pct: pct(amount, total), qts: [], subs: [],
  }];
}

function SliceBars({ slices, onPick }: { slices: Slice[]; onPick: () => void }) {
  if (slices.length === 0) return <p className="text-sm text-stone-400">ยังไม่มียอดขายในช่วงนี้</p>;
  const max = Math.max(...slices.map((s) => s.amount), 1);
  return (
    <div className="flex flex-col gap-3.5">
      {slices.map((s) => (
        <button key={s.key} onClick={onPick} className="text-left flex flex-col gap-1.5">
          <span className="flex justify-between gap-3 text-sm w-full">
            <span className="truncate">{s.name}</span>
            <span className="whitespace-nowrap tabular-nums">
              <span className="font-semibold">฿{fmt(s.amount)}</span>
              <span className="text-stone-500 inline-block w-14 text-right">{s.pct}%</span>
            </span>
          </span>
          <span className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
            <span className="block h-full rounded-full bg-stone-800 dark:bg-stone-300" style={{ width: `${s.amount / max * 100}%` }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function groupByCustomer(rows: ArRow[]) {
  const m = new Map<string, { name: string; count: number; amount: number; worst: ArRow; parts: Record<Bucket, number> }>();
  const rank: Record<Bucket, number> = { over: 0, soon: 1, later: 2, nodue: 3 };
  for (const r of rows) {
    const g = m.get(r.customer) ?? { name: r.customer, count: 0, amount: 0, worst: r, parts: { over: 0, soon: 0, later: 0, nodue: 0 } };
    g.count++; g.amount += r.outstanding; g.parts[r.bucket] += r.outstanding;
    if (rank[r.bucket] < rank[g.worst.bucket] || (r.bucket === g.worst.bucket && (r.days ?? 9e9) < (g.worst.days ?? 9e9))) g.worst = r;
    m.set(r.customer, g);
  }
  return [...m.values()].sort((a, b) => rank[a.worst.bucket] - rank[b.worst.bucket] || b.amount - a.amount);
}

// ------------------------------------------------------------------ collection

function CollectionView({ r }: { r: Report }) {
  const [filter, setFilter] = useState<'all' | 'part' | 'unbilled' | 'done'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = r.qtRows.filter((q) =>
    filter === 'all' ? true
    : filter === 'unbilled' ? q.billed < q.sold - 0.5
    : filter === 'part' ? q.collected < q.sold - 0.5
    : q.collected >= q.sold - 0.5);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="ขายได้" value={r.sold} sub={`${r.soldCount} ใบเสนอราคา`} />
        <Kpi label="วางบิลแล้ว" value={r.soldBilled} sub={`${pct(r.soldBilled, r.sold)}% · ยังไม่วางบิล ฿${fmt(r.unbilledOfSold)}`} />
        <Kpi label="เก็บเงินได้" value={r.soldCollected} sub={`${pct(r.soldCollected, r.sold)}% ของยอดขาย · ${pct(r.soldCollected, r.soldBilled)}% ของที่วางบิล`} />
        <Kpi label="ยังต้องตามเก็บ" value={Math.max(0, r.sold - r.soldCollected)} sub="ยังไม่วางบิล + วางบิลแล้วค้างรับ" warn />
      </div>
      <section className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="กรอง">
          {([['all', 'ทั้งหมด'], ['unbilled', 'ยังวางบิลไม่ครบ'], ['part', 'เก็บยังไม่ครบ'], ['done', 'เก็บครบแล้ว']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
                    className={`text-sm px-4 py-2 rounded-full border min-h-[38px] ${filter === k
                      ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[28px_130px_minmax(0,2fr)_120px_120px_120px_minmax(0,1.2fr)] gap-3 px-2 pb-2 text-xs text-stone-500">
              <span /><span>ใบเสนอราคา</span><span>ลูกค้า · ชื่องาน</span>
              <span className="text-right">ขายได้</span><span className="text-right">วางบิลแล้ว</span><span className="text-right">เก็บได้</span>
              <span>ความคืบหน้าการเก็บเงิน</span>
            </div>
            {rows.length === 0 && <p className="text-sm text-stone-400 px-2 py-6">ไม่มีรายการ</p>}
            {rows.map((q) => {
              const isOpen = open === q.id;
              return (
                <div key={q.id} className="border-t border-stone-100 dark:border-stone-800">
                  <button onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen}
                          className="w-full text-left grid grid-cols-[28px_130px_minmax(0,2fr)_120px_120px_120px_minmax(0,1.2fr)] gap-3 items-center px-2 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                    <span className="text-sm font-semibold tabular-nums">{q.doc_no}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{q.customer}</span>
                      <span className="block text-xs text-stone-500 truncate">{q.job ?? '—'} · อนุมัติ {thDate(q.approved)}</span>
                    </span>
                    <span className="text-sm text-right tabular-nums">{fmt(q.sold)}</span>
                    <span className="text-sm text-right tabular-nums">{fmt(q.billed)}</span>
                    <span className="text-sm text-right tabular-nums font-semibold">{q.collected ? fmt(q.collected) : '—'}</span>
                    <span className="flex items-center gap-2.5">
                      <span className="relative flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-stone-400" style={{ width: `${Math.min(100, q.billed / q.sold * 100)}%` }} />
                        <span className="absolute inset-y-0 left-0 rounded-full bg-stone-900 dark:bg-stone-100" style={{ width: `${Math.min(100, q.collected / q.sold * 100)}%` }} />
                      </span>
                      <span className="text-sm font-semibold tabular-nums w-12 text-right">{pct(q.collected, q.sold)}%</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ml-10 mr-2 mb-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 p-2">
                      <Link to={docHref('QT', q.id)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                        <span className="font-semibold tabular-nums">{q.doc_no}</span>
                        <span className="text-stone-500">เปิดใบเสนอราคา</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 ml-auto" />
                      </Link>
                      {q.chain.map((c) => (
                        <Link key={c.id} to={docHref(c.doc_type, c.id)}
                              className="grid grid-cols-[130px_minmax(0,1fr)_120px_minmax(0,1.3fr)_20px] gap-3 items-center px-3 py-2 text-sm rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                          <span className="font-semibold tabular-nums">{c.doc_no ?? '(ร่าง)'}</span>
                          <span className="text-stone-600 dark:text-stone-400 truncate">{AR_DOC_LABEL[c.doc_type as keyof typeof AR_DOC_LABEL] ?? c.doc_type} · {thDate(c.doc_date)}</span>
                          <span className="text-right tabular-nums">฿{fmt(c.amount)}</span>
                          <span className="text-stone-600 dark:text-stone-400">
                            {c.outstanding <= 0.5 ? 'ชำระครบแล้ว' : `ค้าง ฿${fmt(c.outstanding)}${c.due_date ? ` · ครบกำหนด ${thDate(c.due_date)}` : ''}`}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return (
    <div className={`${card} !p-5 ${warn ? '!bg-orange-50 !border-orange-200 dark:!bg-orange-950/30 dark:!border-orange-900' : ''}`}>
      <div className={`text-sm ${warn ? 'text-orange-800 dark:text-orange-300' : 'text-stone-500'}`}>{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-orange-800 dark:text-orange-300' : ''}`}>฿{fmt(value)}</div>
      <div className={`text-xs mt-0.5 ${warn ? 'text-orange-900/80 dark:text-orange-300/80' : 'text-stone-500'}`}>{sub}</div>
    </div>
  );
}

// ------------------------------------------------------------------ receivables

function ArView({ r }: { r: Report }) {
  const [params, setParams] = useSearchParams();
  const bucket = (params.get('bucket') as Bucket | 'all') || 'all';
  const byCus = params.get('view2') === 'cus';
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };
  const rows = r.ar.rows.filter((x) => bucket === 'all' || x.bucket === bucket);
  const total = rows.reduce((s, x) => s + x.outstanding, 0);
  const tabs: (Bucket | 'all')[] = ['all', 'over', 'soon', 'later', ...(r.ar.byBucket.nodue.count ? ['nodue' as Bucket] : [])];

  return (
    <>
      <div className="flex items-baseline gap-3 flex-wrap -mt-2">
        <span className="text-3xl font-bold tabular-nums">฿{fmt(r.ar.total)}</span>
        <span className="text-sm text-stone-500">เอกสารวางบิลที่ออกแล้ว ยังรับเงินไม่ครบ · ณ {thDate(todayStr())}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="group" aria-label="กรองตามกำหนดชำระ">
        {tabs.map((k) => {
          const info = k === 'all' ? { count: r.ar.rows.length, amount: r.ar.total } : r.ar.byBucket[k];
          const style = k === 'all' ? BUCKET.later : BUCKET[k];
          return (
            <button key={k} onClick={() => set('bucket', k === 'all' ? null : k)}
                    className={`text-left border rounded-2xl p-4 ${style.box} ${bucket === k ? 'ring-2 ring-stone-900 dark:ring-stone-100' : ''}`}>
              <div className={`text-sm font-semibold ${style.text}`}>{k === 'all' ? 'ทั้งหมด' : style.label}</div>
              <div className="text-2xl font-bold tabular-nums">{info.count} <span className="text-sm font-medium">รายการ</span></div>
              <div className="text-sm text-stone-600 dark:text-stone-400 tabular-nums">฿{fmt(info.amount)}</div>
            </button>
          );
        })}
      </div>
      <section className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="inline-flex bg-stone-100 dark:bg-stone-800 rounded-xl p-1 gap-0.5" role="group" aria-label="มุมมอง">
            {[['doc', 'รายใบ'], ['cus', 'รายลูกค้า']].map(([k, label]) => (
              <button key={k} onClick={() => set('view2', k === 'cus' ? 'cus' : null)}
                      className={`text-sm px-4 py-2 rounded-lg min-h-[36px] ${(k === 'cus') === byCus
                        ? 'bg-white dark:bg-stone-900 font-semibold shadow-sm' : 'text-stone-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-sm text-stone-500">{rows.length} ใบ · ฿{fmt(total)}</span>
        </div>

        {!byCus ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="text-xs text-stone-500 text-left">
                  <th className="font-normal pb-2 px-2">เลขที่</th><th className="font-normal pb-2 px-2">ลูกค้า</th>
                  <th className="font-normal pb-2 px-2">ชื่องาน · อ้างอิง</th><th className="font-normal pb-2 px-2">ครบกำหนด</th>
                  <th className="font-normal pb-2 px-2">สถานะเวลา</th><th className="font-normal pb-2 px-2 text-right">ยอดค้าง</th>
                  <th className="font-normal pb-2 px-2">สถานะปัจจุบัน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className="border-t border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="py-3 px-2">
                      <Link to={docHref(x.doc_type, x.id)} className="font-semibold tabular-nums inline-flex items-center gap-1 hover:underline">
                        {x.doc_no} <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                      </Link>
                    </td>
                    <td className="py-3 px-2">{x.customer}</td>
                    <td className="py-3 px-2">
                      <div className="truncate max-w-[260px]">{x.job ?? '—'}</div>
                      {x.qt_id && <Link to={docHref('QT', x.qt_id)} className="text-xs text-stone-500 hover:underline tabular-nums">อ้างอิง {x.qt_no}</Link>}
                    </td>
                    <td className="py-3 px-2 tabular-nums text-stone-600">{thDate(x.due_date)}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${BUCKET[x.bucket].pill}`}>{whenText(x)}</span>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold">฿{fmt(x.outstanding)}</td>
                    <td className="py-3 px-2 text-stone-600 dark:text-stone-400">{arStatus(x)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-stone-400">ไม่มีรายการ</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <CustomerAr rows={rows} />
        )}
      </section>
    </>
  );
}

function CustomerAr({ rows }: { rows: ArRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupByCustomer(rows);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[28px_minmax(0,2fr)_60px_130px_minmax(0,2fr)] gap-3 px-2 pb-2 text-xs text-stone-500">
          <span /><span>ลูกค้า</span><span className="text-right">ใบ</span><span className="text-right">ยอดค้างรวม</span><span>สัดส่วนตามกำหนดชำระ</span>
        </div>
        {groups.map((g) => {
          const isOpen = open === g.name;
          return (
            <div key={g.name} className="border-t border-stone-100 dark:border-stone-800">
              <button onClick={() => setOpen(isOpen ? null : g.name)} aria-expanded={isOpen}
                      className="w-full text-left grid grid-cols-[28px_minmax(0,2fr)_60px_130px_minmax(0,2fr)] gap-3 items-center px-2 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 text-sm">
                {isOpen ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                <span className="font-medium truncate">{g.name}</span>
                <span className="text-right tabular-nums text-stone-500">{g.count}</span>
                <span className="text-right tabular-nums font-semibold">฿{fmt(g.amount)}</span>
                <span className="flex h-2.5 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800">
                  {(['over', 'soon', 'later', 'nodue'] as Bucket[]).map((k) => (
                    <span key={k} className={BUCKET[k].bar} style={{ width: `${g.parts[k] / g.amount * 100}%` }} />
                  ))}
                </span>
              </button>
              {isOpen && (
                <div className="ml-10 mr-2 mb-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 p-2">
                  {rows.filter((x) => x.customer === g.name).map((x) => (
                    <Link key={x.id} to={docHref(x.doc_type, x.id)}
                          className="grid grid-cols-[130px_minmax(0,1fr)_130px_120px_20px] gap-3 items-center px-3 py-2 text-sm rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                      <span className="font-semibold tabular-nums">{x.doc_no}</span>
                      <span className="truncate text-stone-600">{x.job ?? '—'}</span>
                      <span><span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border ${BUCKET[x.bucket].pill}`}>{whenText(x)}</span></span>
                      <span className="text-right tabular-nums font-semibold">฿{fmt(x.outstanding)}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <p className="text-sm text-stone-400 px-2 py-6">ไม่มีรายการ</p>}
        <div className="flex flex-wrap gap-4 text-xs text-stone-500 px-2 pt-3">
          {(['over', 'soon', 'later', 'nodue'] as Bucket[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3 h-2 rounded ${BUCKET[k].bar}`} />{BUCKET[k].label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sales breakdown

function SalesView({ r, dim, setDim }: { r: Report; dim: 'p' | 'c' | 's'; setDim: (d: 'p' | 'c' | 's') => void }) {
  const slices = dim === 'p' ? r.byProduct : dim === 'c' ? r.byCustomer : r.bySource;
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = slices.find((s) => s.key === selKey) ?? slices[0];
  const max = Math.max(1, ...slices.map((s) => s.amount));
  const kicker = dim === 'p' ? 'หมวดสินค้า' : dim === 'c' ? 'ลูกค้า' : 'แหล่งที่มา';
  const subHead = dim === 'p' ? 'รุ่น / รายการ' : dim === 'c' ? 'หมวดสินค้า' : 'ลูกค้า';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
        <div className="inline-flex bg-stone-100 dark:bg-stone-800 rounded-xl p-1 gap-0.5" role="group" aria-label="มุมมองยอดขาย">
          {([['p', 'ตามสินค้า'], ['c', 'ตามลูกค้า'], ['s', 'ตามแหล่งที่มา']] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setSelKey(null); setDim(k); }}
                    className={`text-sm px-4 py-2 rounded-lg min-h-[40px] ${dim === k
                      ? 'bg-white dark:bg-stone-900 font-semibold shadow-sm' : 'text-stone-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-stone-500">ยอดขายได้ ฿{fmt(r.sold)} · {r.soldCount} ใบเสนอราคา</span>
      </div>

      {slices.length === 0 ? (
        <div className={`${card} text-center text-stone-400 py-16`}>ยังไม่มียอดขายในช่วงนี้</div>
      ) : (
        <div className="flex flex-wrap gap-6 items-start">
          <div className={`${card} !p-2 flex-[1_1_340px] flex flex-col gap-0.5`}>
            {slices.map((s) => (
              <button key={s.key} onClick={() => setSelKey(s.key)} aria-pressed={sel?.key === s.key}
                      className={`text-left rounded-xl px-3.5 py-3 flex flex-col gap-2 ${sel?.key === s.key ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                <span className="flex justify-between gap-3 text-sm w-full">
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    <span className="font-semibold">฿{fmt(s.amount)}</span>
                    <span className="text-stone-500 inline-block w-14 text-right">{s.pct}%</span>
                  </span>
                </span>
                <span className="h-2 w-full rounded-full bg-stone-200/70 dark:bg-stone-700 overflow-hidden">
                  <span className={`block h-full rounded-full ${sel?.key === s.key ? 'bg-stone-900 dark:bg-stone-100' : 'bg-stone-500'}`}
                        style={{ width: `${s.amount / max * 100}%` }} />
                </span>
              </button>
            ))}
          </div>

          {sel && (
            <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-6">
              <section className={`${card} flex flex-col gap-4`}>
                <div className="flex flex-wrap justify-between items-baseline gap-3">
                  <div>
                    <div className={eyebrow}>{kicker}</div>
                    <h2 className="text-xl font-bold">{sel.name}</h2>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-2xl font-bold">฿{fmt(sel.amount)}</div>
                    <div className="text-sm text-stone-500">{sel.pct}% ของยอดขาย · {sel.qts.length} ใบเสนอราคา</div>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-stone-500 text-left">
                      <th className="font-normal pb-2 px-2">{subHead}</th>
                      <th className="font-normal pb-2 px-2 text-right">ยอดขาย</th>
                      <th className="font-normal pb-2 px-2 text-right w-20">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.subs.map((s) => (
                      <tr key={s.name} className="border-t border-stone-100 dark:border-stone-800">
                        <td className="py-2.5 px-2">{s.name}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold">฿{fmt(s.amount)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-stone-500">{s.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className={`${card} flex flex-col gap-3`}>
                <div className={eyebrow}>ใบเสนอราคาต้นทาง · กดเพื่อเปิด</div>
                {sel.qts.map((q) => (
                  <Link key={q.id} to={docHref('QT', q.id)}
                        className="grid grid-cols-[130px_minmax(0,1fr)_130px_20px] gap-3 items-center px-2 py-2.5 rounded-lg border-t border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 text-sm">
                    <span className="font-semibold tabular-nums">{q.doc_no}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{q.customer}</span>
                      <span className="block text-xs text-stone-500 truncate">{q.job ?? '—'}</span>
                    </span>
                    <span className="text-right tabular-nums font-semibold">฿{fmt(q.amount)}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </Link>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ กำไร / ต้นทุน (0032)

const SPLIT = [
  { key: 'revCost', label: 'ต้นทุน', bar: 'bg-stone-400', dot: 'bg-stone-400' },
  { key: 'revProfit', label: 'กำไร', bar: 'bg-stone-900 dark:bg-stone-100', dot: 'bg-stone-900 dark:bg-stone-100' },
  { key: 'revNoCost', label: 'ยังไม่มีต้นทุน', bar: 'bg-amber-300', dot: 'bg-amber-300' },
] as const;

/** รายได้แบ่ง 3 ส่วน: ต้นทุน + กำไร + ยังไม่มีต้นทุน (งานที่ยังไม่ออก PO) — รวมกัน = รายได้ */
function RevenueSplit({ r, onOpen }: { r: Report; onOpen: () => void }) {
  const total = r.revenue;
  if (total <= 0) return null;
  const p = r.profit;
  const withCost = p.revCost + p.revProfit;
  return (
    <button onClick={onOpen} className="text-left flex flex-col gap-2 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/40 -mx-2 px-2 py-1">
      <span className="flex h-3 w-full rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800">
        {SPLIT.map((x) => (
          <span key={x.key} className={x.bar} style={{ width: `${Math.max(0, p[x.key]) / total * 100}%` }} />
        ))}
      </span>
      <span className="grid grid-cols-3 gap-2 text-sm">
        {SPLIT.map((x) => (
          <span key={x.key} className="flex flex-col">
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
              <span className={`w-2 h-2 rounded-full ${x.dot}`} />{x.label}
            </span>
            <span className={`font-semibold tabular-nums ${x.key === 'revProfit' && p.revProfit < 0 ? 'text-rose-600' : ''}`}>
              ฿{fmt(p[x.key])}
            </span>
            <span className="text-xs text-stone-500 tabular-nums">
              {x.key === 'revProfit' && withCost > 0 ? `อัตรากำไร ${pct(p.revProfit, withCost)}%` : `${pct(p[x.key], total)}%`}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}

const ORDER_LABEL: Record<string, { text: string; cls: string }> = {
  full:    { text: 'สั่งครบ', cls: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700' },
  partial: { text: 'สั่งบางส่วน — ต้นทุนยังไม่ครบ', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  none:    { text: 'ยังไม่สั่งซื้อ', cls: 'bg-white text-stone-600 border-dashed border-stone-300' },
};

function ProfitView({ r }: { r: Report }) {
  const p = r.profit;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="ยอดขาย (งานที่มี PO)" value={p.sellWithCost} sub={`${p.rows.length} งาน`} />
        <Kpi label="ต้นทุน (PO)" value={p.cost} sub="ยอดก่อน VAT ของใบสั่งซื้อที่ออกแล้ว" />
        <Kpi label="กำไรขั้นต้น" value={p.grossProfit} sub={`อัตรากำไร ${p.margin}%`} />
        <Kpi label="งานที่ยังไม่มี PO" value={p.sellNoPo} sub={`${p.jobsNoPo} งาน · ยังไม่นับกำไร`} warn={p.jobsNoPo > 0} />
      </div>
      {(p.jobsPartial > 0 || p.unlinkedCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex flex-col gap-1">
          {p.jobsPartial > 0 && <span>มี {p.jobsPartial} งานที่สั่งซื้อยังไม่ครบทุกรายการ — กำไรของงานเหล่านี้จะลดลงเมื่อออก PO ที่เหลือ</span>}
          {p.unlinkedCount > 0 && <span>มีใบสั่งซื้อ {p.unlinkedCount} ใบ (฿{fmt(p.unlinkedCost)}) ในช่วงนี้ที่ไม่ได้ผูกกับงานที่ขายได้ — ไม่ได้หักออกจากกำไรของงานใด</span>}
        </div>
      )}
      <section className={`${card} flex flex-col gap-3`}>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[28px_130px_minmax(0,2fr)_120px_120px_120px_70px_minmax(0,1.2fr)] gap-3 px-2 pb-2 text-xs text-stone-500">
              <span /><span>ใบเสนอราคา</span><span>ลูกค้า · ชื่องาน</span>
              <span className="text-right">ราคาขาย</span><span className="text-right">ต้นทุน PO</span>
              <span className="text-right">กำไร</span><span className="text-right">%</span><span>การสั่งซื้อ</span>
            </div>
            {p.rows.length === 0 && <p className="text-sm text-stone-400 px-2 py-6">ยังไม่มีงานที่ออกใบสั่งซื้อในช่วงนี้</p>}
            {p.rows.map((row) => {
              const isOpen = open === row.id;
              return (
                <div key={row.id} className="border-t border-stone-100 dark:border-stone-800">
                  <button onClick={() => setOpen(isOpen ? null : row.id)} aria-expanded={isOpen}
                          className="w-full text-left grid grid-cols-[28px_130px_minmax(0,2fr)_120px_120px_120px_70px_minmax(0,1.2fr)] gap-3 items-center px-2 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 text-sm">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                    <span className="font-semibold tabular-nums">{row.doc_no}</span>
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{row.customer}</span>
                      <span className="block text-xs text-stone-500 truncate">{row.job ?? '—'}</span>
                    </span>
                    <span className="text-right tabular-nums">{fmt(row.sell)}</span>
                    <span className="text-right tabular-nums">{fmt(row.cost)}</span>
                    <span className={`text-right tabular-nums font-semibold ${row.profit < 0 ? 'text-rose-600' : ''}`}>{fmt(row.profit)}</span>
                    <span className={`text-right tabular-nums ${row.profit < 0 ? 'text-rose-600' : 'text-stone-500'}`}>{row.margin}%</span>
                    <span><span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border ${ORDER_LABEL[row.status].cls}`}>{ORDER_LABEL[row.status].text}</span></span>
                  </button>
                  {isOpen && (
                    <div className="ml-10 mr-2 mb-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 p-2">
                      <Link to={docHref('QT', row.id)} className="grid grid-cols-[130px_minmax(0,1fr)_120px_20px] gap-3 items-center px-3 py-2 text-sm rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                        <span className="font-semibold tabular-nums">{row.doc_no}</span>
                        <span className="text-stone-600">ใบเสนอราคา (ราคาขาย)</span>
                        <span className="text-right tabular-nums">฿{fmt(row.sell)}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                      </Link>
                      {row.pos.map((po) => (
                        <Link key={po.id} to={`/accounting/PO/${po.id}`}
                              className="grid grid-cols-[130px_minmax(0,1fr)_120px_20px] gap-3 items-center px-3 py-2 text-sm rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                          <span className="font-semibold tabular-nums">{po.doc_no}</span>
                          <span className="text-stone-600 truncate">ใบสั่งซื้อ · {po.vendor} · {thDate(po.doc_date)}</span>
                          <span className="text-right tabular-nums">−฿{fmt(po.cost)}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                        </Link>
                      ))}
                      <div className="grid grid-cols-[130px_minmax(0,1fr)_120px_20px] gap-3 px-3 py-2 text-sm border-t border-stone-200 dark:border-stone-700 mt-1">
                        <span /><span className="font-medium">กำไรขั้นต้น</span>
                        <span className={`text-right tabular-nums font-semibold ${row.profit < 0 ? 'text-rose-600' : ''}`}>฿{fmt(row.profit)}</span><span />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

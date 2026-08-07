import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, Plus, Search, Tag as TagIcon } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate, money, round2 } from '@/accounting-lib/calc';
import { AP_DOC_LABEL, AR_DOC_LABEL } from '@/accounting-lib/types';
import type { ApDocType, ArDocType } from '@/accounting-lib/types';
import {
  billingRollup, listApDocuments, listArDocuments, listDocumentTags,
} from '@/accounting-api/documents';
import type { BillingRollup } from '@/accounting-api/documents';
import { EmptyRow, Field, PrimaryButton, Select, StatusPill, TextInput } from './ui';

const AR_TYPES = ['QT', 'BL', 'INV', 'RC', 'CN', 'DN'];

/** ช่องที่เอกสารขายและเอกสารซื้อมีเหมือนกัน — พอสำหรับตารางรายการ */
interface DocRow {
  id: string;
  doc_no: string | null;
  doc_date: string;
  job_name: string | null;
  grand_total: number;
  paid_amount: number;
  status: string;
  tag_id: string | null;
  customer?: { company_name?: string | null; display_name?: string } | null;
  vendor?: { display_name?: string } | null;
  tag?: { id: string; name: string; color: string } | null;
}

const TAG_TONE: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function TagChip({ tag }: { tag: { name: string; color: string } }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium
      ${TAG_TONE[tag.color] ?? TAG_TONE.slate}`}>
      {tag.name}
    </span>
  );
}

const firstOfYear = () => `${new Date().getFullYear()}-01-01`;

export function DocumentListPage() {
  const { docType = 'QT' } = useParams();
  const ar = AR_TYPES.includes(docType);
  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [grouped, setGrouped] = useState(false);

  const tagsQ = useQuery(() => listDocumentTags(), []);
  const q = useQuery<DocRow[]>(
    async () => (ar
      ? await listArDocuments({ docType: docType as ArDocType, search, tagId: tagId || undefined, from, to })
      : await listApDocuments({ docType: docType as ApDocType, search, tagId: tagId || undefined, from, to })),
    [docType, search, tagId, from, to, ar]
  );

  const rows = useMemo(
    () => (q.data ?? []).filter((d) => !status || d.status === status),
    [q.data, status]
  );

  // ใบเสนอราคาต้องบอกได้ว่าวางบิลไปแล้วเท่าไร เหลือเท่าไร แบบเดียวกับ FlowAccount
  const rollupQ = useQuery<Map<string, BillingRollup>>(
    () => (docType === 'QT' && rows.length
      ? billingRollup(rows.map((r) => r.id))
      : Promise.resolve(new Map())),
    [docType, rows.map((r) => r.id).join(',')]
  );

  /** ผลรวมของรายการที่กรองอยู่ — ทุกหน้าในโมดูลต้องบอกยอดรวมได้ */
  const totals = useMemo(() => {
    const sum = rows.reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0);
    const byTag = new Map<string, { name: string; color: string; count: number; total: number }>();
    for (const r of rows) {
      const key = r.tag?.id ?? 'none';
      const cur = byTag.get(key) ?? {
        name: r.tag?.name ?? 'ไม่ระบุประเภทงาน', color: r.tag?.color ?? 'slate', count: 0, total: 0,
      };
      cur.count += 1;
      cur.total += Number(r.grand_total) || 0;
      byTag.set(key, cur);
    }
    return {
      count: rows.length,
      total: round2(sum),
      byTag: [...byTag.entries()]
        .map(([id, v]) => ({ id, ...v, total: round2(v.total) }))
        .sort((a, b) => b.total - a.total),
    };
  }, [rows]);

  const label = ar
    ? AR_DOC_LABEL[docType as ArDocType]
    : AP_DOC_LABEL[docType as ApDocType];

  const groups = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, { label: string; color: string; rows: DocRow[] }>();
    for (const r of rows) {
      const key = r.tag?.id ?? 'none';
      if (!m.has(key)) {
        m.set(key, { label: r.tag?.name ?? 'ไม่ระบุประเภทงาน', color: r.tag?.color ?? 'slate', rows: [] });
      }
      m.get(key)!.rows.push(r);
    }
    return [...m.values()];
  }, [rows, grouped]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{label}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {totals.count} ใบ · รวม {money(totals.total)} บาท
          </p>
        </div>
        <Link to={`/accounting/${docType}/new`} className="ml-auto">
          <PrimaryButton><Plus className="w-4 h-4" /> สร้าง{label}</PrimaryButton>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 p-4 flex flex-wrap items-end gap-3">
        <Field label="ค้นหา" className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput className="pl-9" placeholder="เลขที่เอกสาร / ชื่องาน…"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="ประเภทงาน" className="w-52">
          <Select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">ทุกประเภท</option>
            {tagsQ.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="สถานะ" className="w-40">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="draft">ร่าง</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="issued">ออกแล้ว</option>
            <option value="partial">ชำระบางส่วน</option>
            <option value="paid">ชำระครบ</option>
            <option value="cancelled">ยกเลิก</option>
          </Select>
        </Field>
        <Field label="ตั้งแต่" className="w-40">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึง" className="w-40">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button
          onClick={() => setGrouped((v) => !v)}
          className={`px-3 py-2 rounded-xl text-sm border inline-flex items-center gap-1.5
            ${grouped
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
        >
          <TagIcon className="w-4 h-4" /> จัดกลุ่มตามประเภทงาน
        </button>
      </div>

      {totals.byTag.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {totals.byTag.map((t) => (
            <button
              key={t.id}
              onClick={() => setTagId(t.id === 'none' ? '' : t.id)}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100
                dark:border-slate-800 px-3 py-2 text-left hover:border-indigo-300"
            >
              <TagChip tag={{ name: t.name, color: t.color }} />
              <div className="text-sm font-semibold tabular-nums mt-1 text-slate-800 dark:text-slate-100">
                {money(t.total)}
              </div>
              <div className="text-[11px] text-slate-400">{t.count} ใบ</div>
            </button>
          ))}
        </div>
      )}

      {grouped && groups
        ? groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <TagChip tag={{ name: g.label, color: g.color }} />
                <span className="text-xs text-slate-400">
                  {g.rows.length} ใบ · {money(g.rows.reduce((a, r) => a + Number(r.grand_total || 0), 0))} บาท
                </span>
              </div>
              <DocTable rows={g.rows} ar={ar} docType={docType} loading={false}
                        rollup={rollupQ.data ?? undefined} />
            </div>
          ))
        : <DocTable rows={rows} ar={ar} docType={docType} loading={q.loading}
                    rollup={rollupQ.data ?? undefined} />}
    </div>
  );
}

/**
 * สถานะที่แสดงบนใบเสนอราคาคิดจากยอดที่วางบิลและยอดที่ชำระจริง
 * ไม่ได้เก็บเป็นคอลัมน์ เพราะมันเปลี่ยนตามเอกสารลูกตลอดเวลา
 */
function billingLabel(total: number, r?: BillingRollup) {
  if (!r || r.billed <= 0) return null;
  if (r.paid >= total - 0.01) return { text: 'ชำระแล้ว', tone: 'text-emerald-600' };
  if (r.billed >= total - 0.01) return { text: 'วางบิลครบ', tone: 'text-sky-600' };
  return { text: 'วางบิลบางส่วน', tone: 'text-pink-600' };
}

function DocTable({
  rows, ar, docType, loading, rollup,
}: {
  rows: DocRow[]; ar: boolean; docType: string; loading: boolean;
  rollup?: Map<string, BillingRollup>;
}) {
  const total = rows.reduce((a, r) => a + (Number(r.grand_total) || 0), 0);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
      dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-3 w-28">วันที่</th>
              <th className="text-left font-medium px-4 py-3 w-40">เลขที่เอกสาร</th>
              <th className="text-left font-medium px-4 py-3">{ar ? 'ลูกค้า / ชื่องาน' : 'ผู้ขาย / ชื่องาน'}</th>
              <th className="text-left font-medium px-4 py-3 w-40">ประเภทงาน</th>
              <th className="text-right font-medium px-4 py-3 w-32">ยอดรวมทั้งสิ้น</th>
              <th className="text-left font-medium px-4 py-3 w-32">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={6} text="กำลังโหลด…" />}
            {!loading && rows.length === 0 && <EmptyRow colSpan={6} text="ไม่พบเอกสารตามเงื่อนไขที่เลือก" />}
            {rows.map((d) => {
              const partyName = ar
                ? (d.customer?.company_name || d.customer?.display_name)
                : d.vendor?.display_name;
              const billing = docType === 'QT'
                ? billingLabel(Number(d.grand_total) || 0, rollup?.get(d.id))
                : null;
              return (
                <tr key={d.id} className="border-t border-slate-50 dark:border-slate-800
                  hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                    {docDate(d.doc_date)}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/accounting/${docType}/${d.id}`}
                          className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      {d.doc_no ?? 'ร่าง'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700 dark:text-slate-200">{partyName ?? '—'}</div>
                    {d.job_name && (
                      <div className="text-[11px] text-slate-400 truncate max-w-md">{d.job_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.tag ? <TagChip tag={d.tag} /> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium
                    text-slate-800 dark:text-slate-100">
                    {money(d.grand_total)}
                    {billing && (
                      <div className={`text-[11px] font-normal ${billing.tone}`}>
                        {money(rollup?.get(d.id)?.billed ?? 0)}
                      </div>
                    )}
                    {!billing && docType !== 'QT' && Number(d.paid_amount) > 0
                      && Number(d.paid_amount) < Number(d.grand_total) && (
                      <div className="text-[11px] font-normal text-emerald-600">
                        ชำระแล้ว {money(d.paid_amount)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} />
                    {billing && (
                      <div className={`text-[11px] mt-0.5 ${billing.tone}`}>{billing.text}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-100 dark:border-slate-700
                bg-slate-50/60 dark:bg-slate-800/40">
                <td colSpan={4} className="px-4 py-3 text-xs text-slate-500">
                  รวม {rows.length} ใบ
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold
                  text-slate-800 dark:text-slate-100">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

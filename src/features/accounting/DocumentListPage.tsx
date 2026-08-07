import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { money, docDate } from '@/accounting-lib/calc';
import { AP_DOC_LABEL, AR_DOC_LABEL } from '@/accounting-lib/types';
import type { ApDocType, ArDocType } from '@/accounting-lib/types';
import { listApDocuments, listArDocuments } from '@/accounting-api/documents';
import { EmptyRow, PrimaryButton, StatusPill, TextInput } from './ui';

const AR_TYPES = ['QT', 'BL', 'INV', 'RC', 'CN', 'DN'];

/** ช่องที่เอกสารขายและเอกสารซื้อมีเหมือนกัน — พอสำหรับตารางรายการ */
interface DocRow {
  id: string;
  doc_no: string | null;
  doc_date: string;
  job_name: string | null;
  grand_total: number;
  status: string;
  customer?: { company_name?: string | null; display_name?: string } | null;
  vendor?: { display_name?: string } | null;
}

export function DocumentListPage() {
  const { docType = 'QT' } = useParams();
  const ar = AR_TYPES.includes(docType);
  const [search, setSearch] = useState('');

  // เอกสารขายกับเอกสารซื้อคนละ shape — ตารางนี้ใช้เฉพาะช่องที่มีเหมือนกัน
  const q = useQuery<DocRow[]>(
    async () => (ar
      ? await listArDocuments({ docType: docType as ArDocType, search })
      : await listApDocuments({ docType: docType as ApDocType, search })),
    [docType, search, ar]
  );

  const label = ar
    ? AR_DOC_LABEL[docType as ArDocType]
    : AP_DOC_LABEL[docType as ApDocType];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{label}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {q.data?.length ?? 0} รายการ
          </p>
        </div>
        <Link to={`/accounting/${docType}/new`} className="ml-auto">
          <PrimaryButton><Plus className="w-4 h-4" /> สร้าง{label}</PrimaryButton>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <TextInput
          className="pl-9" placeholder="ค้นหาเลขที่เอกสาร / ชื่องาน…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[840px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">เลขที่</th>
                <th className="text-left font-medium px-4 py-3">วันที่</th>
                <th className="text-left font-medium px-4 py-3">{ar ? 'ลูกค้า' : 'ผู้ขาย'}</th>
                <th className="text-left font-medium px-4 py-3">ชื่องาน</th>
                <th className="text-right font-medium px-4 py-3">ยอดรวม</th>
                <th className="text-left font-medium px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {q.loading && <EmptyRow colSpan={6} text="กำลังโหลด…" />}
              {!q.loading && (q.data?.length ?? 0) === 0 && (
                <EmptyRow colSpan={6} text={`ยังไม่มี${label}`} />
              )}
              {q.data?.map((d) => {
                const partyName = ar
                  ? (d.customer?.company_name || d.customer?.display_name)
                  : d.vendor?.display_name;
                return (
                  <tr key={d.id}
                      className="border-t border-slate-50 dark:border-slate-800
                        hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <Link to={`/accounting/${docType}/${d.id}`}
                            className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        {d.doc_no ?? 'ร่าง'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {docDate(d.doc_date)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {partyName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{d.job_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium
                      text-slate-800 dark:text-slate-100">
                      {money(d.grand_total)}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

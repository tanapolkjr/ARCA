import { useEffect, useState } from 'react';
import { Link2, Search, X } from 'lucide-react';
import { docDate, money } from '@/accounting-lib/calc';
import { searchSourceDocuments } from '@/accounting-api/documents';
import type { ArDocType } from '@/accounting-lib/types';
import type { SourceOption } from '@/accounting-api/documents';
import { inputCls } from './ui';

/**
 * ช่องอ้างอิงเอกสารต้นทาง
 *
 * ใบแจ้งหนี้อ้างใบเสนอราคา · ใบกำกับ/ใบเสร็จอ้างใบแจ้งหนี้
 * พิมพ์เลขที่แล้วเลือก ระบบจะดึงลูกค้า รายการ ยอด และ Tag มาให้ทั้งชุด
 * พร้อมบอกว่ายอดต้นทางเหลือให้ออกได้อีกเท่าไร
 */
export function SourceRefPicker({
  sourceType, value, remaining, sourceTotal, disabled, onPick, onClear,
}: {
  sourceType: ArDocType;
  value: { id: string; docNo: string | null; jobName?: string | null } | null;
  /** ยอดที่ยังออกได้จากใบต้นทาง */
  remaining?: number;
  sourceTotal?: number;
  disabled?: boolean;
  onPick: (opt: SourceOption) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(false);

  const label = sourceType === 'QT' ? 'ใบเสนอราคา' : 'ใบแจ้งหนี้';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await searchSourceDocuments(sourceType, term);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [term, open, sourceType]);

  if (value) {
    return (
      <div className="rounded-xl border border-slate-300 dark:border-slate-600
        bg-slate-100/60 dark:bg-slate-800/60 px-3 py-2 flex items-center gap-3">
        <Link2 className="w-4 h-4 text-slate-900 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {value.docNo ?? label}
          </div>
          {value.jobName && (
            <div className="text-[11px] text-slate-500 truncate">{value.jobName}</div>
          )}
          {remaining != null && sourceTotal != null && (
            <div className="text-[11px] text-slate-500 tabular-nums">
              ยอดต้นทาง {money(sourceTotal)} · ออกได้อีก{' '}
              <span className="font-semibold text-slate-900">{money(remaining)}</span>
            </div>
          )}
        </div>
        {!disabled && (
          <button onClick={onClear} className="text-slate-400 hover:text-rose-500 shrink-0"
                  title="ยกเลิกการอ้างอิง">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className={`${inputCls} pl-9`}
        placeholder={`ค้นหาเลขที่${label}…`}
        value={term}
        disabled={disabled}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
      />
      {open && !disabled && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-slate-800
          border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg
          max-h-72 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">ไม่พบ{label}ที่ออกเลขที่แล้ว</div>
          )}
          {results.map((r) => (
            <button
              key={r.id} type="button"
              onMouseDown={() => { onPick(r); setOpen(false); setTerm(''); }}
              className="block w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-slate-900">{r.doc_no}</span>
                <span className="text-[11px] text-slate-400">{docDate(r.doc_date)}</span>
                <span className="ml-auto text-sm tabular-nums">{money(r.grand_total)}</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {r.customer_name}{r.job_name ? ` · ${r.job_name}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

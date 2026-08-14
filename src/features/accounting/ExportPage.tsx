import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { money } from '@/accounting-lib/calc';
import { listCompanies } from '@/accounting-api/setup';
import { buildMonthlyExport, downloadWorkbook } from '@/accounting-api/monthlyExport';
import type { MonthlyExport } from '@/accounting-api/monthlyExport';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from './ui';

const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * ส่งออกให้สำนักงานบัญชี
 *
 * บัญชีคีย์มือ ไฟล์จึงเป็น Excel เล่มเดียวหลายชีต หัวคอลัมน์ภาษาไทย
 * ไม่ผูกกับโปรแกรมบัญชียี่ห้อไหน เปิดแล้วคีย์ต่อได้ทันที
 */
export function ExportPage() {
  const { toast } = useToast();
  const companiesQ = useQuery(() => listCompanies(true), []);
  const [companyId, setCompanyId] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const [preview, setPreview] = useState<MonthlyExport | null>(null);
  const [busy, setBusy] = useState(false);

  const company = companiesQ.data?.find((c) => c.id === companyId) ?? companiesQ.data?.[0];
  const errors = preview?.warnings.filter((w) => w.kind === 'error') ?? [];
  const warns = preview?.warnings.filter((w) => w.kind === 'warn') ?? [];

  async function check() {
    if (!company) { toast('ยังไม่มีบริษัทในระบบ', 'error'); return; }
    setBusy(true);
    try {
      setPreview(await buildMonthlyExport(company.id, month));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ตรวจข้อมูลไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          ส่งออกให้สำนักงานบัญชี
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Excel เล่มเดียว 5 ชีต — ภาษีขาย · ภาษีซื้อ · หัก ณ ที่จ่าย · ลูกหนี้คงเหลือ · รายรับ-รายจ่าย
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 p-5 flex flex-wrap items-end gap-4">
        <Field label="บริษัท" className="w-64">
          <Select value={companyId || company?.id || ''}
                  onChange={(e) => { setCompanyId(e.target.value); setPreview(null); }}>
            {companiesQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
          </Select>
        </Field>
        <Field label="เดือน" className="w-44">
          <TextInput type="month" value={month}
                     onChange={(e) => { setMonth(e.target.value); setPreview(null); }} />
        </Field>
        <GhostButton onClick={() => void check()} disabled={busy}>
          <FileSpreadsheet className="w-4 h-4" /> ตรวจข้อมูลก่อน
        </GhostButton>
        <PrimaryButton
          disabled={busy || !preview}
          onClick={async () => {
            if (!preview || !company) return;
            try {
              await downloadWorkbook(preview, `บัญชี_${company.name_th}_${month}.xlsx`);
              toast('สร้างไฟล์แล้ว');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'สร้างไฟล์ไม่สำเร็จ', 'error');
            }
          }}
        >
          <Download className="w-4 h-4" /> ดาวน์โหลด Excel
        </PrimaryButton>
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="ภาษีขาย" value={preview.summary.salesVat} />
            <Stat label="ภาษีซื้อ" value={preview.summary.purchaseVat} />
            <Stat label="ต้องนำส่ง (ภ.พ.30)"
                  value={preview.summary.salesVat - preview.summary.purchaseVat} strong />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
              dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">เอกสารขาย</div>
              <div className="text-lg font-bold mt-1 text-slate-800 dark:text-slate-100">
                {preview.summary.docCount} ใบ
              </div>
            </div>
          </div>

          {errors.length === 0 && warns.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border
              border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm
              text-emerald-800 dark:text-emerald-200 flex gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ตรวจแล้วไม่พบปัญหา ส่งไฟล์ให้บัญชีได้เลย
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
              dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                ตรวจพบ {errors.length + warns.length} รายการที่ควรแก้ก่อนส่ง
              </h2>
              <ul className="flex flex-col gap-1.5">
                {[...errors, ...warns].map((w, i) => (
                  <li key={i} className={`text-xs flex gap-2
                    ${w.kind === 'error' ? 'text-rose-600' : 'text-amber-600'}`}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {w.message}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-400 mt-3">
                ดาวน์โหลดได้อยู่ แต่รายการสีแดงหมายถึงเอกสารที่ลูกค้าเอาไปขอคืนภาษีซื้อไม่ได้
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
            dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">ชีตในไฟล์</th>
                  <th className="text-right font-medium px-4 py-3 w-32">จำนวนแถว</th>
                </tr>
              </thead>
              <tbody>
                {preview.sheets.map((s) => (
                  <tr key={s.name} className="border-t border-slate-50 dark:border-slate-800">
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{s.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {s.rows.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-slate-400">
        รอบยื่น: ภ.พ.30 ภายในวันที่ 15 ของเดือนถัดไป (ออนไลน์ถึงวันที่ 23) ·
        ภ.ง.ด.3/53 ภายในวันที่ 7 (ออนไลน์ถึงวันที่ 15) — ควรส่งไฟล์ให้บัญชีภายในวันที่ 3–5
      </p>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
      dark:border-slate-800 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1
        ${strong ? 'text-indigo-600' : 'text-slate-800 dark:text-slate-100'}`}>
        {money(value)}
      </div>
    </div>
  );
}

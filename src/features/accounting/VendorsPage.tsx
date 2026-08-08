import { useState } from 'react';
import { Building, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import type { Vendor } from '@/accounting-lib/types';
import { deleteVendor, listVendors, saveVendor } from '@/accounting-api/setup';
import {
  EmptyRow, Field, GhostButton, Modal, NumberInput, PrimaryButton, Select, TextArea, TextInput,
} from './ui';

const TYPE_LABEL: Record<string, string> = {
  goods: 'ผู้ขายสินค้า',
  subcontractor: 'ผู้รับเหมา',
  service: 'ค่าบริการ',
  overseas: 'ผู้ขายต่างประเทศ',
};

/** อัตราหัก ณ ที่จ่ายที่ใช้บ่อย — ตั้งไว้ที่ผู้ขายแล้วเอกสารซื้อจะดึงไปใช้ */
const WHT_PRESET: { value: string; label: string; rate: number }[] = [
  { value: 'none', label: 'ไม่หัก', rate: 0 },
  { value: 'service3', label: 'ค่าบริการ / รับจ้างทำของ 3%', rate: 3 },
  { value: 'transport1', label: 'ค่าขนส่ง 1%', rate: 1 },
  { value: 'rent5', label: 'ค่าเช่า 5%', rate: 5 },
  { value: 'ads2', label: 'ค่าโฆษณา 2%', rate: 2 },
];

/**
 * ทะเบียนผู้ขาย / ผู้รับเหมา
 *
 * ระบบเดิมไม่มีที่เก็บเลย — `factories` เป็นโรงงานจีนของ Sourcing
 * ส่วน `ticket_subcontractors` มีแค่ชื่อกับเบอร์ ซึ่งออกหนังสือรับรอง
 * หัก ณ ที่จ่ายไม่ได้เพราะไม่มีเลขประจำตัวผู้เสียภาษี
 */
export function VendorsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const q = useQuery(() => listVendors(search), [search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            ผู้ขาย / ผู้รับเหมา
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {q.data?.length ?? 0} ราย · ใช้ในใบสั่งซื้อและการหัก ณ ที่จ่าย
          </p>
        </div>
        <PrimaryButton className="ml-auto"
          onClick={() => setEditing({
            vendor_type: 'goods', legal_entity_type: 'company',
            branch_code: '00000', branch_name: 'สำนักงานใหญ่',
            wht_type: 'none', wht_rate: 0, is_vat_registered: true, is_active: true,
          })}>
          <Plus className="w-4 h-4" /> เพิ่มผู้ขาย
        </PrimaryButton>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <TextInput className="pl-9" placeholder="ค้นหาชื่อผู้ขาย…"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">ชื่อผู้ขาย</th>
                <th className="text-left font-medium px-4 py-3 w-36">ประเภท</th>
                <th className="text-left font-medium px-4 py-3 w-44">เลขผู้เสียภาษี</th>
                <th className="text-left font-medium px-4 py-3 w-40">หัก ณ ที่จ่าย</th>
                <th className="text-left font-medium px-4 py-3 w-32">เครดิต</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {q.loading && <EmptyRow colSpan={6} text="กำลังโหลด…" />}
              {!q.loading && (q.data?.length ?? 0) === 0 && (
                <EmptyRow colSpan={6} text="ยังไม่มีผู้ขาย — กด “เพิ่มผู้ขาย” เพื่อเริ่ม" />
              )}
              {q.data?.map((v) => (
                <tr key={v.id} className="border-t border-slate-50 dark:border-slate-800
                  hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100
                      inline-flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {v.display_name}
                    </div>
                    {v.contact_name && (
                      <div className="text-[11px] text-slate-400">
                        {v.contact_name}{v.phone ? ` · ${v.phone}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{TYPE_LABEL[v.vendor_type]}</td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums">
                    {v.tax_id ?? <span className="text-amber-600">ยังไม่มี</span>}
                    {v.tax_id && v.branch_code && (
                      <span className="text-[11px] text-slate-400"> ({v.branch_code})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {Number(v.wht_rate) > 0 ? `${v.wht_rate}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {v.credit_term_days ? `${v.credit_term_days} วัน` : 'เงินสด'}
                  </td>
                  <td className="px-2">
                    <div className="inline-flex gap-0.5">
                      <button title="แก้ไข" onClick={() => setEditing(v)}
                              className="text-slate-400 hover:text-indigo-600 p-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="ลบ"
                        onClick={async () => {
                          try {
                            await deleteVendor(v.id);
                            toast('ลบผู้ขายแล้ว');
                            void q.refetch();
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : '';
                            toast(/foreign key|violates/i.test(msg)
                              ? 'ลบไม่ได้ — ผู้ขายรายนี้ถูกใช้ในเอกสารแล้ว'
                              : 'ลบไม่สำเร็จ', 'error');
                          }
                        }}
                        className="text-slate-400 hover:text-rose-500 p-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <VendorModal
          vendor={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void q.refetch(); }}
        />
      )}
    </div>
  );
}

function VendorModal({
  vendor, onClose, onSaved,
}: { vendor: Partial<Vendor>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Partial<Vendor>>(vendor);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Vendor, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={vendor.id ? `แก้ไข — ${vendor.display_name}` : 'เพิ่มผู้ขาย'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="ชื่อผู้ขาย" required>
          <TextInput value={f.display_name ?? ''}
                     onChange={(e) => set('display_name', e.target.value)} />
        </Field>
        <Field label="ประเภทผู้ขาย">
          <Select value={f.vendor_type ?? 'goods'}
                  onChange={(e) => set('vendor_type', e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>

        <Field label="รูปแบบนิติบุคคล"
               hint="นิติบุคคล → ภ.ง.ด.53 · บุคคลธรรมดา → ภ.ง.ด.3">
          <Select value={f.legal_entity_type ?? 'company'}
                  onChange={(e) => set('legal_entity_type', e.target.value)}>
            <option value="company">นิติบุคคล</option>
            <option value="individual">บุคคลธรรมดา</option>
          </Select>
        </Field>
        <Field label="เลขประจำตัวผู้เสียภาษี"
               hint="ต้องมีถึงจะออกหนังสือรับรองหัก ณ ที่จ่ายได้">
          <TextInput value={f.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="รหัสสาขา">
            <TextInput value={f.branch_code ?? ''}
                       onChange={(e) => set('branch_code', e.target.value)} />
          </Field>
          <Field label="ชื่อสาขา">
            <TextInput value={f.branch_name ?? ''}
                       onChange={(e) => set('branch_name', e.target.value)} />
          </Field>
        </div>
        <Field label="จด VAT ไหม" hint="ไม่จด = ไม่มีภาษีซื้อให้ขอคืน">
          <Select value={f.is_vat_registered === false ? 'n' : 'y'}
                  onChange={(e) => set('is_vat_registered', e.target.value === 'y')}>
            <option value="y">จด VAT</option>
            <option value="n">ไม่จด VAT</option>
          </Select>
        </Field>

        <Field label="ที่อยู่" className="md:col-span-2">
          <TextArea rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>

        <Field label="ผู้ติดต่อ">
          <TextInput value={f.contact_name ?? ''}
                     onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="เบอร์โทร">
          <TextInput value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>

        <Field label="หัก ณ ที่จ่าย">
          <Select
            value={f.wht_type ?? 'none'}
            onChange={(e) => {
              const preset = WHT_PRESET.find((p) => p.value === e.target.value);
              setF((p) => ({ ...p, wht_type: e.target.value, wht_rate: preset?.rate ?? 0 }));
            }}
          >
            {WHT_PRESET.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="เครดิตเทอม (วัน)">
          <NumberInput value={f.credit_term_days ?? 0}
                       onChange={(e) => set('credit_term_days', Number(e.target.value))} />
        </Field>

        <Field label="ธนาคาร">
          <TextInput value={f.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} />
        </Field>
        <Field label="เลขที่บัญชี">
          <TextInput value={f.bank_account_no ?? ''}
                     onChange={(e) => set('bank_account_no', e.target.value)} />
        </Field>

        <Field label="หมายเหตุ" className="md:col-span-2">
          <TextArea rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            if (!f.display_name?.trim()) { toast('ใส่ชื่อผู้ขายก่อน', 'error'); return; }
            setBusy(true);
            try { await saveVendor(f); toast('บันทึกแล้ว'); onSaved(); }
            catch (e) { toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error'); }
            finally { setBusy(false); }
          }}
        >
          บันทึก
        </PrimaryButton>
      </div>
    </Modal>
  );
}

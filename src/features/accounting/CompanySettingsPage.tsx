import { useEffect, useState } from 'react';
import { Building2, Check, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import type { BankAccount, Company } from '@/accounting-lib/types';
import {
  deleteBankAccount, listBankAccounts, listCompanies,
  saveBankAccount, saveCompany, seedDocumentSequence, setDefaultCompany,
} from '@/accounting-api/setup';
import { deleteDocumentTag, listDocumentTags, saveDocumentTag } from '@/accounting-api/documents';
import { Field, GhostButton, Modal, NumberInput, PrimaryButton, TextArea, TextInput } from './ui';

const DOC_TYPES = ['QT', 'BL', 'INV', 'RC', 'PO'] as const;

/**
 * ตั้งค่าบริษัทผู้ออกเอกสาร
 *
 * รองรับหลายบริษัทตั้งแต่แรก เพราะการเพิ่ม company_id ทีหลัง
 * หมายถึงต้องไล่แก้ทุก query และข้อมูลเก่าจะไม่รู้ว่าเป็นของบริษัทไหน
 */
export function CompanySettingsPage() {
  const { toast } = useToast();
  const companiesQ = useQuery(() => listCompanies(), []);
  const [editing, setEditing] = useState<Partial<Company> | null>(null);
  const [bankFor, setBankFor] = useState<Company | null>(null);
  const [seedFor, setSeedFor] = useState<Company | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            บริษัทผู้ออกเอกสาร
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            เปลี่ยนหัวบิลได้เหมือนเปลี่ยนลูกค้า — เลือกตอนสร้างเอกสาร
          </p>
        </div>
        <PrimaryButton className="ml-auto" onClick={() => setEditing({ vat_rate: 7, branch_code: '00000' })}>
          <Plus className="w-4 h-4" /> เพิ่มบริษัท
        </PrimaryButton>
      </div>

      <div className="grid gap-3">
        {companiesQ.data?.map((c) => (
          <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border
            border-slate-100 dark:border-slate-800 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30
                flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name_th}</span>
                  {c.is_default && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100
                      text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">ตั้งต้น</span>
                  )}
                  {!c.tax_id && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100
                      text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      ยังไม่มีเลขผู้เสียภาษี
                    </span>
                  )}
                </div>
                {c.name_en && <div className="text-xs text-slate-500">{c.name_en}</div>}
                <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                  {c.tax_id && <div>เลขประจำตัวผู้เสียภาษี {c.tax_id} · {c.branch_name}</div>}
                  {c.address_th && <div className="whitespace-pre-line">{c.address_th}</div>}
                  {c.phone && <div>โทร. {c.phone}</div>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => setEditing(c)}>แก้ไข</GhostButton>
                <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => setBankFor(c)}>บัญชีธนาคาร</GhostButton>
                <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => setSeedFor(c)}>เลขเอกสาร</GhostButton>
                {!c.is_default && (
                  <button
                    className="text-xs text-slate-400 hover:text-indigo-600 px-3"
                    onClick={async () => {
                      await setDefaultCompany(c.id);
                      toast('ตั้งเป็นบริษัทตั้งต้นแล้ว');
                      void companiesQ.refetch();
                    }}
                  >
                    ตั้งเป็นตั้งต้น
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <TagSettings />

      {editing && (
        <CompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void companiesQ.refetch(); }}
        />
      )}
      {bankFor && <BankModal company={bankFor} onClose={() => setBankFor(null)} />}
      {seedFor && <SeedModal company={seedFor} onClose={() => setSeedFor(null)} />}
    </div>
  );
}

/**
 * ชนิดของประเภทงาน (Tag)
 * ตั้งไว้ที่เดียวแล้วทุกเอกสารเลือกจากรายการนี้ — แบบเดียวกับ Target channels ของ Sourcing
 * ไม่ให้เพิ่มจากในฟอร์มเอกสาร เพราะจะเกิดชื่อซ้ำที่สะกดต่างกันจนรายงานรวมยอดไม่ได้
 */
function TagSettings() {
  const { toast } = useToast();
  const tagsQ = useQuery(() => listDocumentTags(), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
      dark:border-slate-800 p-5">
      <div className="flex items-center gap-2 mb-1">
        <TagIcon className="w-4 h-4 text-slate-400" />
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">ประเภทงาน (Tag)</h2>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        ใช้จัดกลุ่มและรวมยอดในทุกหน้าเอกสาร · ตั้งที่ใบเสนอราคาแล้วไหลตามไปทุกใบที่แปลงต่อ ·
        ลบได้เฉพาะประเภทที่ยังไม่มีเอกสารใช้อยู่
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {tagsQ.data?.map((t) => (
          <span key={t.id} className="group pl-3 pr-1.5 py-1 rounded-full text-xs font-medium
            bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
            inline-flex items-center gap-1.5">
            {t.name}
            <button
              title="ลบประเภทงานนี้"
              onClick={async () => {
                try {
                  await deleteDocumentTag(t.id);
                  toast(`ลบ "${t.name}" แล้ว`);
                  void tagsQ.refetch();
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
                }
              }}
              className="text-slate-300 hover:text-rose-500"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {(tagsQ.data?.length ?? 0) === 0 && (
          <span className="text-sm text-slate-400">ยังไม่มีประเภทงาน</span>
        )}
      </div>

      <div className="flex gap-2 max-w-md">
        <TextInput
          value={name} placeholder="เช่น Smart Lock, Construction Product"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
        />
        <PrimaryButton disabled={busy} onClick={() => void add()}>
          <Plus className="w-4 h-4" /> เพิ่ม
        </PrimaryButton>
      </div>
    </div>
  );

  async function add() {
    const value = name.trim();
    if (!value) { toast('ใส่ชื่อประเภทงานก่อน', 'error'); return; }
    setBusy(true);
    try {
      await saveDocumentTag({ name: value });
      setName('');
      void tagsQ.refetch();
      toast(`เพิ่ม "${value}" แล้ว`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast(/duplicate|unique/i.test(msg) ? 'มีประเภทงานชื่อนี้อยู่แล้ว' : 'เพิ่มไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
  }
}

function CompanyModal({
  company, onClose, onSaved,
}: { company: Partial<Company>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Partial<Company>>(company);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Company, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={company.id ? 'แก้ไขบริษัท' : 'เพิ่มบริษัท'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="ชื่อบริษัท (ไทย)" required>
          <TextInput value={f.name_th ?? ''} onChange={(e) => set('name_th', e.target.value)} />
        </Field>
        <Field label="ชื่อบริษัท (อังกฤษ)">
          <TextInput value={f.name_en ?? ''} onChange={(e) => set('name_en', e.target.value)} />
        </Field>
        <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก — ใบกำกับภาษีขาดไม่ได้">
          <TextInput value={f.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="รหัสสาขา" hint="00000 = สำนักงานใหญ่">
            <TextInput value={f.branch_code ?? ''} onChange={(e) => set('branch_code', e.target.value)} />
          </Field>
          <Field label="ชื่อสาขา">
            <TextInput value={f.branch_name ?? ''} onChange={(e) => set('branch_name', e.target.value)} />
          </Field>
        </div>
        <Field label="ที่อยู่ (ไทย)" className="md:col-span-2">
          <TextArea rows={3} value={f.address_th ?? ''} onChange={(e) => set('address_th', e.target.value)} />
        </Field>
        <Field label="โทรศัพท์">
          <TextInput value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="อีเมล">
          <TextInput value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="อัตรา VAT %">
          <NumberInput value={f.vat_rate ?? 7} step="0.01"
                       onChange={(e) => set('vat_rate', Number(e.target.value))} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            if (!f.name_th?.trim()) { toast('ใส่ชื่อบริษัทก่อน', 'error'); return; }
            setBusy(true);
            try { await saveCompany(f); toast('บันทึกแล้ว'); onSaved(); }
            catch (e) { toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error'); }
            finally { setBusy(false); }
          }}
        >
          <Check className="w-4 h-4" /> บันทึก
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function BankModal({ company, onClose }: { company: Company; onClose: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<BankAccount[]>([]);
  const [draft, setDraft] = useState({ bank_name: '', branch: '', account_name: '', account_no: '' });

  const reload = () => listBankAccounts(company.id).then(setList);
  useEffect(() => { void reload(); }, [company.id]);

  return (
    <Modal title={`บัญชีธนาคาร — ${company.name_th}`} onClose={onClose} wide>
      <p className="text-xs text-slate-500">
        พิมพ์อยู่ท้ายใบเสนอราคาและใบแจ้งหนี้ในส่วน &ldquo;ข้อมูลการรับชำระ&rdquo;
      </p>
      <div className="flex flex-col gap-2">
        {list.map((b) => (
          <div key={b.id} className="flex items-center gap-3 text-sm border border-slate-100
            dark:border-slate-800 rounded-xl px-3 py-2">
            <div className="flex-1">
              <div className="font-medium tabular-nums">{b.account_no}</div>
              <div className="text-xs text-slate-500">
                ธ. {b.bank_name}{b.branch ? ` (${b.branch})` : ''} · {b.account_name}
              </div>
            </div>
            <button className="text-slate-300 hover:text-rose-500"
                    onClick={async () => { await deleteBankAccount(b.id); void reload(); }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีบัญชี</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
        <Field label="ธนาคาร"><TextInput value={draft.bank_name}
          onChange={(e) => setDraft({ ...draft, bank_name: e.target.value })} /></Field>
        <Field label="สาขา"><TextInput value={draft.branch}
          onChange={(e) => setDraft({ ...draft, branch: e.target.value })} /></Field>
        <Field label="ชื่อบัญชี"><TextInput value={draft.account_name}
          onChange={(e) => setDraft({ ...draft, account_name: e.target.value })} /></Field>
        <Field label="เลขที่บัญชี"><TextInput value={draft.account_no}
          onChange={(e) => setDraft({ ...draft, account_no: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end">
        <PrimaryButton
          onClick={async () => {
            if (!draft.bank_name.trim() || !draft.account_no.trim()) {
              toast('ใส่ธนาคารและเลขที่บัญชีก่อน', 'error'); return;
            }
            await saveBankAccount({ ...draft, company_id: company.id });
            setDraft({ bank_name: '', branch: '', account_name: '', account_no: '' });
            void reload();
          }}
        >
          <Plus className="w-4 h-4" /> เพิ่มบัญชี
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/**
 * ตั้งเลขเอกสารเริ่มต้นให้ต่อจากระบบเดิม
 * ต้องทำก่อนออกเอกสารใบแรก ไม่งั้นเลขจะซ้ำกับที่เคยส่งลูกค้าไปแล้ว
 */
function SeedModal({ company, onClose }: { company: Company; onClose: () => void }) {
  const { toast } = useToast();
  const [docType, setDocType] = useState<string>('QT');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [last, setLast] = useState('0');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`ตั้งเลขเอกสารเริ่มต้น — ${company.name_th}`} onClose={onClose}>
      <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
        dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
        ทำครั้งเดียวตอนย้ายมาจากระบบเดิม — ถ้าใบล่าสุดคือ <strong>QT202608040006</strong> ให้เลือก
        ประเภท QT วันที่ 04/08/2026 และใส่เลขล่าสุด 6 ระบบจะออกใบถัดไปเป็น 0007
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="ประเภท">
          <select className="w-full px-3 py-2 rounded-xl border border-slate-200
            dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="วันที่ของใบล่าสุด">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="เลขลำดับล่าสุด">
          <NumberInput value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <GhostButton onClick={onClose}>ปิด</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await seedDocumentSequence(company.id, docType, docType, date, Number(last));
              toast(`ตั้งเลขเริ่มต้นของ ${docType} แล้ว`);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ตั้งค่าไม่สำเร็จ', 'error');
            } finally { setBusy(false); }
          }}
        >
          <Check className="w-4 h-4" /> ตั้งค่า
        </PrimaryButton>
      </div>
    </Modal>
  );
}

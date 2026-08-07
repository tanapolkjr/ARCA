import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FileCheck2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { computeTotals, lineTotal, money } from '@/accounting-lib/calc';
import {
  AP_DOC_LABEL, AR_DOC_LABEL,
} from '@/accounting-lib/types';
import type { ApDocType, ArDocType, DocumentItem, VatType } from '@/accounting-lib/types';
import { getDefaultCompany, listBankAccounts, listCompanies, listTemplates, listVendors } from '@/accounting-api/setup';
import {
  companySnapshot, customerSnapshotFrom, deleteApDraft, deleteArDraft,
  getApDocument, getArDocument, issueApDocument, issueArDocument,
  saveApDocument, saveArDocument,
} from '@/accounting-api/documents';
import { supabase } from '../../lib/supabaseClient.js';
import { DocumentPrintView, type PrintableDoc } from './DocumentPrintView';
import { Field, GhostButton, NumberInput, PrimaryButton, Select, TextArea, TextInput } from './ui';

const AR_TYPES: ArDocType[] = ['QT', 'BL', 'INV', 'RC', 'CN', 'DN'];
const isAr = (t: string): t is ArDocType => (AR_TYPES as string[]).includes(t);

const blankItem = (): DocumentItem => ({
  line_no: 1, stock_item_id: null, description: '', item_type: 'goods',
  vat_type: 'vat', qty: 1, unit: 'ชิ้น', unit_price: 0, discount_amount: 0, line_total: 0,
});

interface PartyOption { id: string; label: string; raw: Record<string, unknown> }

/**
 * หน้าสร้าง/แก้เอกสาร ใช้ร่วมกันทุกประเภท (QT/BL/INV/RC/CN/DN และ PO)
 * เอกสารขายกับเอกสารซื้อมีโครงเดียวกัน ต่างกันแค่คู่ค้าและตารางปลายทาง
 */
export function DocumentEditorPage() {
  const { docType = 'QT', id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const userId = useUserId();
  const ar = isAr(docType);

  const [companyId, setCompanyId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [jobName, setJobName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [salesUserId, setSalesUserId] = useState('');
  const [fulfilment, setFulfilment] = useState<'install' | 'delivery'>('install');
  const [includeVat, setIncludeVat] = useState(true);
  const [vatRate, setVatRate] = useState(7);
  const [whtRate, setWhtRate] = useState(0);
  const [billingPercent, setBillingPercent] = useState<string>('');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<DocumentItem[]>([blankItem()]);
  const [docNo, setDocNo] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const companiesQ = useQuery(() => listCompanies(true), []);
  const banksQ = useQuery(
    () => (companyId ? listBankAccounts(companyId) : Promise.resolve([])), [companyId]);
  const templatesQ = useQuery(() => listTemplates(), []);
  const usersQ = useQuery(
    async () => (await supabase.from('users').select('id, name').eq('is_active', true).order('name')).data ?? [],
    []);
  const stockQ = useQuery(
    async () => (await supabase.from('stock_items')
      .select('id, model_code, description, unit, sale_price').order('model_code').limit(500)).data ?? [],
    []);

  // คู่ค้า: ลูกค้าสำหรับเอกสารขาย · ผู้ขายสำหรับเอกสารซื้อ
  const partiesQ = useQuery<PartyOption[]>(async () => {
    if (ar) {
      const { data } = await supabase.from('customers')
        .select('id, display_name, company_name, tax_id, branch_code, branch_name, billing_address, address, phone')
        .order('display_name').limit(500);
      return (data ?? []).map((c) => ({
        id: c.id as string,
        label: (c.company_name as string) || (c.display_name as string),
        raw: c,
      }));
    }
    const vendors = await listVendors();
    return vendors.map((v) => ({ id: v.id, label: v.display_name, raw: v as unknown as Record<string, unknown> }));
  }, [ar]);

  // โหลดเอกสารเดิม
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = ar ? await getArDocument(id) : await getApDocument(id);
        setCompanyId(d.company_id);
        setDocDate(d.doc_date);
        setDueDate(d.due_date ?? '');
        setJobName(d.job_name ?? '');
        setContactName(d.contact_name ?? '');
        setContactPhone(d.contact_phone ?? '');
        setIncludeVat(d.price_include_vat);
        setVatRate(Number(d.vat_rate));
        setWhtRate(Number(d.wht_rate));
        setNote(d.note_text ?? '');
        setTerms(d.terms_text ?? '');
        setDocNo(d.doc_no);
        setStatus(d.status);
        setItems(d.items?.length ? d.items : [blankItem()]);
        if (ar) {
          const a = d as Awaited<ReturnType<typeof getArDocument>>;
          setPartyId(a.customer_id ?? '');
          setValidUntil(a.valid_until ?? '');
          setSalesUserId(a.sales_user_id ?? '');
          setFulfilment(a.fulfilment_type ?? 'install');
          setBillingPercent(a.billing_percent != null ? String(a.billing_percent) : '');
        } else {
          setPartyId((d as Awaited<ReturnType<typeof getApDocument>>).vendor_id ?? '');
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'โหลดเอกสารไม่สำเร็จ', 'error');
      }
    })();
  }, [id, ar, toast]);

  // เอกสารใหม่ → ใช้บริษัทตั้งต้น
  useEffect(() => {
    if (id || companyId) return;
    void getDefaultCompany().then((c) => c && setCompanyId(c.id));
  }, [id, companyId]);

  const totals = useMemo(
    () => computeTotals(items, {
      priceIncludeVat: includeVat,
      vatRate,
      whtRate,
      billingPercent: billingPercent ? Number(billingPercent) : null,
    }),
    [items, includeVat, vatRate, whtRate, billingPercent]
  );

  const locked = Boolean(docNo) || status === 'cancelled';
  const label = ar
    ? AR_DOC_LABEL[docType as ArDocType]
    : AP_DOC_LABEL[docType as ApDocType];

  const patchItem = (idx: number, patch: Partial<DocumentItem>) =>
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      return { ...next, line_total: lineTotal(next) };
    }));

  async function handleSave(): Promise<string | null> {
    if (!companyId) { toast('เลือกบริษัทผู้ออกเอกสารก่อน', 'error'); return null; }
    if (!partyId) { toast(ar ? 'เลือกลูกค้าก่อน' : 'เลือกผู้ขายก่อน', 'error'); return null; }
    if (!items.some((i) => i.description.trim())) { toast('ใส่รายการอย่างน้อย 1 บรรทัด', 'error'); return null; }

    setBusy(true);
    try {
      const common = {
        id: savedId, company_id: companyId, doc_date: docDate,
        due_date: dueDate || null, price_include_vat: includeVat,
        vat_rate: vatRate, wht_rate: whtRate, job_name: jobName || null,
        contact_name: contactName || null, contact_phone: contactPhone || null,
        note_text: note || null, terms_text: terms || null, items,
      };
      const newId = ar
        ? await saveArDocument({
            ...common, doc_type: docType as ArDocType, customer_id: partyId,
            valid_until: validUntil || null, sales_user_id: salesUserId || null,
            fulfilment_type: fulfilment,
            billing_percent: billingPercent ? Number(billingPercent) : null,
          }, userId)
        : await saveApDocument({
            ...common, doc_type: docType as ApDocType, vendor_id: partyId,
          }, userId);
      setSavedId(newId);
      toast('บันทึกร่างแล้ว');
      return newId;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue() {
    const savedDocId = await handleSave();
    if (!savedDocId) return;
    setBusy(true);
    try {
      const no = ar ? await issueArDocument(savedDocId) : await issueApDocument(savedDocId);
      setDocNo(no);
      setStatus(ar && docType === 'QT' ? 'approved' : 'issued');
      toast(`ออกเอกสารเลขที่ ${no} แล้ว`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ออกเลขที่ไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!savedId) { nav(-1); return; }
    try {
      if (ar) await deleteArDraft(savedId); else await deleteApDraft(savedId);
      toast('ลบร่างแล้ว');
      nav(`/accounting/${docType}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
    }
  }

  const selectedParty = partiesQ.data?.find((p) => p.id === partyId);
  const selectedCompany = companiesQ.data?.find((c) => c.id === companyId);

  const printable: PrintableDoc = {
    doc_type: docType,
    doc_no: docNo,
    doc_date: docDate,
    due_date: dueDate || null,
    valid_until: validUntil || null,
    company_snapshot: selectedCompany ? companySnapshot(selectedCompany) : null,
    party_snapshot: selectedParty
      ? (ar
          ? customerSnapshotFrom(selectedParty.raw as Parameters<typeof customerSnapshotFrom>[0])
          : {
              name: selectedParty.label,
              branch_label: (selectedParty.raw.branch_name as string) ?? null,
              tax_id: (selectedParty.raw.tax_id as string) ?? null,
              address: (selectedParty.raw.address as string) ?? null,
              phone: (selectedParty.raw.phone as string) ?? null,
            })
      : null,
    party_label: ar ? 'ลูกค้า' : 'ผู้ขาย',
    job_name: jobName,
    contact_name: contactName,
    contact_phone: contactPhone,
    sales_name: usersQ.data?.find((u) => u.id === salesUserId)?.name ?? null,
    price_include_vat: includeVat,
    vat_rate: vatRate,
    billing_percent: billingPercent ? Number(billingPercent) : null,
    subtotal: totals.subtotal,
    discount_total: totals.discountTotal,
    vat_base: totals.vatBase,
    vat_exempt_base: totals.vatExemptBase,
    vat_amount: totals.vatAmount,
    grand_total: totals.grandTotal,
    wht_amount: totals.whtAmount,
    net_payable: totals.netPayable,
    note_text: note,
    terms_text: terms,
    items: items.filter((i) => i.description.trim()),
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center gap-3 no-print">
        <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{label}</h1>
          <p className="text-xs text-slate-500">
            {docNo ? `เลขที่ ${docNo}` : 'ร่าง — ยังไม่ออกเลขที่'}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <GhostButton onClick={() => setPreview((v) => !v)}>
            <Printer className="w-4 h-4" /> {preview ? 'กลับไปแก้ไข' : 'ดูตัวอย่าง / พิมพ์'}
          </GhostButton>
          {!locked && (
            <>
              <GhostButton onClick={() => void handleSave()} disabled={busy}>
                <Save className="w-4 h-4" /> บันทึกร่าง
              </GhostButton>
              <PrimaryButton onClick={() => void handleIssue()} disabled={busy}>
                <FileCheck2 className="w-4 h-4" /> ออกเอกสาร
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {locked && (
        <div className="no-print rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
          dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          เอกสารออกเลขที่แล้ว แก้ไขไม่ได้ — ถ้าผิดต้องยกเลิกและออกใบใหม่ หรือออกใบลดหนี้
        </div>
      )}

      {preview ? (
        <div className="print-root flex flex-col items-center gap-6">
          <DocumentPrintView doc={printable} copyLabel="ต้นฉบับ" bankAccounts={banksQ.data ?? []} />
          <DocumentPrintView doc={printable} copyLabel="สำเนา" bankAccounts={banksQ.data ?? []} />
          <div className="no-print">
            <PrimaryButton onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> พิมพ์ / บันทึกเป็น PDF
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <>
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
            dark:border-slate-800 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="บริษัทผู้ออกเอกสาร" required
                   hint="เปลี่ยนหัวบิลได้เหมือนเปลี่ยนลูกค้า">
              <Select value={companyId} disabled={locked}
                      onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— เลือก —</option>
                {companiesQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
              </Select>
            </Field>

            <Field label={ar ? 'ลูกค้า' : 'ผู้ขาย'} required className="md:col-span-2">
              <Select value={partyId} disabled={locked} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">— เลือก —</option>
                {partiesQ.data?.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </Field>

            <Field label="วันที่" required>
              <TextInput type="date" value={docDate} disabled={locked}
                         onChange={(e) => setDocDate(e.target.value)} />
            </Field>

            {docType === 'QT' ? (
              <Field label="ยืนราคาถึง">
                <TextInput type="date" value={validUntil} disabled={locked}
                           onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            ) : (
              <Field label="ครบกำหนด">
                <TextInput type="date" value={dueDate} disabled={locked}
                           onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            )}

            {ar && (
              <Field label="ผู้ขาย (พนักงาน)">
                <Select value={salesUserId} disabled={locked}
                        onChange={(e) => setSalesUserId(e.target.value)}>
                  <option value="">— ไม่ระบุ —</option>
                  {usersQ.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            )}

            <Field label="ชื่องาน" className="md:col-span-2"
                   hint="เช่น SMART LOCK - PHUKET (โครงการ Kata Bello จำนวน 760 Units)">
              <TextInput value={jobName} disabled={locked}
                         onChange={(e) => setJobName(e.target.value)} />
            </Field>

            {ar && (
              <Field label="ประเภทงาน" hint="ส่งอย่างเดียวไม่ต้องเปิดโปรเจกต์">
                <Select value={fulfilment} disabled={locked}
                        onChange={(e) => setFulfilment(e.target.value as 'install' | 'delivery')}>
                  <option value="install">ติดตั้ง</option>
                  <option value="delivery">ส่งอย่างเดียว</option>
                </Select>
              </Field>
            )}

            <Field label="ผู้ติดต่อ">
              <TextInput value={contactName} disabled={locked}
                         onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="เบอร์โทรผู้ติดต่อ">
              <TextInput value={contactPhone} disabled={locked}
                         onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
            dark:border-slate-800 p-5">
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <Field label="รูปแบบราคา" className="w-48">
                <Select value={includeVat ? 'inc' : 'exc'} disabled={locked}
                        onChange={(e) => setIncludeVat(e.target.value === 'inc')}>
                  <option value="inc">ราคารวม VAT แล้ว</option>
                  <option value="exc">ราคายังไม่รวม VAT</option>
                </Select>
              </Field>
              <Field label="VAT %" className="w-24">
                <NumberInput value={vatRate} disabled={locked} step="0.01"
                             onChange={(e) => setVatRate(Number(e.target.value))} />
              </Field>
              <Field label="หัก ณ ที่จ่าย %" className="w-32">
                <NumberInput value={whtRate} disabled={locked} step="0.01"
                             onChange={(e) => setWhtRate(Number(e.target.value))} />
              </Field>
              <Field label="แบ่งชำระ %" className="w-32" hint="ว่าง = เต็มจำนวน">
                <NumberInput value={billingPercent} disabled={locked} placeholder="30"
                             onChange={(e) => setBillingPercent(e.target.value)} />
              </Field>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2 text-left">รายละเอียด</th>
                    <th className="px-2 py-2 w-24">ประเภท</th>
                    <th className="px-2 py-2 w-24">ภาษี</th>
                    <th className="px-2 py-2 w-20">จำนวน</th>
                    <th className="px-2 py-2 w-20">หน่วย</th>
                    <th className="px-2 py-2 w-28">ราคา/หน่วย</th>
                    <th className="px-2 py-2 w-28">ส่วนลด</th>
                    <th className="px-2 py-2 w-28 text-right">มูลค่า</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800 align-top">
                      <td className="px-2 py-2 text-center text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">
                        <TextArea
                          rows={2} value={it.description} disabled={locked}
                          placeholder={'ชื่อรุ่น\n - สเปกย่อย'}
                          onChange={(e) => patchItem(i, { description: e.target.value })}
                        />
                        <select
                          className="mt-1 text-[11px] text-slate-500 bg-transparent"
                          disabled={locked}
                          value={it.stock_item_id ?? ''}
                          onChange={(e) => {
                            const s = stockQ.data?.find((x) => x.id === e.target.value);
                            patchItem(i, s
                              ? {
                                  stock_item_id: s.id as string,
                                  description: `${s.model_code}${s.description ? `\n${s.description}` : ''}`,
                                  unit: (s.unit as string) ?? 'ชิ้น',
                                  unit_price: Number(s.sale_price) || 0,
                                }
                              : { stock_item_id: null });
                          }}
                        >
                          <option value="">+ ดึงจากคลังสินค้า</option>
                          {stockQ.data?.map((s) => (
                            <option key={s.id as string} value={s.id as string}>
                              {s.model_code as string}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <Select value={it.item_type} disabled={locked}
                                onChange={(e) => patchItem(i, { item_type: e.target.value as 'goods' | 'service' })}>
                          <option value="goods">สินค้า</option>
                          <option value="service">บริการ</option>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select value={it.vat_type} disabled={locked}
                                onChange={(e) => patchItem(i, { vat_type: e.target.value as VatType })}>
                          <option value="vat">VAT</option>
                          <option value="exempt">ยกเว้น</option>
                          <option value="zero">0%</option>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <NumberInput value={it.qty} disabled={locked} step="0.001"
                                     onChange={(e) => patchItem(i, { qty: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <TextInput value={it.unit ?? ''} disabled={locked}
                                   onChange={(e) => patchItem(i, { unit: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <NumberInput value={it.unit_price} disabled={locked} step="0.01"
                                     onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <NumberInput value={it.discount_amount} disabled={locked} step="0.01"
                                     onChange={(e) => patchItem(i, { discount_amount: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {money(it.line_total)}
                      </td>
                      <td className="px-1">
                        {!locked && items.length > 1 && (
                          <button onClick={() => setItems((p) => p.filter((_, x) => x !== i))}
                                  className="text-slate-300 hover:text-rose-500 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!locked && (
              <div className="flex gap-2 mt-3">
                <GhostButton onClick={() => setItems((p) => [...p, blankItem()])}>
                  <Plus className="w-4 h-4" /> เพิ่มบรรทัด
                </GhostButton>
                <GhostButton onClick={() => setItems((p) => [...p, { ...p[p.length - 1] }])}>
                  <Copy className="w-4 h-4" /> ทำซ้ำบรรทัดล่าสุด
                </GhostButton>
              </div>
            )}

            <div className="flex justify-end mt-5">
              <div className="w-full max-w-sm text-sm">
                <Sum k="รวมเป็นเงิน" v={totals.subtotal} />
                {totals.discountTotal > 0 && <Sum k="ส่วนลด" v={totals.discountTotal} />}
                <Sum k="มูลค่าที่ไม่มี/ยกเว้นภาษี" v={totals.vatExemptBase} />
                <Sum k="มูลค่าที่คำนวณภาษี" v={totals.vatBase} />
                <Sum k={`ภาษีมูลค่าเพิ่ม ${vatRate}%`} v={totals.vatAmount} />
                <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                  <Sum k="จำนวนเงินรวมทั้งสิ้น" v={totals.grandTotal} bold />
                </div>
                {totals.whtAmount > 0 && <Sum k="หักภาษี ณ ที่จ่าย" v={-totals.whtAmount} />}
                <Sum k="ยอดชำระ" v={totals.netPayable} bold />
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
            dark:border-slate-800 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="หมายเหตุ">
              <TextArea rows={6} value={note} disabled={locked}
                        onChange={(e) => setNote(e.target.value)} />
              {!locked && templatesQ.data && templatesQ.data.length > 0 && (
                <Select className="mt-2" value=""
                        onChange={(e) => {
                          const t = templatesQ.data?.find((x) => x.id === e.target.value);
                          if (t) setNote((prev) => (prev ? `${prev}\n${t.body}` : t.body));
                        }}>
                  <option value="">+ แทรกจากแม่แบบ</option>
                  {templatesQ.data.filter((t) => t.kind === 'note')
                    .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="เงื่อนไข">
              <TextArea rows={6} value={terms} disabled={locked}
                        onChange={(e) => setTerms(e.target.value)} />
              {!locked && templatesQ.data && templatesQ.data.length > 0 && (
                <Select className="mt-2" value=""
                        onChange={(e) => {
                          const t = templatesQ.data?.find((x) => x.id === e.target.value);
                          if (t) setTerms((prev) => (prev ? `${prev}\n${t.body}` : t.body));
                        }}>
                  <option value="">+ แทรกจากแม่แบบ</option>
                  {templatesQ.data.filter((t) => t.kind === 'terms')
                    .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
          </section>

          {!locked && savedId && (
            <div>
              <button onClick={() => void handleDelete()}
                      className="text-xs text-rose-500 hover:underline">
                ลบร่างนี้
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Sum({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
      <span>{k}</span>
      <span className="tabular-nums">{money(v)}</span>
    </div>
  );
}

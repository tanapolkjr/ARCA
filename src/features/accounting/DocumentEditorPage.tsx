import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, Copy, FileCheck2, FileOutput, HandCoins, Plus, Printer, Save, Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { computeTotals, lineDiscount, lineTotal, money } from '@/accounting-lib/calc';
import {
  AP_DOC_LABEL, AR_DOC_LABEL,
} from '@/accounting-lib/types';
import type { ApDocType, ArDocType, DocumentItem, VatType } from '@/accounting-lib/types';
import { getDefaultCompany, listBankAccounts, listCompanies, listTemplates, listVendors } from '@/accounting-api/setup';
import {
  cancelApDocument, cancelDocument,
  companySnapshot, convertArDocument, customerSnapshotFrom, deleteApDraft, deleteArDraft,
  getApDocument, getArDocument, getDocNo, issueApDocument, issueArDocument, listChildDocuments,
  listDocumentTags, saveApDocument, saveArDocument,
} from '@/accounting-api/documents';
import { supabase } from '../../lib/supabaseClient.js';
import { DocumentPrintView, type PrintableDoc } from './DocumentPrintView';
import { Field, GhostButton, NumberInput, PrimaryButton, Select, TextArea, TextInput } from './ui';
import { CancelDialog, PaymentHistory, ReceivePaymentModal } from './PaymentPanel';

const AR_TYPES: ArDocType[] = ['QT', 'BL', 'INV', 'RC', 'CN', 'DN'];
const isAr = (t: string): t is ArDocType => (AR_TYPES as string[]).includes(t);

const blankItem = (): DocumentItem => ({
  line_no: 1, stock_item_id: null, description: '', item_type: 'goods',
  vat_type: 'vat', qty: 1, unit: 'ชิ้น', unit_price: 0,
  discount_amount: 0, discount_percent: null, line_total: 0,
});

interface PartyOption { id: string; label: string; raw: Record<string, unknown> }

/**
 * ตัวห่อที่บังคับให้ React สร้างหน้าใหม่ทุกครั้งที่ URL เปลี่ยนเอกสาร
 *
 * ทุกประเภทเอกสารใช้ route pattern เดียวกัน (/accounting/:docType/:id)
 * React Router จึงไม่ remount ตอนกดแปลง QT → INV — state ทั้งหมดของหน้าเดิม
 * (รวมถึงตัวชี้เอกสารที่กำลังแก้) ค้างข้ามใบ เคยทำให้ใบเสนอราคาถูกบันทึกทับ
 * เป็นใบกำกับมาแล้ว key ตาม docType+id ตัดปัญหาทั้งตระกูลนี้ทิ้ง
 */
export function DocumentEditorPage() {
  const { docType = 'QT', id } = useParams();
  return <DocumentEditorInner key={`${docType}:${id ?? 'new'}`} />;
}

function DocumentEditorInner() {
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
  const [tagId, setTagId] = useState('');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<DocumentItem[]>([blankItem()]);
  const [docNo, setDocNo] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [sourceRef, setSourceRef] = useState<{ id: string; docNo: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const companiesQ = useQuery(() => listCompanies(true), []);
  const banksQ = useQuery(
    () => (companyId ? listBankAccounts(companyId) : Promise.resolve([])), [companyId]);
  const templatesQ = useQuery(() => listTemplates(), []);
  const tagsQ = useQuery(() => listDocumentTags(), []);
  const childrenQ = useQuery(
    () => (savedId && ar ? listChildDocuments(savedId) : Promise.resolve([])), [savedId, ar]);
  const usersQ = useQuery(
    async () => (await supabase.from('users').select('id, name').eq('is_active', true).order('name')).data ?? [],
    []);
  const stockQ = useQuery<StockOption[]>(
    async () => ((await supabase.from('stock_items')
      .select('id, model_code, description, unit, sale_price')
      .order('model_code').limit(1000)).data ?? []) as StockOption[],
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
    setSavedId(id);
    setPreview(false);
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
        setPaidAmount(Number(d.paid_amount) || 0);
        setItems(d.items?.length ? d.items : [blankItem()]);
        setTagId(d.tag_id ?? '');
        if (ar && d.source_document_id) {
          const no = await getDocNo(d.source_document_id);
          setSourceRef({ id: d.source_document_id, docNo: no });
        } else {
          setSourceRef(null);
        }
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
  }, [id, ar, toast, reloadKey]);

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

  /** แปลงเป็นเอกสารถัดไป โดยยกยอด ลูกค้า สินค้า และ Tag ตามไปทั้งชุด */
  async function handleConvert(target: ArDocType) {
    if (!savedId) return;
    setBusy(true);
    try {
      const newId = await convertArDocument(savedId, target, userId);
      toast(`สร้าง${AR_DOC_LABEL[target]}จากเอกสารนี้แล้ว`);
      nav(`/accounting/${target}/${newId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'แปลงเอกสารไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
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
    reference_no: sourceRef?.docNo ?? null,
    tag_name: tagsQ.data?.find((t) => t.id === tagId)?.name ?? null,
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
            {sourceRef && (
              <>
                {' · อ้างอิง '}
                <Link to={`/accounting/QT/${sourceRef.id}`} className="text-indigo-600 hover:underline">
                  {sourceRef.docNo ?? 'ใบเสนอราคา'}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <GhostButton onClick={() => setPreview((v) => !v)}>
            <Printer className="w-4 h-4" /> {preview ? 'กลับไปแก้ไข' : 'ดูตัวอย่าง / พิมพ์'}
          </GhostButton>
          {locked && status !== 'cancelled' && ar && docType !== 'QT' && (
            <GhostButton onClick={() => setShowReceive(true)} disabled={busy}>
              <HandCoins className="w-4 h-4" /> รับชำระเงิน
            </GhostButton>
          )}
          {locked && status !== 'cancelled' && (
            <GhostButton onClick={() => setShowCancel(true)} disabled={busy}
                         className="!text-rose-600 !border-rose-200 dark:!border-rose-900">
              <Ban className="w-4 h-4" /> ยกเลิกเอกสาร
            </GhostButton>
          )}
          {locked && ar && docType === 'QT' && (
            <>
              <GhostButton onClick={() => void handleConvert('BL')} disabled={busy}>
                <FileOutput className="w-4 h-4" /> สร้างใบแจ้งหนี้
              </GhostButton>
              <GhostButton onClick={() => void handleConvert('INV')} disabled={busy}>
                <FileOutput className="w-4 h-4" /> สร้างใบกำกับ/ใบเสร็จ
              </GhostButton>
            </>
          )}
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

      {status === 'cancelled' ? (
        <div className="no-print rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200
          dark:border-rose-800 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          เอกสารนี้ถูกยกเลิกแล้ว — เลขที่ยังถูกเก็บไว้ตามกฎหมาย นำกลับมาใช้ใหม่ไม่ได้
        </div>
      ) : locked && (
        <div className="no-print rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
          dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          เอกสารออกเลขที่แล้ว แก้ไขไม่ได้ — ถ้าผิดต้องยกเลิกและออกใบใหม่ หรือออกใบลดหนี้
        </div>
      )}

      {ar && locked && docType !== 'QT' && savedId && (
        <PaymentHistory documentId={savedId} grandTotal={totals.grandTotal}
                        onChanged={() => setReloadKey((k) => k + 1)} />
      )}

      {ar && docType === 'QT' && (childrenQ.data?.length ?? 0) > 0 && (
        <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
          dark:border-slate-800 p-4">
          <div className="flex items-baseline gap-3 mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              ออกบิลจากใบนี้ไปแล้ว
            </h3>
            <span className="text-sm tabular-nums font-bold text-indigo-600">
              {money((childrenQ.data ?? []).reduce((a, c) => a + Number(c.grand_total || 0), 0))}
            </span>
            <span className="text-xs text-slate-400">
              จากยอดเอกสาร {money(totals.grandTotal)} · คงเหลือ{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                {money(Math.max(0, totals.grandTotal
                  - (childrenQ.data ?? []).reduce((a, c) => a + Number(c.grand_total || 0), 0)))}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {childrenQ.data?.map((c) => (
              <button key={c.id} onClick={() => nav(`/accounting/${c.doc_type}/${c.id}`)}
                      className="flex items-center gap-3 text-xs text-left hover:text-indigo-600">
                <span className="w-14 text-slate-400">{c.doc_type}</span>
                <span className="font-medium">{c.doc_no ?? 'ร่าง'}</span>
                <span className="text-slate-400">{c.doc_date}</span>
                <span className="ml-auto tabular-nums">{money(c.grand_total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showReceive && savedId && (
        <ReceivePaymentModal
          documentId={savedId}
          companyId={companyId}
          customerId={partyId || null}
          docNo={docNo}
          outstanding={Math.max(0, totals.grandTotal - paidAmount)}
          onClose={() => setShowReceive(false)}
          onSaved={() => { setShowReceive(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {showCancel && savedId && (
        <CancelDialog
          docNo={docNo}
          onCancel={() => setShowCancel(false)}
          onConfirm={async (reason) => {
            try {
              if (ar) await cancelDocument(savedId, reason);
              else await cancelApDocument(savedId, reason);
              toast('ยกเลิกเอกสารแล้ว');
              setShowCancel(false);
              setReloadKey((k) => k + 1);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
            }
          }}
        />
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

            <Field label="ประเภทงาน (Tag)"
                   hint="ยึดจากใบเสนอราคา แล้วไหลตามไปทุกเอกสารที่แปลงต่อ">
              <Select value={tagId} disabled={locked} onChange={(e) => setTagId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {tagsQ.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>

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
                    <th className="px-2 py-2 w-36">ส่วนลด</th>
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
                        {!locked && (
                          <StockPicker
                            items={stockQ.data ?? []}
                            onPick={(s) => patchItem(i, {
                              stock_item_id: s.id,
                              description: `${s.model_code}${s.description ? `\n${s.description}` : ''}`,
                              unit: s.unit ?? 'ชิ้น',
                              unit_price: s.sale_price ?? 0,
                            })}
                          />
                        )}
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
                        <div className="flex gap-1">
                          <NumberInput
                            className="!px-2"
                            value={it.discount_percent != null ? it.discount_percent : it.discount_amount}
                            disabled={locked} step="0.01"
                            onChange={(e) => patchItem(i, it.discount_percent != null
                              ? { discount_percent: Number(e.target.value) }
                              : { discount_amount: Number(e.target.value) })}
                          />
                          <button
                            type="button" disabled={locked}
                            title="สลับระหว่างบาทและเปอร์เซ็นต์"
                            onClick={() => patchItem(i, it.discount_percent != null
                              ? { discount_percent: null, discount_amount: 0 }
                              : { discount_percent: 0, discount_amount: 0 })}
                            className="px-2 rounded-lg border border-slate-200 dark:border-slate-700
                              text-xs text-slate-500 hover:text-indigo-600 shrink-0"
                          >
                            {it.discount_percent != null ? '%' : '฿'}
                          </button>
                        </div>
                        {/* กรอกเป็น % ต้องเห็นด้วยว่าลดไปกี่บาท */}
                        {it.discount_percent != null && it.discount_percent !== 0 && (
                          <div className="text-[11px] text-slate-400 text-right mt-0.5 tabular-nums">
                            −{money(lineDiscount(it))}
                          </div>
                        )}
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
                <Sum k="ส่วนลด" v={-totals.discountTotal} />
                <Sum k="จำนวนเงินหลังหักส่วนลด" v={totals.afterDiscount} />
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

interface StockOption {
  id: string; model_code: string; description: string | null;
  unit: string | null; sale_price: number | null;
}

/**
 * ค้นหาสินค้าจากคลังด้วยการพิมพ์ แทน dropdown ที่ยาวเป็นร้อยบรรทัด
 * ถ้าไม่เจอ ให้ลิงก์ไปเพิ่มที่หน้า Inventory — สินค้าต้องมีที่เดียว
 */
function StockPicker({
  items, onPick,
}: { items: StockOption[]; onPick: (s: StockOption) => void }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);

  const matches = term.trim()
    ? items.filter((s) => {
        const q = term.trim().toLowerCase();
        return s.model_code?.toLowerCase().includes(q)
            || (s.description ?? '').toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  return (
    <div className="relative mt-1">
      <input
        value={term}
        placeholder="ค้นหาสินค้าจากคลัง…"
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="w-full text-[11px] px-2 py-1 rounded-lg border border-dashed
          border-slate-200 dark:border-slate-700 bg-transparent
          text-slate-600 dark:text-slate-300 focus:outline-none focus:border-indigo-400"
      />
      {open && term.trim() && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800
          border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          {matches.map((s) => (
            <button
              key={s.id} type="button"
              onMouseDown={() => { onPick(s); setTerm(''); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs
                hover:bg-indigo-50 dark:hover:bg-slate-700"
            >
              <span className="font-medium">{s.model_code}</span>
              {s.description && <span className="text-slate-400"> · {s.description}</span>}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">
              ไม่พบสินค้านี้ —{' '}
              <Link to="/stock" className="text-indigo-600 hover:underline">
                ไปเพิ่มใน Inventory
              </Link>
            </div>
          )}
        </div>
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

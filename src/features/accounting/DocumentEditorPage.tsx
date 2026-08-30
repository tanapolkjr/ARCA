import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, BadgeCheck, Copy, FileOutput, HandCoins, Plus, Printer,
  RotateCcw, Save, Search, Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { computeTotals, docDate as docDateTh, lineDiscount, lineTotal, money } from '@/accounting-lib/calc';
import {
  AP_DOC_LABEL, AR_DOC_LABEL,
} from '@/accounting-lib/types';
import type {
  ApDocType, ArDocType, DiscountMode, DocumentItem, VatType,
} from '@/accounting-lib/types';
import { getDefaultCompany, listBankAccounts, listCompanies, listTemplates, listVendors } from '@/accounting-api/setup';
import {
  approveQuotation, cancelApDocument, cancelDocument, childBillingPercent, childExtraDiscount,
  companySnapshot, convertArDocument, customerSnapshotFrom, deleteApDraft, deleteArDocument,
  loadSource, resetQuotationToDraft,
  getApDocument, getArDocument, getDocNo, issueApDocument, issueArDocument,
  latestPaymentDate, listChildDocuments,
  listDocumentTags, saveApDocument, saveArDocument,
} from '@/accounting-api/documents';
import { supabase } from '../../lib/supabaseClient.js';
import { DocumentPrintView, type PrintableDoc } from './DocumentPrintView';
import {
  Field, GhostButton, NumberInput, PrimaryButton, Select, StatusPill, TextArea, TextInput, inputCls,
} from './ui';
import { CancelDialog, PaymentHistory, ReceivePaymentModal } from './PaymentPanel';
import { SourceRefPicker } from './SourceRefPicker';

const AR_TYPES: ArDocType[] = ['QT', 'BL', 'INV', 'RC', 'CN', 'DN'];

/** ป้ายบนปุ่มสลับโหมดส่วนลด — สั้นแต่ต้องอ่านออกว่าคิดยังไง */
const DISCOUNT_LABEL: Record<DiscountMode, string> = {
  unit: '฿/ชิ้น',
  line: '฿ รวม',
  percent: '%',
};
const DISCOUNT_NEXT: Record<DiscountMode, DiscountMode> = {
  unit: 'line', line: 'percent', percent: 'unit',
};
const isAr = (t: string): t is ArDocType => (AR_TYPES as string[]).includes(t);

const blankItem = (): DocumentItem => ({
  line_no: 1, stock_item_id: null, description: '', item_type: 'goods',
  vat_type: 'vat', qty: 1, unit: 'ชิ้น', unit_price: 0,
  discount_amount: 0, discount_percent: null,
  discount_mode: 'unit', discount_input: 0, wht_rate: 0, line_total: 0,
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
  // ใบแจ้งหนี้อ้างใบเสนอราคา · ใบกำกับ/ใบเสร็จอ้างใบแจ้งหนี้ — ต่อกันเป็นลูกโซ่
  const sourceType: ArDocType | null =
    docType === 'BL' ? 'QT' : (docType === 'INV' || docType === 'RC') ? 'BL' : null;

  const [companyId, setCompanyId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  // ใบเสนอราคายืนราคาถึงสิ้นปีเป็นค่าตั้งต้น ตามที่ใช้จริง
  const [validUntil, setValidUntil] = useState(`${new Date().getFullYear()}-12-31`);
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
  const [customerPoNo, setCustomerPoNo] = useState('');
  const [extraDiscType, setExtraDiscType] = useState<'amount' | 'percent'>('amount');
  const [extraDiscValue, setExtraDiscValue] = useState('');
  const [paidOn, setPaidOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<DocumentItem[]>([blankItem()]);
  const [docNo, setDocNo] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [sourceRef, setSourceRef] = useState<
    { id: string; docNo: string | null; jobName?: string | null } | null>(null);
  // ยอดของใบต้นทางและยอดที่ยังออกได้ — ใช้กันไม่ให้วางบิลเกิน
  const [sourceTotal, setSourceTotal] = useState<number | null>(null);
  const [sourceRemaining, setSourceRemaining] = useState<number | null>(null);
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
    async () => (await supabase.from('users')
      .select('id, name, phone').eq('is_active', true).order('name')).data ?? [],
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
        if (ar) { try { setPaidOn(await latestPaymentDate(id)); } catch { /* ไม่สำคัญพอจะขวางการเปิดเอกสาร */ } }
        setItems(d.items?.length ? d.items : [blankItem()]);
        setTagId(d.tag_id ?? '');
        setCustomerPoNo(d.customer_po_no ?? '');
        setExtraDiscType((d.extra_discount_type as 'amount' | 'percent') ?? 'amount');
        setExtraDiscValue(Number(d.extra_discount_value) ? String(d.extra_discount_value) : '');
        if (ar && d.source_document_id) {
          const no = await getDocNo(d.source_document_id);
          setSourceRef({ id: d.source_document_id, docNo: no });
          try {
            const info = await loadSource(d.source_document_id, id);
            setSourceTotal(info.source.grand_total);
            setSourceRemaining(info.remaining);
          } catch { /* ใบต้นทางอาจถูกลบไปแล้ว — ไม่ต้องขวางการเปิดเอกสาร */ }
        } else {
          setSourceRef(null);
          setSourceTotal(null);
          setSourceRemaining(null);
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
      extraDiscountType: extraDiscType,
      extraDiscountValue: Number(extraDiscValue) || 0,
    }),
    [items, includeVat, vatRate, whtRate, billingPercent, extraDiscType, extraDiscValue]
  );

  // ใบเสนอราคาได้เลขตั้งแต่ร่าง จึงล็อกตามสถานะ ไม่ใช่ตามการมีเลขที่
  const isQt = ar && docType === 'QT';
  const locked = status === 'cancelled'
    || (isQt ? status !== 'draft' : Boolean(docNo));
  const label = ar
    ? AR_DOC_LABEL[docType as ArDocType]
    : AP_DOC_LABEL[docType as ApDocType];

  const patchItem = (idx: number, patch: Partial<DocumentItem>) =>
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      // อัปเดตยอดส่วนลดที่หักจริงด้วย ไม่งั้นตอนดูตัวอย่างก่อนบันทึก
      // คอลัมน์ "ส่วนลด" บนใบจะว่าง เพราะยังเป็นค่าเดิมจากตอนสร้างบรรทัด
      return { ...next, discount_amount: lineDiscount(next), line_total: lineTotal(next) };
    }));

  async function handleSave(): Promise<string | null> {
    if (!companyId) { toast('เลือกบริษัทผู้ออกเอกสารก่อน', 'error'); return null; }
    if (!partyId) { toast(ar ? 'เลือกลูกค้าก่อน' : 'เลือกผู้ขายก่อน', 'error'); return null; }
    if (!items.some((i) => i.description.trim())) { toast('ใส่รายการอย่างน้อย 1 บรรทัด', 'error'); return null; }

    // ช่องที่ต้องมีก่อนออกเอกสารจริง — ขาดแล้วเอกสารใช้ตามงานไม่ได้
    const missing: string[] = [];
    if (!jobName.trim()) missing.push('ชื่องาน');
    if (!tagId) missing.push('ประเภทงาน (Tag)');
    if (!contactName.trim()) missing.push('ผู้ติดต่อ');
    if (!contactPhone.trim()) missing.push('เบอร์โทรผู้ติดต่อ');
    if (ar) {
      if (!salesUserId) missing.push('ผู้ขาย (พนักงาน)');
      if (docType === 'QT' && !validUntil) missing.push('วันหมดอายุใบเสนอราคา');
    }
    if (missing.length) {
      toast(`ยังไม่ได้กรอก: ${missing.join(' · ')}`, 'error');
      return null;
    }

    // ห้ามวางบิลเกินยอดที่ใบต้นทางเหลือ
    if (sourceRemaining != null && totals.grandTotal > sourceRemaining + 0.01) {
      toast(
        `ยอดเอกสาร ${money(totals.grandTotal)} เกินยอดคงเหลือของใบต้นทาง ` +
        `(${money(sourceRemaining)}) — ลดยอดหรือลด % ที่เรียกเก็บลง`,
        'error'
      );
      return null;
    }

    setBusy(true);
    try {
      const common = {
        id: savedId, company_id: companyId, doc_date: docDate,
        due_date: dueDate || null, price_include_vat: includeVat,
        vat_rate: vatRate, wht_rate: whtRate, job_name: jobName || null,
        tag_id: tagId || null, customer_po_no: customerPoNo || null,
        extra_discount_type: extraDiscType,
        extra_discount_value: Number(extraDiscValue) || 0,
        contact_name: contactName || null, contact_phone: contactPhone || null,
        note_text: note || null, terms_text: terms || null, items,
      };
      const newId = ar
        ? await saveArDocument({
            ...common, doc_type: docType as ArDocType, customer_id: partyId,
            valid_until: validUntil || null, sales_user_id: salesUserId || null,
            fulfilment_type: fulfilment, source_document_id: sourceRef?.id ?? null,
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
      if (isQt) {
        // ใบเสนอราคามีเลขตั้งแต่ร่างแล้ว การอนุมัติจึงแค่เปลี่ยนสถานะ
        await approveQuotation(savedDocId, userId);
        setStatus('approved');
        toast('อนุมัติใบเสนอราคาแล้ว');
      } else {
        const no = ar ? await issueArDocument(savedDocId) : await issueApDocument(savedDocId);
        setDocNo(no);
        setStatus('issued');
        toast(`ออกเอกสารเลขที่ ${no} แล้ว`);
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  /** ปลดล็อกใบเสนอราคากลับไปแก้ได้ — ทำไม่ได้ถ้าออกใบแจ้งหนี้ไปแล้ว */
  async function handleReset() {
    if (!savedId) return;
    setBusy(true);
    try {
      await resetQuotationToDraft(savedId);
      setStatus('draft');
      toast('กลับเป็นร่างแล้ว แก้ไขต่อได้');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'รีเซ็ตไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
  }

  /**
   * เลือกใบต้นทางจากช่องอ้างอิง แล้วดึงข้อมูลมาทั้งชุด
   * ยอดที่ออกได้ถูกจำกัดไม่ให้เกินส่วนที่ใบต้นทางยังเหลือ
   */
  async function applySource(sourceId: string) {
    setBusy(true);
    try {
      const info = await loadSource(sourceId, savedId);
      const src = info.source;
      setSourceRef({ id: src.id, docNo: src.doc_no, jobName: src.job_name });
      setSourceTotal(src.grand_total);
      setSourceRemaining(info.remaining);

      setCompanyId(src.company_id);
      setPartyId(src.customer_id ?? '');
      setJobName(src.job_name ?? '');
      setContactName(src.contact_name ?? '');
      setContactPhone(src.contact_phone ?? '');
      setSalesUserId(src.sales_user_id ?? '');
      setTagId(src.tag_id ?? '');
      setCustomerPoNo(src.customer_po_no ?? '');

      setFulfilment(src.fulfilment_type ?? 'install');
      setIncludeVat(src.price_include_vat);
      setVatRate(Number(src.vat_rate));
      setWhtRate(Number(src.wht_rate));
      setNote(src.note_text ?? '');
      setTerms(src.terms_text ?? '');
      // ยกทั้งบรรทัดรวมโหมดส่วนลด ไม่งั้นยอดใบลูกจะไม่ตรงใบต้นทาง
      setItems(src.items?.length ? src.items.map((i) => ({ ...i, id: undefined })) : [blankItem()]);

      // ตั้ง % ให้ยอดตรงกับส่วนที่ใบต้นทางยังเหลือพอดี ผู้ใช้ปรับลงได้แต่เกินไม่ได้
      const pct = childBillingPercent(src, info.remaining);
      setBillingPercent(pct == null ? '' : String(pct));

      // ส่วนลดพิเศษต้องตามมาด้วย ไม่งั้นยอดใบลูกจะสูงกว่าใบต้นทางแล้วชนกฎห้ามวางเกิน
      // และถ้าคีย์เป็นบาทต้องย่อตามสัดส่วน กันลดซ้ำเวลาแตกเป็นหลายใบ
      setExtraDiscType((src.extra_discount_type as 'amount' | 'percent') ?? 'amount');
      const childDisc = childExtraDiscount(src, pct);
      setExtraDiscValue(childDisc ? String(childDisc) : '');

      toast(`ดึงข้อมูลจาก ${src.doc_no ?? 'ใบต้นทาง'} แล้ว`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ดึงข้อมูลใบต้นทางไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
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
      if (ar) await deleteArDocument(savedId); else await deleteApDraft(savedId);
      toast('ลบเอกสารแล้ว');
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
    sales_phone: usersQ.data?.find((u) => u.id === salesUserId)?.phone ?? null,
    reference_no: sourceRef?.docNo ?? null,
    customer_po_no: customerPoNo || null,
    paid_on: paidOn,
    extra_discount: totals.extraDiscount,
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
    wht_base: totals.whtBase,
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
                <Link to={`/accounting/QT/${sourceRef.id}`} className="text-slate-900 hover:underline">
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
          {isQt && status === 'approved' && (
            <GhostButton onClick={() => void handleConvert('BL')} disabled={busy}>
              <FileOutput className="w-4 h-4" /> สร้างใบแจ้งหนี้
            </GhostButton>
          )}
          {!locked && (
            <>
              <GhostButton onClick={() => void handleSave()} disabled={busy}>
                <Save className="w-4 h-4" /> บันทึกร่าง
              </GhostButton>
              <PrimaryButton onClick={() => void handleIssue()} disabled={busy}>
                <BadgeCheck className="w-4 h-4" /> {isQt ? 'อนุมัติ' : 'ออกเอกสาร'}
              </PrimaryButton>
            </>
          )}
          {isQt && status === 'approved' && (
            <GhostButton onClick={() => void handleReset()} disabled={busy}>
              <RotateCcw className="w-4 h-4" /> รีเซ็ตเป็นร่าง
            </GhostButton>
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

      {ar && (childrenQ.data?.length ?? 0) > 0 && (() => {
        const kids = childrenQ.data ?? [];
        const billed = kids.reduce((a, c) => a + Number(c.grand_total || 0), 0);
        const left = Math.max(0, totals.grandTotal - billed);
        return (
          <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
            dark:border-slate-800 overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-4 px-4 py-3
              border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-600">
                ประวัติการแบ่งจ่ายจากมูลค่าเอกสาร
              </h3>
              <div className="ml-auto flex gap-6 text-right">
                <div>
                  <div className="text-[11px] text-slate-400">เรียกเก็บแล้ว</div>
                  <div className="text-sm font-bold tabular-nums text-slate-600">{money(billed)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">ยังไม่ได้เรียกเก็บ</div>
                  <div className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {money(left)}
                  </div>
                </div>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/20 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left font-medium px-4 py-2 w-12">ลำดับ</th>
                  <th className="text-left font-medium px-4 py-2 w-40">เลขที่อ้างอิง</th>
                  <th className="text-left font-medium px-4 py-2 w-28">วันที่เอกสาร</th>
                  <th className="text-right font-medium px-4 py-2">มูลค่าที่ต้องชำระ</th>
                  <th className="text-right font-medium px-4 py-2 w-28">ชำระแล้ว</th>
                  <th className="text-left font-medium px-4 py-2 w-32">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {kids.map((c, i) => (
                  <tr key={c.id}
                      className="border-t border-slate-50 dark:border-slate-800
                        hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer"
                      onClick={() => nav(`/accounting/${c.doc_type}/${c.id}`)}>
                    <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{c.doc_no ?? 'ร่าง'}</td>
                    <td className="px-4 py-2 text-slate-500 tabular-nums">{docDateTh(c.doc_date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(c.grand_total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                      {money(c.paid_amount ?? 0)}
                    </td>
                    <td className="px-4 py-2"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

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

            <Field label={ar ? 'ลูกค้า' : 'ผู้ขาย'} required className="md:col-span-2"
                   hint={`ดึงจาก Contact — เพิ่มรายใหม่ได้ที่แท็บ${ar ? 'ลูกค้า' : 'ผู้ขาย / ผู้รับเหมา'}`}>
              <Select value={partyId} disabled={locked} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">— เลือก —</option>
                {partiesQ.data?.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              {(partiesQ.data?.length ?? 0) === 0 && !partiesQ.loading && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ยังไม่มี{ar ? 'ลูกค้า' : 'ผู้ขาย'}ในระบบ —{' '}
                  <Link to="/contact" className="underline">ไปเพิ่มที่ Contact</Link>
                </p>
              )}
            </Field>

            <Field label="วันที่" required>
              <TextInput type="date" value={docDate} disabled={locked}
                         onChange={(e) => setDocDate(e.target.value)} />
            </Field>

            {docType === 'QT' ? (
              <Field label="วันหมดอายุใบเสนอราคา" required
                     hint="ค่าตั้งต้นคือวันสุดท้ายของปี">
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
              <Field label="ผู้ขาย (พนักงาน)" required>
                <Select value={salesUserId} disabled={locked}
                        onChange={(e) => setSalesUserId(e.target.value)}>
                  <option value="">— ไม่ระบุ —</option>
                  {usersQ.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            )}

            <Field label="ชื่องาน" required className="md:col-span-2"
                   hint="เช่น SMART LOCK - PHUKET (โครงการ Kata Bello จำนวน 760 Units)">
              <TextInput value={jobName} disabled={locked}
                         onChange={(e) => setJobName(e.target.value)} />
            </Field>

            {ar && (
              <Field label="ประเภทงาน" required hint="ส่งอย่างเดียวไม่ต้องเปิดโปรเจกต์">
                <Select value={fulfilment} disabled={locked}
                        onChange={(e) => setFulfilment(e.target.value as 'install' | 'delivery')}>
                  <option value="install">ติดตั้ง</option>
                  <option value="delivery">ส่งอย่างเดียว</option>
                </Select>
              </Field>
            )}

            {sourceType && (
              <Field
                label={`อ้างอิง${sourceType === 'QT' ? 'ใบเสนอราคา' : 'ใบแจ้งหนี้'}`}
                className="md:col-span-2"
                hint={sourceType === 'QT'
                  ? 'เลือกแล้วดึงลูกค้า รายการ และยอดมาให้ ออกได้ไม่เกินยอดคงเหลือ'
                  : 'ใบกำกับ/ใบเสร็จออกต่อจากใบแจ้งหนี้ที่วางไปแล้ว'}
              >
                <SourceRefPicker
                  sourceType={sourceType}
                  value={sourceRef}
                  remaining={sourceRemaining ?? undefined}
                  sourceTotal={sourceTotal ?? undefined}
                  disabled={locked}
                  onPick={(opt) => void applySource(opt.id)}
                  onClear={() => {
                    setSourceRef(null); setSourceTotal(null); setSourceRemaining(null);
                  }}
                />
              </Field>
            )}

            <Field label="ประเภทงาน (Tag)" required
                   hint="เพิ่มชนิดใหม่ได้ที่หน้าตั้งค่าบริษัท">
              <Select value={tagId} disabled={locked} onChange={(e) => setTagId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {tagsQ.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>

            <Field label={ar ? 'เลขที่ PO ของลูกค้า' : 'เลขที่ PO อ้างอิง'}
                   hint="พิมพ์บนเอกสาร และไหลตามไปใบแจ้งหนี้/ใบกำกับ">
              <TextInput value={customerPoNo} disabled={locked}
                         onChange={(e) => setCustomerPoNo(e.target.value)} />
            </Field>

            <Field label="ผู้ติดต่อ" required>
              <TextInput value={contactName} disabled={locked}
                         onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="เบอร์โทรผู้ติดต่อ" required>
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
              {/* ตั้งอัตราหัก ณ ที่จ่ายให้ทุกบรรทัดพร้อมกัน — ปรับรายบรรทัดได้ในตาราง */}
              <Field label="ตั้งหัก ณ ที่จ่ายทุกบรรทัด" className="w-52"
                     hint="สินค้าไม่ต้องหัก หักได้เฉพาะค่าบริการ">
                <Select
                  value=""
                  disabled={locked}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    if (Number.isNaN(r)) return;
                    setItems((prev) => prev.map((it) => ({
                      ...it,
                      // ตั้งอัตราให้เฉพาะบรรทัดบริการ ตามที่กฎหมายกำหนด
                      wht_rate: it.item_type === 'service' ? r : 0,
                    })));
                    setWhtRate(r);
                  }}
                >
                  <option value="">— เลือกเพื่อตั้งทั้งใบ —</option>
                  <option value="0">ไม่หัก ทุกบรรทัด</option>
                  <option value="3">หัก 3% เฉพาะบรรทัดบริการ</option>
                  <option value="1">หัก 1% เฉพาะบรรทัดบริการ (ค่าขนส่ง)</option>
                  <option value="5">หัก 5% เฉพาะบรรทัดบริการ (ค่าเช่า)</option>
                </Select>
              </Field>

              {/* แบ่งชำระอยู่คนละกลุ่มกับภาษี กันสับสน */}
              <div className="ml-auto rounded-xl border border-slate-200 dark:border-slate-700
                px-3 py-2">
                <div className="flex gap-3">
                  <Field label="แบ่งชำระ % ของยอดเอกสาร" className="w-44"
                         hint="ว่าง = เรียกเก็บเต็มจำนวน">
                    <NumberInput value={billingPercent} disabled={locked} placeholder="30"
                                 onChange={(e) => setBillingPercent(e.target.value)} />
                  </Field>
                  <Field label="ส่วนลดพิเศษท้ายบิล" className="w-44"
                         hint="หักจากยอดรวม หลังส่วนลดรายบรรทัด">
                    <div className="flex gap-1">
                      <NumberInput value={extraDiscValue} disabled={locked} placeholder="0"
                                   onChange={(e) => setExtraDiscValue(e.target.value)} />
                      <button
                        type="button" disabled={locked}
                        title="สลับระหว่างบาทและเปอร์เซ็นต์"
                        onClick={() => setExtraDiscType((t) => (t === 'amount' ? 'percent' : 'amount'))}
                        className="px-2 rounded-lg border border-slate-200 dark:border-slate-700
                          text-xs text-slate-500 hover:text-slate-900 shrink-0"
                      >
                        {extraDiscType === 'percent' ? '%' : '฿'}
                      </button>
                    </div>
                  </Field>
                </div>
              </div>
            </div>

            {/* การ์ดต่อบรรทัด แทนตารางที่ต้องเลื่อนแนวนอน
                overflow-x-auto ทำให้แกนตั้งกลายเป็น scroll ไปด้วยตามสเปก CSS
                ตัวเลือกที่เด้งจากช่องค้นหาจึงถูกตัดและต้องเลื่อนลงไปกด */}
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i}
                     className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-slate-400 pt-2 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      {/* ค้นหาสินค้าอยู่บนสุด — เป็นทางเข้าหลักของการเพิ่มรายการ */}
                      {!locked && (
                        <StockPicker
                          items={stockQ.data ?? []}
                          onPick={(sel) => patchItem(i, {
                            stock_item_id: sel.id,
                            description: `${sel.model_code}${sel.description ? `\n${sel.description}` : ''}`,
                            unit: sel.unit ?? 'ชิ้น',
                            unit_price: sel.sale_price ?? 0,
                          })}
                        />
                      )}
                      <TextArea
                        rows={2} value={it.description} disabled={locked}
                        className="mt-2"
                        placeholder={'รายละเอียด — บรรทัดแรกชื่อรุ่น บรรทัดถัดไปสเปกย่อย'}
                        onChange={(e) => patchItem(i, { description: e.target.value })}
                      />
                    </div>
                    <div className="text-right shrink-0 w-32 pt-1">
                      <div className="text-[11px] text-slate-400">มูลค่า</div>
                      <div className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                        {money(it.line_total)}
                      </div>
                    </div>
                    {!locked && items.length > 1 && (
                      <button onClick={() => setItems((p) => p.filter((_, x) => x !== i))}
                              title="ลบบรรทัดนี้"
                              className="text-slate-300 hover:text-rose-500 p-1 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2 pl-7">
                    <Field label="ประเภท" className="w-28">
                      <Select value={it.item_type} disabled={locked}
                              onChange={(e) => {
                                const t = e.target.value as 'goods' | 'service';
                                // ขายสินค้าไม่ต้องหัก ณ ที่จ่าย — เคลียร์ให้อัตโนมัติ
                                patchItem(i, t === 'goods' ? { item_type: t, wht_rate: 0 } : { item_type: t });
                              }}>
                        <option value="goods">สินค้า</option>
                        <option value="service">บริการ</option>
                      </Select>
                    </Field>
                    <Field label="ภาษี" className="w-28">
                      <Select value={it.vat_type} disabled={locked}
                              onChange={(e) => patchItem(i, { vat_type: e.target.value as VatType })}>
                        <option value="vat">VAT</option>
                        <option value="exempt">ยกเว้น</option>
                        <option value="zero">0%</option>
                      </Select>
                    </Field>
                    <Field label="จำนวน" className="w-24">
                      <NumberInput value={it.qty} disabled={locked} step="0.001"
                                   onChange={(e) => patchItem(i, { qty: Number(e.target.value) })} />
                    </Field>
                    <Field label="หน่วย" className="w-24">
                      <TextInput value={it.unit ?? ''} disabled={locked}
                                 onChange={(e) => patchItem(i, { unit: e.target.value })} />
                    </Field>
                    <Field label="ราคา/หน่วย" className="w-32">
                      <NumberInput value={it.unit_price} disabled={locked} step="0.01"
                                   onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })} />
                    </Field>
                    <Field label="ส่วนลด" className="w-44">
                      <div className="flex gap-1">
                        <NumberInput
                          className="!px-2"
                          value={it.discount_input ?? 0}
                          disabled={locked} step="0.01"
                          onChange={(e) => patchItem(i, { discount_input: Number(e.target.value) })}
                        />
                        <button
                          type="button" disabled={locked}
                          title="สลับวิธีคิดส่วนลด: ต่อชิ้น → ทั้งบรรทัด → เปอร์เซ็นต์"
                          onClick={() => patchItem(i, {
                            discount_mode: DISCOUNT_NEXT[it.discount_mode ?? 'unit'],
                          })}
                          className="px-2 rounded-lg border border-slate-200 dark:border-slate-700
                            text-[11px] text-slate-500 hover:text-slate-900 shrink-0 whitespace-nowrap"
                        >
                          {DISCOUNT_LABEL[it.discount_mode ?? 'unit']}
                        </button>
                      </div>
                      {/* โชว์ยอดที่หักจริงเสมอ — ลดต่อชิ้นกับลดทั้งบรรทัดต่างกันมหาศาลเมื่อจำนวนเยอะ */}
                      {(it.discount_input ?? 0) !== 0 && (
                        <div className="text-[11px] text-slate-400 text-right mt-0.5 tabular-nums">
                          หักจริง −{money(lineDiscount(it))}
                        </div>
                      )}
                    </Field>
                    {/* ราคาสุทธิต่อหน่วย — ตัวเลขที่ใช้เทียบกับราคาที่ตกลงกับลูกค้าจริง */}
                    <Field label="ราคาสุทธิ/หน่วย" className="w-32">
                      <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60
                        text-sm text-right tabular-nums font-medium
                        text-slate-700 dark:text-slate-200">
                        {Number(it.qty) > 0 ? money(it.line_total / Number(it.qty)) : '—'}
                      </div>
                    </Field>
                    <Field label="หัก ณ ที่จ่าย" className="w-28">
                      <Select value={String(it.wht_rate ?? 0)} disabled={locked}
                              onChange={(e) => patchItem(i, { wht_rate: Number(e.target.value) })}>
                        <option value="0">ไม่หัก</option>
                        <option value="1">1%</option>
                        <option value="2">2%</option>
                        <option value="3">3%</option>
                        <option value="5">5%</option>
                      </Select>
                    </Field>
                  </div>
                </div>
              ))}
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
                {totals.extraDiscount > 0 && (
                  <Sum k="ส่วนลดพิเศษท้ายบิล" v={-totals.extraDiscount} />
                )}
                <Sum k="จำนวนเงินหลังหักส่วนลด" v={totals.afterDiscount} />
                <Sum k="มูลค่าที่ไม่มี/ยกเว้นภาษี" v={totals.vatExemptBase} />
                <Sum k="มูลค่าที่คำนวณภาษี" v={totals.vatBase} />
                <Sum k={`ภาษีมูลค่าเพิ่ม ${vatRate}%`} v={totals.vatAmount} />
                <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                  <Sum k="จำนวนเงินรวมทั้งสิ้น" v={totals.grandTotal} bold />
                </div>
                {totals.whtAmount > 0 && (
                  <>
                    <Sum k="หักภาษี ณ ที่จ่าย" v={-totals.whtAmount} />
                    {/* บอกที่มาให้ตรวจได้ — ไม่งั้นเห็นแต่ยอดสุทธิแล้วเช็คไม่ได้ว่าถูกไหม */}
                    <div className="text-[11px] text-slate-400 text-right -mt-1 mb-1">
                      คิดจากมูลค่าก่อน VAT {money(totals.whtBase)} ของบรรทัดที่ตั้งอัตราหักไว้
                      {items.filter((i) => Number(i.wht_rate) > 0).length > 0 && (
                        <> · {items.filter((i) => Number(i.wht_rate) > 0).length} จาก {items.length} บรรทัด</>
                      )}
                    </div>
                  </>
                )}
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

          {savedId && (isQt || status === 'cancelled') && (
            <div>
              <button onClick={() => void handleDelete()}
                      className="text-xs text-rose-500 hover:underline">
                {isQt ? 'ลบใบเสนอราคานี้' : 'ลบเอกสารที่ยกเลิกแล้วนี้'}
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
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={term}
        placeholder="ค้นหาสินค้าจากคลัง แล้วระบบจะเติมชื่อ หน่วย และราคาให้"
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`${inputCls} pl-9`}
      />
      {open && term.trim() && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-slate-800
          border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg
          max-h-64 overflow-y-auto">
          {matches.map((s) => (
            <button
              key={s.id} type="button"
              onMouseDown={() => { onPick(s); setTerm(''); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-xs
                hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{s.model_code}</span>
                <span className="text-slate-400 truncate">{s.description}</span>
                <span className="ml-auto tabular-nums text-slate-500 shrink-0">
                  {s.sale_price != null ? money(s.sale_price) : 'ยังไม่ตั้งราคา'}
                </span>
              </div>
            </button>
          ))}
          {matches.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">
              ไม่พบสินค้านี้ —{' '}
              <Link to="/stock" className="text-slate-900 hover:underline">
                ไปเพิ่มใน Inventory พร้อมตั้งราคาขาย
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

import { supabase } from '../lib/supabaseClient.js';
import { computeTotals, lineDiscount, lineTotal } from '@/accounting-lib/calc';
import type {
  ApDocType, ArDocType, ArDocument, Company, DocumentItem, PartySnapshot, Vendor,
} from '@/accounting-lib/types';

const AR_SELECT = `
  *,
  customer:customers(id, display_name, company_name, tax_id, branch_code, branch_name,
                     billing_address, address, phone),
  sales_user:users!ar_documents_sales_user_id_fkey(id, name),
  tag:document_tags(id, name, color),
  project:projects(id, project_number, product_category)
`;

export interface ArDocumentFull extends ArDocument {
  customer?: { id: string; display_name: string; company_name: string | null; tax_id: string | null;
              branch_code: string | null; branch_name: string | null;
              billing_address: string | null; address: string | null; phone: string | null } | null;
  sales_user?: { id: string; name: string } | null;
  project?: { id: string; project_number: string; product_category: string | null } | null;
  tag?: DocTag | null;
  items?: DocumentItem[];
}

export interface DocTag { id: string; name: string; color: string }

// ------------------------------------------------------------------ อ่าน

export async function listArDocuments(opts: {
  docType?: ArDocType; search?: string; status?: string; companyId?: string;
  tagId?: string; from?: string; to?: string; limit?: number;
} = {}): Promise<ArDocumentFull[]> {
  let q = supabase.from('ar_documents').select(AR_SELECT).order('doc_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (opts.docType) q = q.eq('doc_type', opts.docType);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.companyId) q = q.eq('company_id', opts.companyId);
  if (opts.tagId) q = q.eq('tag_id', opts.tagId);
  if (opts.from) q = q.gte('doc_date', opts.from);
  if (opts.to) q = q.lte('doc_date', opts.to);
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q.or(`doc_no.ilike.%${s}%,job_name.ilike.%${s}%`);
  }
  q = q.limit(opts.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ArDocumentFull[];
}

export async function getArDocument(id: string): Promise<ArDocumentFull> {
  const { data, error } = await supabase.from('ar_documents').select(AR_SELECT).eq('id', id).single();
  if (error) throw error;
  const { data: items, error: itemErr } = await supabase
    .from('ar_document_items').select('*').eq('document_id', id).order('line_no');
  if (itemErr) throw itemErr;
  return { ...(data as unknown as ArDocumentFull), items: (items ?? []) as DocumentItem[] };
}

// ------------------------------------------------------------- snapshot

export function companySnapshot(c: Company): PartySnapshot {
  return {
    name: c.name_th,
    branch_label: c.branch_code === '00000' ? 'สำนักงานใหญ่' : `สาขา ${c.branch_code ?? ''}`.trim(),
    tax_id: c.tax_id,
    address: c.address_th,
    phone: c.phone,
  };
}

export function customerSnapshotFrom(c: {
  display_name: string; company_name?: string | null; tax_id?: string | null;
  branch_code?: string | null; branch_name?: string | null;
  billing_address?: string | null; address?: string | null; phone?: string | null;
}): PartySnapshot {
  return {
    name: c.company_name?.trim() || c.display_name,
    branch_label: c.branch_name?.trim() || (c.branch_code === '00000' ? 'สำนักงานใหญ่' : null),
    tax_id: c.tax_id ?? null,
    address: c.billing_address?.trim() || c.address || null,
    phone: c.phone ?? null,
  };
}

// ----------------------------------------------------------------- เขียน

export interface SaveArInput {
  id?: string;
  company_id: string;
  doc_type: ArDocType;
  doc_date: string;
  due_date?: string | null;
  valid_until?: string | null;
  customer_id: string | null;
  project_id?: string | null;
  ticket_id?: string | null;
  job_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  sales_user_id?: string | null;
  fulfilment_type?: 'install' | 'delivery';
  tag_id?: string | null;
  price_include_vat: boolean;
  vat_rate: number;
  wht_rate: number;
  contract_total?: number | null;
  billing_percent?: number | null;
  note_text?: string | null;
  terms_text?: string | null;
  source_document_id?: string | null;
  items: DocumentItem[];
}

/**
 * บันทึกเอกสาร (ยังเป็นร่าง — ยังไม่กินเลขที่)
 * ยอดทั้งหมดคำนวณใหม่ฝั่งนี้เสมอ ไม่เชื่อตัวเลขที่ส่งมาจากหน้าจอ
 */
export async function saveArDocument(input: SaveArInput, userId: string): Promise<string> {
  const items = input.items
    .filter((i) => i.description.trim())
    .map((i, idx) => ({
      ...i, line_no: idx + 1,
      // แปลง % เป็นจำนวนเงินตอนบันทึก เพื่อให้เอกสารที่ออกไปแล้วยอดไม่ขยับ
      discount_amount: lineDiscount(i),
      line_total: lineTotal(i),
    }));

  const t = computeTotals(items, {
    priceIncludeVat: input.price_include_vat,
    vatRate: input.vat_rate,
    whtRate: input.wht_rate,
    billingPercent: input.billing_percent,
  });

  const header = {
    company_id: input.company_id,
    doc_type: input.doc_type,
    doc_date: input.doc_date,
    due_date: input.due_date || null,
    valid_until: input.valid_until || null,
    customer_id: input.customer_id,
    project_id: input.project_id || null,
    ticket_id: input.ticket_id || null,
    job_name: input.job_name || null,
    contact_name: input.contact_name || null,
    contact_phone: input.contact_phone || null,
    sales_user_id: input.sales_user_id || null,
    fulfilment_type: input.fulfilment_type ?? 'install',
    tag_id: input.tag_id || null,
    price_include_vat: input.price_include_vat,
    vat_rate: input.vat_rate,
    contract_total: input.contract_total ?? null,
    billing_percent: input.billing_percent ?? null,
    subtotal: t.subtotal,
    discount_total: t.discountTotal,
    vat_base: t.vatBase,
    vat_exempt_base: t.vatExemptBase,
    vat_amount: t.vatAmount,
    grand_total: t.grandTotal,
    wht_rate: input.wht_rate,
    wht_amount: t.whtAmount,
    net_payable: t.netPayable,
    note_text: input.note_text || null,
    terms_text: input.terms_text || null,
    source_document_id: input.source_document_id || null,
  };

  let docId = input.id;
  if (docId) {
    // กันเขียนทับข้ามใบ: เอกสารที่ออกเลขแล้วต้องนิ่ง และประเภทเอกสารเปลี่ยนไม่ได้
    // (เคยมีบั๊ก state ค้างจากหน้าจอทำให้ใบเสนอราคาถูกบันทึกทับเป็นใบกำกับ —
    // ชั้นนี้ทำให้ต่อให้หน้าจอพลาดอีก ข้อมูลก็ไม่พัง)
    const { data: existing, error: exErr } = await supabase
      .from('ar_documents').select('doc_no, doc_type').eq('id', docId).single();
    if (exErr) throw exErr;
    if (existing.doc_no) {
      throw new Error(`เอกสาร ${existing.doc_no} ออกเลขที่แล้ว แก้ไขไม่ได้ — ถ้าผิดต้องยกเลิกแล้วออกใบใหม่`);
    }
    if (existing.doc_type !== input.doc_type) {
      throw new Error('ประเภทเอกสารของใบเดิมเปลี่ยนไม่ได้ กรุณาสร้างเอกสารใหม่แทน');
    }
    const { doc_type: _omit, ...updateHeader } = header;
    const { error } = await supabase.from('ar_documents').update(updateHeader).eq('id', docId);
    if (error) throw error;
    const { error: delErr } = await supabase
      .from('ar_document_items').delete().eq('document_id', docId);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await supabase
      .from('ar_documents').insert({ ...header, created_by: userId }).select('id').single();
    if (error) throw error;
    docId = data.id as string;
  }

  if (items.length) {
    const rows = items.map((i) => ({
      document_id: docId,
      line_no: i.line_no,
      stock_item_id: i.stock_item_id || null,
      description: i.description,
      item_type: i.item_type,
      vat_type: i.vat_type,
      qty: i.qty,
      unit: i.unit || null,
      unit_price: i.unit_price,
      discount_amount: i.discount_amount,
      discount_percent: i.discount_percent ?? null,
      line_total: i.line_total,
    }));
    const { error } = await supabase.from('ar_document_items').insert(rows);
    if (error) throw error;
  }
  return docId!;
}

/**
 * ออกเอกสารจริง — จุดนี้เท่านั้นที่กินเลขที่
 * เลขได้จากฟังก์ชันฝั่งฐานข้อมูล จึงกันสองคนกดพร้อมกันได้
 * และแช่แข็ง snapshot ของบริษัทกับลูกค้าไว้ในตัวเอกสาร
 */
export async function issueArDocument(id: string): Promise<string> {
  const doc = await getArDocument(id);
  if (doc.doc_no) return doc.doc_no;

  const { data: company, error: cErr } = await supabase
    .from('companies').select('*').eq('id', doc.company_id).single();
  if (cErr) throw cErr;

  const { data: docNo, error: nErr } = await supabase.rpc('next_document_no', {
    p_company: doc.company_id,
    p_doc_type: doc.doc_type,
    p_prefix: doc.doc_type,
    p_date: doc.doc_date,
  });
  if (nErr) throw nErr;

  const { error } = await supabase.from('ar_documents').update({
    doc_no: docNo,
    status: doc.doc_type === 'QT' ? 'approved' : 'issued',
    company_snapshot: companySnapshot(company as Company),
    customer_snapshot: doc.customer ? customerSnapshotFrom(doc.customer) : null,
  }).eq('id', id);
  if (error) throw error;
  return docNo as string;
}

export async function setArStatus(id: string, status: string) {
  const { error } = await supabase.from('ar_documents').update({ status }).eq('id', id);
  if (error) throw error;
}

/** ยกเลิก — เก็บเลขที่ไว้เสมอ ห้ามลบและห้ามนำเลขกลับมาใช้ */
export async function cancelArDocument(id: string, reason: string) {
  const { error } = await supabase.from('ar_documents').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: reason,
  }).eq('id', id);
  if (error) throw error;
}

/** ลบได้เฉพาะร่างที่ยังไม่มีเลขที่ */
export async function deleteArDraft(id: string) {
  const { data, error: readErr } = await supabase
    .from('ar_documents').select('doc_no').eq('id', id).single();
  if (readErr) throw readErr;
  if (data?.doc_no) throw new Error('เอกสารที่ออกเลขที่แล้วลบไม่ได้ ให้ใช้การยกเลิกแทน');
  const { error } = await supabase.from('ar_documents').delete().eq('id', id);
  if (error) throw error;
}

/** แปลงเอกสาร: ยกหัวและรายการทั้งชุดไปเป็นเอกสารใหม่ พร้อมผูกสายอ้างอิง */
export async function convertArDocument(
  sourceId: string, targetType: ArDocType, userId: string
): Promise<string> {
  const src = await getArDocument(sourceId);
  return saveArDocument({
    company_id: src.company_id,
    doc_type: targetType,
    doc_date: new Date().toISOString().slice(0, 10),
    customer_id: src.customer_id,
    project_id: src.project_id,
    ticket_id: src.ticket_id,
    job_name: src.job_name,
    contact_name: src.contact_name,
    contact_phone: src.contact_phone,
    sales_user_id: src.sales_user_id,
    fulfilment_type: src.fulfilment_type,
    tag_id: src.tag_id,
    price_include_vat: src.price_include_vat,
    vat_rate: src.vat_rate,
    wht_rate: src.wht_rate,
    contract_total: src.grand_total,
    note_text: src.note_text,
    terms_text: src.terms_text,
    source_document_id: src.id,
    items: src.items ?? [],
  }, userId);
}

// ================================================================= ฝั่งซื้อ

const AP_SELECT = `*, vendor:vendors(*), tag:document_tags(id, name, color),
  project:projects(id, project_number, product_category)`;

export interface ApDocumentFull {
  id: string; company_id: string; doc_type: ApDocType; doc_no: string | null;
  doc_date: string; due_date: string | null; expected_date: string | null; status: string;
  source_document_id: string | null;
  vendor_id: string | null; vendor_snapshot: PartySnapshot | null; company_snapshot: PartySnapshot | null;
  project_id: string | null; job_name: string | null; ship_to: string | null;
  tag_id: string | null;
  contact_name: string | null; contact_phone: string | null;
  price_include_vat: boolean; vat_rate: number;
  subtotal: number; discount_total: number; vat_base: number; vat_exempt_base: number;
  vat_amount: number; grand_total: number; wht_rate: number; wht_amount: number; net_payable: number;
  tax_invoice_received: boolean; receipt_received: boolean; vendor_doc_no: string | null;
  note_text: string | null; terms_text: string | null;
  purchase_request_id: string | null; created_at: string;
  vendor?: Vendor | null;
  project?: { id: string; project_number: string; product_category: string | null } | null;
  tag?: DocTag | null;
  items?: DocumentItem[];
}

export async function listApDocuments(opts: {
  docType?: ApDocType; search?: string; tagId?: string; from?: string; to?: string; limit?: number;
} = {}) {
  let q = supabase.from('ap_documents').select(AP_SELECT)
    .order('doc_date', { ascending: false }).order('created_at', { ascending: false });
  if (opts.docType) q = q.eq('doc_type', opts.docType);
  if (opts.tagId) q = q.eq('tag_id', opts.tagId);
  if (opts.from) q = q.gte('doc_date', opts.from);
  if (opts.to) q = q.lte('doc_date', opts.to);
  if (opts.search?.trim()) q = q.or(`doc_no.ilike.%${opts.search.trim()}%,job_name.ilike.%${opts.search.trim()}%`);
  const { data, error } = await q.limit(opts.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as unknown as ApDocumentFull[];
}

export async function getApDocument(id: string): Promise<ApDocumentFull> {
  const { data, error } = await supabase.from('ap_documents').select(AP_SELECT).eq('id', id).single();
  if (error) throw error;
  const { data: items, error: itemErr } = await supabase
    .from('ap_document_items').select('*').eq('document_id', id).order('line_no');
  if (itemErr) throw itemErr;
  return { ...(data as unknown as ApDocumentFull), items: (items ?? []) as DocumentItem[] };
}

export interface SaveApInput {
  id?: string;
  company_id: string;
  doc_type: ApDocType;
  doc_date: string;
  due_date?: string | null;
  expected_date?: string | null;
  vendor_id: string | null;
  project_id?: string | null;
  purchase_request_id?: string | null;
  job_name?: string | null;
  ship_to?: string | null;
  tag_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  price_include_vat: boolean;
  vat_rate: number;
  wht_rate: number;
  note_text?: string | null;
  terms_text?: string | null;
  items: DocumentItem[];
}

export async function saveApDocument(input: SaveApInput, userId: string): Promise<string> {
  const items = input.items
    .filter((i) => i.description.trim())
    .map((i, idx) => ({
      ...i, line_no: idx + 1,
      discount_amount: lineDiscount(i),
      line_total: lineTotal(i),
    }));

  const t = computeTotals(items, {
    priceIncludeVat: input.price_include_vat,
    vatRate: input.vat_rate,
    whtRate: input.wht_rate,
  });

  const header = {
    company_id: input.company_id,
    doc_type: input.doc_type,
    doc_date: input.doc_date,
    due_date: input.due_date || null,
    expected_date: input.expected_date || null,
    vendor_id: input.vendor_id,
    project_id: input.project_id || null,
    purchase_request_id: input.purchase_request_id || null,
    job_name: input.job_name || null,
    ship_to: input.ship_to || null,
    tag_id: input.tag_id || null,
    contact_name: input.contact_name || null,
    contact_phone: input.contact_phone || null,
    price_include_vat: input.price_include_vat,
    vat_rate: input.vat_rate,
    subtotal: t.subtotal,
    discount_total: t.discountTotal,
    vat_base: t.vatBase,
    vat_exempt_base: t.vatExemptBase,
    vat_amount: t.vatAmount,
    grand_total: t.grandTotal,
    wht_rate: input.wht_rate,
    wht_amount: t.whtAmount,
    net_payable: t.netPayable,
    note_text: input.note_text || null,
    terms_text: input.terms_text || null,
  };

  let docId = input.id;
  if (docId) {
    const { data: existing, error: exErr } = await supabase
      .from('ap_documents').select('doc_no, doc_type').eq('id', docId).single();
    if (exErr) throw exErr;
    if (existing.doc_no) {
      throw new Error(`เอกสาร ${existing.doc_no} ออกเลขที่แล้ว แก้ไขไม่ได้ — ถ้าผิดต้องยกเลิกแล้วออกใบใหม่`);
    }
    if (existing.doc_type !== input.doc_type) {
      throw new Error('ประเภทเอกสารของใบเดิมเปลี่ยนไม่ได้ กรุณาสร้างเอกสารใหม่แทน');
    }
    const { doc_type: _omit, ...updateHeader } = header;
    const { error } = await supabase.from('ap_documents').update(updateHeader).eq('id', docId);
    if (error) throw error;
    const { error: delErr } = await supabase.from('ap_document_items').delete().eq('document_id', docId);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await supabase
      .from('ap_documents').insert({ ...header, created_by: userId }).select('id').single();
    if (error) throw error;
    docId = data.id as string;
  }

  if (items.length) {
    const rows = items.map((i) => ({
      document_id: docId, line_no: i.line_no, stock_item_id: i.stock_item_id || null,
      description: i.description, item_type: i.item_type, vat_type: i.vat_type,
      qty: i.qty, unit: i.unit || null, unit_price: i.unit_price,
      discount_amount: i.discount_amount, discount_percent: i.discount_percent ?? null,
      line_total: i.line_total,
    }));
    const { error } = await supabase.from('ap_document_items').insert(rows);
    if (error) throw error;
  }
  return docId!;
}

export async function issueApDocument(id: string): Promise<string> {
  const doc = await getApDocument(id);
  if (doc.doc_no) return doc.doc_no;

  const { data: company, error: cErr } = await supabase
    .from('companies').select('*').eq('id', doc.company_id).single();
  if (cErr) throw cErr;

  const { data: docNo, error: nErr } = await supabase.rpc('next_document_no', {
    p_company: doc.company_id, p_doc_type: doc.doc_type,
    p_prefix: doc.doc_type, p_date: doc.doc_date,
  });
  if (nErr) throw nErr;

  const v = doc.vendor;
  const { error } = await supabase.from('ap_documents').update({
    doc_no: docNo,
    status: 'ordered',
    company_snapshot: companySnapshot(company as Company),
    vendor_snapshot: v ? {
      name: v.display_name,
      branch_label: v.branch_name ?? null,
      tax_id: v.tax_id,
      address: v.address,
      phone: v.phone,
    } : null,
  }).eq('id', id);
  if (error) throw error;
  return docNo as string;
}

export async function setApStatus(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('ap_documents').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteApDraft(id: string) {
  const { data, error: readErr } = await supabase
    .from('ap_documents').select('doc_no').eq('id', id).single();
  if (readErr) throw readErr;
  if (data?.doc_no) throw new Error('เอกสารที่ออกเลขที่แล้วลบไม่ได้ ให้ใช้การยกเลิกแทน');
  const { error } = await supabase.from('ap_documents').delete().eq('id', id);
  if (error) throw error;
}


export interface ChildDoc {
  id: string; doc_type: string; doc_no: string | null; doc_date: string;
  status: string; grand_total: number;
}

/**
 * เอกสารที่แตกออกมาจากใบนี้ (ใบแจ้งหนี้/ใบกำกับที่อ้างใบเสนอราคา)
 * ใช้ตอบว่า "ใบเสนอราคานี้ออกบิลไปแล้วเท่าไร เหลือเท่าไร"
 */
export async function listChildDocuments(sourceId: string): Promise<ChildDoc[]> {
  const { data, error } = await supabase
    .from('ar_documents')
    .select('id, doc_type, doc_no, doc_date, status, grand_total')
    .eq('source_document_id', sourceId)
    .neq('status', 'cancelled')
    .order('doc_date');
  if (error) throw error;
  return (data ?? []) as ChildDoc[];
}

export async function listDocumentTags(): Promise<DocTag[]> {
  const { data, error } = await supabase
    .from('document_tags').select('id, name, color')
    .eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []) as DocTag[];
}

export async function saveDocumentTag(payload: { id?: string; name: string; color?: string }) {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('document_tags').update(rest).eq('id', id)
    : supabase.from('document_tags').insert(rest);
  const { error } = await q;
  if (error) throw error;
}


/** เลขที่ของเอกสารต้นทาง — ใช้แสดง "อ้างอิง" บนหน้าจอและบนเอกสารที่พิมพ์ */
export async function getDocNo(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ar_documents').select('doc_no').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.doc_no as string | null) ?? null;
}

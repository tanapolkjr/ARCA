/**
 * ใบส่งของ (0034) — ออกจากใบเสนอราคาที่อนุมัติแล้ว
 */
import { supabase } from '../lib/supabaseClient.js';
import type { Company, PartySnapshot } from '@/accounting-lib/types';
import { planDelivery, type DnPlanLine } from '@/accounting-lib/delivery';
import { companySnapshot, customerSnapshotFrom, getArDocument, type ArDocumentFull } from './documents';

export interface DeliveryNote {
  id: string; company_id: string; doc_no: string; doc_date: string; quotation_id: string;
  delivery_seq: number; status: 'issued' | 'cancelled';
  company_snapshot: PartySnapshot | null; customer_snapshot: PartySnapshot | null;
  job_name: string | null; ship_to_name: string | null; ship_to_address: string | null;
  receiver_name: string | null; receiver_phone: string | null;
  coordinator_name: string | null; coordinator_phone: string | null;
  ship_method: string | null; vehicle_no: string | null; tracking_no: string | null;
  package_count: string | null; note_text: string | null;
  sender_user_id?: string | null; sender_name?: string | null;
  cancelled_at: string | null; created_at: string;
  quotation?: { id: string; doc_no: string | null; customer_po_no?: string | null } | null;
  company?: { email: string | null } | null;
  items?: DeliveryNoteItem[];
}
export interface DeliveryNoteItem {
  id?: string; line_no: number; source_ar_item_id: string | null; stock_item_id: string | null;
  model_code: string | null; description: string; unit: string | null;
  qty_ordered: number; qty_delivered: number;
}

/** ใบส่งของทั้งหมดของใบเสนอราคา (รวมที่ยกเลิก) */
export async function listDeliveries(qtId: string): Promise<DeliveryNote[]> {
  const { data, error } = await supabase.from('delivery_notes')
    .select('*').eq('quotation_id', qtId).order('delivery_seq');
  if (error) throw error;
  return (data ?? []) as DeliveryNote[];
}

/** จำนวนที่ส่งไปแล้วต่อบรรทัดใบเสนอราคา (ไม่นับใบที่ยกเลิก) */
async function deliveredByLine(qtId: string): Promise<{ map: Map<string, number>; count: number }> {
  const { data: dns, error } = await supabase.from('delivery_notes')
    .select('id').eq('quotation_id', qtId).eq('status', 'issued');
  if (error) throw error;
  const ids = (dns ?? []).map((d) => d.id as string);
  const map = new Map<string, number>();
  if (ids.length) {
    const { data: rows, error: rErr } = await supabase.from('delivery_note_items')
      .select('source_ar_item_id, qty_delivered').in('delivery_id', ids);
    if (rErr) throw rErr;
    for (const r of rows ?? []) {
      if (!r.source_ar_item_id) continue;
      map.set(r.source_ar_item_id, (map.get(r.source_ar_item_id) ?? 0) + (Number(r.qty_delivered) || 0));
    }
  }
  return { map, count: ids.length };
}

export interface DeliveryDraft { qt: ArDocumentFull; plan: DnPlanLine[]; nextSeq: number }

export async function loadDeliveryDraft(qtId: string): Promise<DeliveryDraft> {
  const qt = await getArDocument(qtId);
  if (qt.doc_type !== 'QT' || qt.status === 'draft' || qt.status === 'cancelled') {
    throw new Error('ออกใบส่งของได้เฉพาะใบเสนอราคาที่อนุมัติแล้ว');
  }
  const stockIds = (qt.items ?? []).map((i) => i.stock_item_id).filter(Boolean) as string[];
  const codes = new Map<string, string>();
  const cats = new Map<string, string | null>();
  if (stockIds.length) {
    const { data } = await supabase.from('stock_items').select('id, model_code, category').in('id', stockIds);
    (data ?? []).forEach((s) => {
      codes.set(s.id as string, s.model_code as string);
      cats.set(s.id as string, (s.category as string | null) ?? null);
    });
  }
  const { map, count } = await deliveredByLine(qtId);
  const { count: allCount } = await supabase.from('delivery_notes')
    .select('id', { count: 'exact', head: true }).eq('quotation_id', qtId);
  const plan = planDelivery((qt.items ?? []).filter((i) => i.id).map((i) => ({
    id: i.id!, stock_item_id: i.stock_item_id,
    model_code: i.stock_item_id ? codes.get(i.stock_item_id) ?? null : null,
    description: i.description, unit: i.unit, qty: Number(i.qty) || 0,
    category: i.stock_item_id ? cats.get(i.stock_item_id) ?? null : null,
    item_type: i.item_type,
  })), map);
  void count;
  return { qt, plan, nextSeq: (allCount ?? 0) + 1 };
}

export interface CreateDeliveryInput {
  qtId: string; docDate: string;
  shipToName: string; shipToAddress: string; receiverName: string; receiverPhone: string;
  coordinatorName: string | null; coordinatorPhone: string | null;
  senderUserId: string; senderName: string; note: string;
  lines: { plan: DnPlanLine; qty: number }[];
}

export async function createDelivery(input: CreateDeliveryInput, userId: string): Promise<string> {
  // ตรวจยอดค้างสดจากฐานข้อมูลอีกรอบ — สองคนออกใบส่งของพร้อมกันต้องส่งเกินไม่ได้
  const fresh = await loadDeliveryDraft(input.qtId);
  const remain = new Map(fresh.plan.map((p) => [p.id, p.remaining]));
  for (const l of input.lines) {
    if (l.qty > (remain.get(l.plan.id) ?? 0) + 1e-9) {
      throw new Error(`ยอดค้างส่งเปลี่ยนไปแล้ว (${l.plan.model_code || l.plan.description.split('\n')[0]}) — ปิดแล้วเปิดใหม่`);
    }
  }
  const qt = fresh.qt;
  const { data: company, error: cErr } = await supabase
    .from('companies').select('*').eq('id', qt.company_id).single();
  if (cErr) throw cErr;

  const { data: docNo, error: nErr } = await supabase.rpc('next_document_no', {
    p_company: qt.company_id, p_doc_type: 'DO', p_prefix: 'DO', p_date: input.docDate,
  });
  if (nErr) throw nErr;

  const { data: hdr, error: hErr } = await supabase.from('delivery_notes').insert({
    company_id: qt.company_id, doc_no: docNo, doc_date: input.docDate, quotation_id: qt.id,
    delivery_seq: fresh.nextSeq,
    company_snapshot: companySnapshot(company as Company),
    customer_snapshot: qt.customer ? customerSnapshotFrom(qt.customer) : qt.customer_snapshot,
    job_name: qt.job_name,
    ship_to_name: input.shipToName || null, ship_to_address: input.shipToAddress || null,
    receiver_name: input.receiverName || null, receiver_phone: input.receiverPhone || null,
    coordinator_name: input.coordinatorName, coordinator_phone: input.coordinatorPhone,
    sender_user_id: input.senderUserId || null, sender_name: input.senderName || null,
    note_text: input.note || null, created_by: userId,
  }).select('id').single();
  if (hErr) throw hErr;

  const rows = input.lines.filter((l) => l.qty > 0).map((l, i) => ({
    delivery_id: hdr.id, line_no: i + 1, source_ar_item_id: l.plan.id, stock_item_id: l.plan.stock_item_id,
    model_code: l.plan.model_code, description: l.plan.description, unit: l.plan.unit,
    qty_ordered: l.plan.qty, qty_delivered: l.qty,
  }));
  const { error: iErr } = await supabase.from('delivery_note_items').insert(rows);
  if (iErr) {
    // ไม่ให้เหลือหัวใบลอย ๆ ที่ไม่มีรายการ
    await supabase.from('delivery_notes').delete().eq('id', hdr.id);
    throw iErr;
  }
  return hdr.id as string;
}

export async function getDelivery(id: string): Promise<DeliveryNote> {
  const { data, error } = await supabase.from('delivery_notes')
    .select('*, quotation:ar_documents(id, doc_no, customer_po_no), company:companies(email)').eq('id', id).single();
  if (error) throw error;
  const { data: items, error: iErr } = await supabase.from('delivery_note_items')
    .select('*').eq('delivery_id', id).order('line_no');
  if (iErr) throw iErr;
  return { ...(data as unknown as DeliveryNote), items: (items ?? []) as DeliveryNoteItem[] };
}

/**
 * ยอดค้างส่งที่พิมพ์บนใบ = ที่สั่ง − ที่ส่งไปแล้วถึงใบนี้ (รวมใบนี้)
 * นับเฉพาะใบที่ไม่ยกเลิก และออกก่อนหรือพร้อมใบนี้ — พิมพ์ซ้ำทีหลังตัวเลขต้องเหมือนเดิม
 */
export async function deliveredUpTo(dn: DeliveryNote): Promise<Map<string, number>> {
  const { data: dns, error } = await supabase.from('delivery_notes')
    .select('id, delivery_seq').eq('quotation_id', dn.quotation_id).eq('status', 'issued')
    .lte('delivery_seq', dn.delivery_seq);
  if (error) throw error;
  const ids = (dns ?? []).map((d) => d.id as string);
  if (dn.status === 'issued' && !ids.includes(dn.id)) ids.push(dn.id);
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data: rows, error: rErr } = await supabase.from('delivery_note_items')
    .select('source_ar_item_id, qty_delivered').in('delivery_id', ids);
  if (rErr) throw rErr;
  for (const r of rows ?? []) {
    if (!r.source_ar_item_id) continue;
    map.set(r.source_ar_item_id, (map.get(r.source_ar_item_id) ?? 0) + (Number(r.qty_delivered) || 0));
  }
  return map;
}

export async function cancelDelivery(id: string, reason: string) {
  const { error } = await supabase.from('delivery_notes').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: reason || null,
  }).eq('id', id);
  if (error) throw error;
}

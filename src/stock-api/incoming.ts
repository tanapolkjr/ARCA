import { supabase } from '../lib/supabaseClient.js';
import { receiveStock } from '../api/stock.js';

export type ShipmentStatus = 'in_transit' | 'partial' | 'received' | 'cancelled';

export interface ShipmentItem {
  id?: string;
  line_no: number;
  stock_item_id: string;
  qty_ordered: number;
  qty_received: number;
  note: string | null;
  stock_item?: { id: string; model_code: string; description: string | null } | null;
}

export interface Shipment {
  id: string;
  shipment_no: string | null;
  order_no: string | null;
  vendor_id: string | null;
  carrier: string | null;
  tracking_no: string | null;
  eta_date: string | null;
  arrived_date: string | null;
  status: ShipmentStatus;
  project_id: string | null;
  note: string | null;
  created_at: string;
  vendor?: { id: string; display_name: string } | null;
  project?: { id: string; project_number: string } | null;
  items?: ShipmentItem[];
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  in_transit: 'กำลังขนส่ง',
  partial: 'รับเข้าบางส่วน',
  received: 'รับเข้าครบแล้ว',
  cancelled: 'ยกเลิก',
};

const SELECT = `
  *,
  vendor:vendors(id, display_name),
  project:projects(id, project_number)
`;

const ITEM_SELECT = `
  *,
  stock_item:stock_items(id, model_code, description)
`;

// ------------------------------------------------------------------ อ่าน

export async function listShipments(opts: {
  status?: ShipmentStatus | '';
  search?: string;
} = {}): Promise<Shipment[]> {
  let q = supabase.from('incoming_shipments').select(SELECT)
    .order('eta_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q.or(`shipment_no.ilike.%${s}%,order_no.ilike.%${s}%,tracking_no.ilike.%${s}%,note.ilike.%${s}%`);
  }
  const { data, error } = await q.limit(300);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Shipment[];
  if (rows.length === 0) return rows;

  // ดึงรายการของทุกล็อตทีเดียว แทนที่จะยิงทีละใบ
  const { data: items, error: itemErr } = await supabase
    .from('incoming_shipment_items').select(ITEM_SELECT)
    .in('shipment_id', rows.map((r) => r.id)).order('line_no');
  if (itemErr) throw itemErr;

  const byShipment = new Map<string, ShipmentItem[]>();
  for (const it of (items ?? []) as unknown as (ShipmentItem & { shipment_id: string })[]) {
    const list = byShipment.get(it.shipment_id) ?? [];
    list.push(it);
    byShipment.set(it.shipment_id, list);
  }
  return rows.map((r) => ({ ...r, items: byShipment.get(r.id) ?? [] }));
}

export async function getShipment(id: string): Promise<Shipment> {
  const { data, error } = await supabase.from('incoming_shipments').select(SELECT).eq('id', id).single();
  if (error) throw error;
  const { data: items, error: itemErr } = await supabase
    .from('incoming_shipment_items').select(ITEM_SELECT).eq('shipment_id', id).order('line_no');
  if (itemErr) throw itemErr;
  return { ...(data as unknown as Shipment), items: (items ?? []) as unknown as ShipmentItem[] };
}

/** จำนวนที่กำลังเดินทางมาต่อสินค้า — ใช้แสดงคอลัมน์ "กำลังมา" ในหน้า Inventory */
export async function incomingQtyByItem(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('stock_incoming_qty').select('*');
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { stock_item_id: string; qty_incoming: number }[]) {
    out.set(r.stock_item_id, Number(r.qty_incoming) || 0);
  }
  return out;
}

// ----------------------------------------------------------------- เขียน

export interface SaveShipmentInput {
  id?: string;
  order_no: string | null;
  vendor_id: string | null;
  carrier: string | null;
  tracking_no: string | null;
  eta_date: string | null;
  project_id: string | null;
  note: string | null;
  items: { id?: string; stock_item_id: string; qty_ordered: number; note: string | null }[];
}

export async function saveShipment(input: SaveShipmentInput, userId: string): Promise<string> {
  const lines = input.items.filter((i) => i.stock_item_id && Number(i.qty_ordered) > 0);
  if (lines.length === 0) throw new Error('ใส่รายการสินค้าอย่างน้อย 1 บรรทัด');

  // สินค้าซ้ำในล็อตเดียวกันทำให้ยอด "กำลังมา" อ่านยากและรับเข้าสับสน
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.stock_item_id)) {
      throw new Error('มีสินค้าซ้ำกันในล็อตนี้ — รวมเป็นบรรทัดเดียวแล้วใส่จำนวนรวม');
    }
    seen.add(l.stock_item_id);
  }

  const header = {
    order_no: input.order_no || null,
    vendor_id: input.vendor_id || null,
    carrier: input.carrier || null,
    tracking_no: input.tracking_no || null,
    eta_date: input.eta_date || null,
    project_id: input.project_id || null,
    note: input.note || null,
  };

  let shipmentId = input.id;
  if (shipmentId) {
    const { data: existing, error: exErr } = await supabase
      .from('incoming_shipments').select('status').eq('id', shipmentId).single();
    if (exErr) throw exErr;
    if (existing.status === 'cancelled') throw new Error('ล็อตนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
    if (existing.status !== 'in_transit') {
      throw new Error('ล็อตนี้เริ่มรับของเข้าคลังแล้ว แก้รายการไม่ได้ — ถ้าผิดต้องยกเลิกแล้วสร้างใหม่');
    }
    const { error } = await supabase.from('incoming_shipments').update(header).eq('id', shipmentId);
    if (error) throw error;
    const { error: delErr } = await supabase
      .from('incoming_shipment_items').delete().eq('shipment_id', shipmentId);
    if (delErr) throw delErr;
  } else {
    const { data: no, error: noErr } = await supabase.rpc('next_shipment_no', {
      p_date: new Date().toISOString().slice(0, 10),
    });
    if (noErr) throw noErr;
    const { data, error } = await supabase
      .from('incoming_shipments')
      .insert({ ...header, shipment_no: no, created_by: userId })
      .select('id').single();
    if (error) throw error;
    shipmentId = data.id as string;
  }

  const { error: insErr } = await supabase.from('incoming_shipment_items').insert(
    lines.map((l, idx) => ({
      shipment_id: shipmentId,
      line_no: idx + 1,
      stock_item_id: l.stock_item_id,
      qty_ordered: Number(l.qty_ordered),
      note: l.note || null,
    }))
  );
  if (insErr) throw insErr;
  return shipmentId!;
}

/** ยกเลิกล็อต — ทำได้เฉพาะตอนที่ยังไม่มีของเข้าคลังเลย */
export async function cancelShipment(id: string, reason: string) {
  const { data: items, error: readErr } = await supabase
    .from('incoming_shipment_items').select('qty_received').eq('shipment_id', id);
  if (readErr) throw readErr;
  const received = (items ?? []).reduce((a, i) => a + (Number(i.qty_received) || 0), 0);
  if (received > 0) {
    throw new Error(
      'ล็อตนี้รับของเข้าคลังไปแล้วบางส่วน ยกเลิกไม่ได้ — ' +
      'ของที่เข้าคลังแล้วต้องจัดการผ่านการปรับยอดสต็อกแทน'
    );
  }
  const { error } = await supabase.from('incoming_shipments').update({
    status: 'cancelled',
    note: reason ? `[ยกเลิก] ${reason}` : undefined,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteShipment(id: string) {
  const { data: s, error: readErr } = await supabase
    .from('incoming_shipments').select('status').eq('id', id).single();
  if (readErr) throw readErr;
  if (s.status !== 'cancelled' && s.status !== 'in_transit') {
    throw new Error('ลบได้เฉพาะล็อตที่ยังไม่รับของ หรือล็อตที่ยกเลิกแล้ว');
  }
  const { error } = await supabase.from('incoming_shipments').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------- รับเข้าคลัง

export interface ReceiveLineInput {
  shipmentId: string;
  lineId: string;
  locationId: string;
  /** serial ที่ยิงบาร์โค้ดมา — ว่างได้ถ้าสินค้าไม่ต้องยิง */
  serials: string[];
  /** ใช้เมื่อไม่มี serial */
  qty: number;
}

/**
 * รับของจากล็อตเข้าคลัง
 *
 * ใช้ `receiveStock()` ตัวเดิมทั้งหมด ต่างกันแค่ระบุที่มาเป็น 'incoming_shipment'
 * จึงได้ stock_transactions และ stock_balances แบบเดียวกับการรับเข้าปกติเป๊ะ
 */
export async function receiveShipmentLine(input: ReceiveLineInput, userId: string) {
  const serials = input.serials.map((s) => s.trim()).filter(Boolean);
  const qty = serials.length || Number(input.qty) || 0;
  if (qty <= 0) throw new Error('ใส่จำนวนที่รับเข้า หรือยิงบาร์โค้ดอย่างน้อย 1 ชิ้น');
  if (!input.locationId) throw new Error('เลือกคลังปลายทางก่อน');

  const { data: line, error: lineErr } = await supabase
    .from('incoming_shipment_items')
    .select('id, stock_item_id, qty_ordered, qty_received, shipment:incoming_shipments(status)')
    .eq('id', input.lineId).single();
  if (lineErr) throw lineErr;

  const status = (line as unknown as { shipment: { status: string } | null }).shipment?.status;
  if (status === 'cancelled') throw new Error('ล็อตนี้ถูกยกเลิกแล้ว รับของไม่ได้');

  const outstanding = (Number(line.qty_ordered) || 0) - (Number(line.qty_received) || 0);
  if (qty > outstanding + 0.001) {
    throw new Error(
      `รับเข้า ${qty} เกินจำนวนที่ยังไม่ได้รับ (${outstanding}) — ` +
      'ถ้าของมาเกินจริง ให้แก้จำนวนในล็อตหรือรับเข้าคลังเป็นรอบแยก'
    );
  }

  // ยิงบาร์โค้ดซ้ำเป็นความผิดพลาดที่แพง เพราะยอดสต็อกจะเกินของจริง
  if (serials.length) {
    const dupInBatch = serials.find((s, i) => serials.indexOf(s) !== i);
    if (dupInBatch) throw new Error(`ยิงซ้ำในรอบนี้: ${dupInBatch}`);

    const { data: existing, error: dupErr } = await supabase
      .from('stock_transactions')
      .select('serial_no')
      .eq('transaction_type', 'receive_in')
      .in('serial_no', serials)
      .limit(5);
    if (dupErr) throw dupErr;
    if (existing?.length) {
      throw new Error(
        `serial นี้เคยรับเข้าคลังไปแล้ว: ${existing.map((e) => e.serial_no).join(', ')}`
      );
    }
  }

  await receiveStock({
    stockItemId: line.stock_item_id,
    locationId: input.locationId,
    serials,
    qty,
    createdBy: userId,
    referenceType: 'incoming_shipment',
    referenceId: input.shipmentId,
    note: 'รับจากล็อตขนส่ง',
    roundNo: null,
    purchaseRequestId: null,
  });

  // trigger คำนวณสถานะล็อตใหม่ให้เองหลังอัปเดตบรรทัด
  const { error: upErr } = await supabase
    .from('incoming_shipment_items')
    .update({ qty_received: (Number(line.qty_received) || 0) + qty })
    .eq('id', input.lineId);
  if (upErr) throw upErr;

  return { qty };
}

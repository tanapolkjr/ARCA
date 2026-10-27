/**
 * ใบส่งของ — คำนวณยอดสั่ง / ส่งแล้ว / ค้างส่ง ต่อบรรทัดใบเสนอราคา (สูตรล้วน)
 */
export interface DnSourceLine {
  id: string; stock_item_id: string | null; model_code: string | null;
  description: string; unit: string | null; qty: number;
  /** ประเภทสินค้าในคลัง (stock_items.category) — ใช้ตัดสินว่าต้องออกใบส่งของไหม */
  category?: string | null;
  /** สินค้า / บริการ จากบรรทัดใบเสนอราคา */
  item_type?: string | null;
}

/**
 * ประเภทที่ไม่ใช่ของที่ต้องส่ง — ไม่ติ๊กให้ตั้งแต่ต้น (ผู้ใช้ติ๊กเพิ่มเองได้)
 * ยึดประเภทสินค้าในคลังเป็นหลัก · บรรทัดที่พิมพ์เอง (ไม่ผูกคลัง) ดูจากประเภท "บริการ" ของบรรทัด
 */
export const NON_DELIVERY_CATEGORIES = ['บริการ', 'งานติดตั้ง', 'ค่าติดตั้ง', 'service', 'installation'];

export function defaultInclude(l: Pick<DnSourceLine, 'category' | 'item_type'>): boolean {
  const cat = (l.category ?? '').trim().toLowerCase();
  if (cat && NON_DELIVERY_CATEGORIES.some((c) => cat === c.toLowerCase())) return false;
  if (l.item_type === 'service') return false;
  return true;
}

/** รวมจำนวนแยกตามหน่วย เช่น "344 ชิ้น · 4 ชุด" — ข้ามบรรทัดที่จำนวนเป็น 0 */
export function totalsByUnit(rows: { unit: string | null; qty: number }[]): { unit: string; qty: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const q = Number(r.qty) || 0;
    if (q <= 0) continue;
    const u = (r.unit ?? '').trim() || 'หน่วย';
    m.set(u, Math.round(((m.get(u) ?? 0) + q) * 1000) / 1000);
  }
  return [...m.entries()].map(([unit, qty]) => ({ unit, qty }));
}
export interface DnPlanLine extends DnSourceLine {
  /** ส่งไปแล้วในใบส่งของก่อนหน้า (ไม่นับใบที่ยกเลิก) */
  delivered: number;
  remaining: number;
}

const q3 = (n: number) => Math.round(n * 1000) / 1000;

export function planDelivery(lines: DnSourceLine[], delivered: Map<string, number>): DnPlanLine[] {
  return lines.map((l) => {
    const d = q3(delivered.get(l.id) ?? 0);
    return { ...l, delivered: d, remaining: Math.max(0, q3((Number(l.qty) || 0) - d)) };
  });
}

/** ตรวจก่อนบันทึก: ต้องมีอย่างน้อย 1 บรรทัด และห้ามส่งเกินที่ค้าง */
export function validateDelivery(plan: DnPlanLine[], qtyNow: Map<string, number>): string | null {
  const picked = plan.filter((l) => (qtyNow.get(l.id) ?? 0) > 0);
  if (picked.length === 0) return 'ยังไม่ได้ใส่จำนวนที่ส่งครั้งนี้';
  const over = picked.filter((l) => (qtyNow.get(l.id) ?? 0) > l.remaining + 1e-9);
  if (over.length) {
    return `ส่งเกินจำนวนที่ค้างส่ง: ${over.map((l) => (l.model_code || l.description.split('\n')[0])).join(', ')}`;
  }
  return null;
}

/**
 * ใบส่งของ — คำนวณยอดสั่ง / ส่งแล้ว / ค้างส่ง ต่อบรรทัดใบเสนอราคา (สูตรล้วน)
 */
export interface DnSourceLine {
  id: string; stock_item_id: string | null; model_code: string | null;
  description: string; unit: string | null; qty: number;
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

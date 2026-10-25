/**
 * ใบสั่งซื้อจากใบเสนอราคา + การกระจายยอดก่อน VAT ลงรายบรรทัด
 *
 * ปัญหาที่ต้องระวัง (หลักบัญชี):
 *  - ใบเสนอราคาแบบ "ราคารวม VAT" — line_total ของบรรทัดที่มี VAT รวม VAT อยู่ แต่บรรทัด
 *    ยกเว้น VAT ไม่รวม → ถอด VAT เฉพาะบรรทัดที่มี VAT ก่อน แล้วค่อยเทียบสัดส่วน
 *  - ส่วนลดท้ายบิล / แบ่งชำระ % — ไม่ได้อยู่ในบรรทัด → กระจายให้ทุกบรรทัดตามสัดส่วน
 *    ผลรวมทุกบรรทัดจึงเท่ากับยอดก่อน VAT ของทั้งใบพอดี (ไม่มีเศษหาย)
 */
import type { DocumentItem } from './types';

export interface QtLine {
  id?: string;
  stock_item_id: string | null;
  description: string;
  item_type: DocumentItem['item_type'];
  vat_type: DocumentItem['vat_type'];
  qty: number;
  unit: string | null;
  line_total: number;
}

/** ยอดก่อน VAT ของแต่ละบรรทัด ปรับให้รวมกันได้เท่ายอดก่อน VAT ของทั้งใบ (docExVat) */
export function allocateExVat(
  lines: Pick<QtLine, 'vat_type' | 'line_total'>[], includeVat: boolean, vatRate: number, docExVat: number,
): number[] {
  const f = 1 + (Number(vatRate) || 0) / 100;
  const raw = lines.map((l) => {
    const v = Number(l.line_total) || 0;
    return includeVat && l.vat_type === 'vat' ? v / f : v;
  });
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return lines.map(() => 0);
  return raw.map((v) => (docExVat * v) / sum);
}

/**
 * สร้างบรรทัด PO จากใบเสนอราคา
 * - จำนวน = ที่ขาย − ที่สั่งไปแล้วใน PO อื่น (บรรทัดที่สั่งครบแล้วไม่ดึงมา)
 * - ราคาซื้อเริ่มที่ 0 ให้กรอกเอง · ราคาขายต่อหน่วยเก็บไว้ดูกำไร
 */
export function buildPoLines(
  qt: { price_include_vat: boolean; vat_rate: number; ex_vat_total: number },
  lines: QtLine[],
  orderedQty: Map<string, number>,
): DocumentItem[] {
  const shares = allocateExVat(lines, qt.price_include_vat, qt.vat_rate, qt.ex_vat_total);
  const out: DocumentItem[] = [];
  lines.forEach((l, i) => {
    const sold = Number(l.qty) || 0;
    const already = l.id ? orderedQty.get(l.id) ?? 0 : 0;
    const remain = Math.max(0, Math.round((sold - already) * 1000) / 1000);
    if (sold > 0 && remain <= 0) return;
    out.push({
      line_no: out.length + 1,
      stock_item_id: l.stock_item_id,
      description: l.description,
      item_type: l.item_type,
      vat_type: l.vat_type,
      qty: sold > 0 ? remain : 1,
      unit: l.unit,
      unit_price: 0,
      discount_amount: 0,
      discount_mode: 'unit',
      discount_input: 0,
      wht_rate: 0,
      line_total: 0,
      group_id: null,
      ref_sell_price: sold > 0 ? Math.round((shares[i] / sold) * 10000) / 10000 : shares[i],
      source_ar_item_id: l.id ?? null,
    });
  });
  return out;
}

/**
 * สลับ "ราคาไม่รวม VAT" ⇄ "ราคารวม VAT" ในหน้าแก้เอกสาร
 *
 * หลักการ: ทุกบรรทัดจำ "ราคาฐาน" (ไม่รวม VAT) ไว้เสมอ แล้วคำนวณราคาที่แสดงจากราคาฐานทุกครั้ง
 *
 *   ไม่รวม VAT  →  ราคาที่แสดง = ราคาฐาน
 *   รวม VAT     →  ราคาที่แสดง = ราคาฐาน × (1 + VAT%)        เช่น 1,000 → 1,070
 *
 * สลับไปมากี่รอบก็ไม่บวก VAT ซ้ำ เพราะไม่เคยคิดต่อจากราคาที่แสดงอยู่ คิดจากราคาฐานเท่านั้น
 *
 * - บรรทัดยกเว้น VAT / VAT 0% ไม่บวก VAT (ราคาเท่าเดิมทั้งสองโหมด)
 * - ส่วนลดแบบ "บาท/ชิ้น" และ "บาททั้งบรรทัด" ปรับตามด้วย (ส่วนลด % ไม่ต้องปรับ)
 * - ราคาฐานอยู่ในหน้าจอเท่านั้น ไม่ได้บันทึกเป็นคอลัมน์ — เปิดเอกสารที่บันทึกไว้แบบ
 *   "รวม VAT" ระบบถอดกลับเป็นราคาฐานให้เอง (ราคาสองตำแหน่งทศนิยมถอดกลับได้ตรงเป๊ะ)
 */
import { lineDiscount, lineTotal, round2 } from './calc';
import type { DocumentItem } from './types';

const factor = (rate: number) => 1 + (Number(rate) || 0) / 100;
const hasVat = (it: Pick<DocumentItem, 'vat_type'>) => it.vat_type === 'vat';
const amountDiscount = (it: Pick<DocumentItem, 'discount_mode'>) =>
  it.discount_mode === 'unit' || it.discount_mode === 'line';

/** คำนวณยอดบรรทัดใหม่หลังราคาเปลี่ยน */
function refresh(it: DocumentItem): DocumentItem {
  return { ...it, discount_amount: lineDiscount(it), line_total: lineTotal(it) };
}

/** ราคาที่ควรแสดงจากราคาฐาน ตามโหมดปัจจุบัน */
function display(base: number, it: DocumentItem, includeVat: boolean, rate: number) {
  return includeVat && hasVat(it) ? round2(base * factor(rate)) : round2(base);
}

/**
 * ใส่ราคาฐานให้บรรทัดที่เพิ่งโหลดมา (จากฐานข้อมูล หรือดึงจากใบต้นทาง)
 * ราคาในฐานข้อมูลเป็นราคาตามโหมดที่บันทึกไว้ → ถอดกลับเป็นราคาไม่รวม VAT
 */
export function withBasePrices(items: DocumentItem[], includeVat: boolean, rate: number): DocumentItem[] {
  return items.map((it) => {
    const strip = includeVat && hasVat(it);
    const unbase = (v: number) => (strip ? round2(v / factor(rate)) : Number(v) || 0);
    return {
      ...it,
      base_unit_price: unbase(Number(it.unit_price) || 0),
      base_discount_input: amountDiscount(it) ? unbase(Number(it.discount_input) || 0) : undefined,
    };
  });
}

/** คำนวณราคาที่แสดงใหม่ทุกบรรทัด — ใช้ตอนสลับโหมด VAT หรือเปลี่ยนอัตรา VAT */
export function applyVatMode(items: DocumentItem[], includeVat: boolean, rate: number): DocumentItem[] {
  return items.map((it) => {
    const base = it.base_unit_price ?? (Number(it.unit_price) || 0);
    const next: DocumentItem = { ...it, base_unit_price: base, unit_price: display(base, it, includeVat, rate) };
    if (amountDiscount(it)) {
      const dBase = it.base_discount_input ?? (Number(it.discount_input) || 0);
      next.base_discount_input = dBase;
      next.discount_input = display(dBase, it, includeVat, rate);
    }
    return refresh(next);
  });
}

/**
 * แก้บรรทัดเดียวจากหน้าจอ แล้วรักษาราคาฐานให้ถูก
 *
 * - กรอกราคาในโหมด "ไม่รวม VAT" → ตัวเลขที่กรอกคือราคาฐาน
 * - กรอกราคาในโหมด "รวม VAT" → ตัวเลขที่กรอกคือราคารวม VAT, ราคาฐาน = ที่กรอก ÷ 1.07
 *   (เก็บไม่ปัดเศษ เพื่อให้สลับกลับมาแล้วได้ตัวเลขที่กรอกเดิม)
 * - เปลี่ยนประเภทภาษีของบรรทัด / เปลี่ยนโหมดส่วนลด → คำนวณราคาที่แสดงใหม่จากราคาฐาน
 */
export function patchItemVat(
  it: DocumentItem, patch: Partial<DocumentItem>, includeVat: boolean, rate: number,
): DocumentItem {
  let next: DocumentItem = { ...it, ...patch };
  const f = includeVat && hasVat(next) ? factor(rate) : 1;

  if ('base_unit_price' in patch) {
    // ราคาจากคลังสินค้า (ราคาขายตั้งไว้แบบไม่รวม VAT) → เป็นราคาฐานโดยตรง
    [next] = applyVatMode([next], includeVat, rate);
    return next;
  }
  if ('unit_price' in patch) {
    next.base_unit_price = (Number(patch.unit_price) || 0) / f;
  }
  if ('discount_input' in patch && amountDiscount(next)) {
    next.base_discount_input = (Number(patch.discount_input) || 0) / f;
  }
  if ('discount_mode' in patch) {
    // สลับไปเป็น % — ตัวเลขที่กรอกไม่ใช่เงิน ไม่ต้องมีฐาน · สลับมาเป็นบาท — ใช้ตัวเลขที่เห็นเป็นฐาน
    next.base_discount_input = amountDiscount(next) ? (Number(next.discount_input) || 0) / f : undefined;
  }
  if ('vat_type' in patch && !('unit_price' in patch)) {
    // ประเภทภาษีเปลี่ยน ราคาฐานคงเดิม ราคาที่แสดงขยับตาม
    [next] = applyVatMode([next], includeVat, rate);
    return next;
  }
  return refresh(next);
}

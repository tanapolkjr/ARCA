import type { DocumentItem, VatType } from './types';

/**
 * ตัวเลขเงินทั้งหมดในโมดูลนี้ปัดที่ 2 ตำแหน่ง "ตอนสรุปยอด" เท่านั้น
 * ไม่ปัดทีละบรรทัดระหว่างทาง เพราะจะทำให้ยอดรวมเพี้ยนจากที่ลูกค้าเห็น
 */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** ยอดก่อนหักส่วนลดของบรรทัด */
export const lineGross = (item: Pick<DocumentItem, 'qty' | 'unit_price'>): number =>
  (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

/**
 * ส่วนลดที่หักจริงของบรรทัด
 * ถ้ากรอกเป็น % ให้คิดจากยอดก่อนหักส่วนลดของบรรทัดนั้น
 * ลดได้ไม่เกินมูลค่าบรรทัด (ค่าติดตั้งฟรี = ลด 100% เหลือ 0)
 */
export function lineDiscount(
  item: Pick<DocumentItem, 'qty' | 'unit_price' | 'discount_amount' | 'discount_percent'>
): number {
  const gross = lineGross(item);
  const pct = item.discount_percent;
  const raw = pct != null && pct !== 0
    ? (gross * Number(pct)) / 100
    : Number(item.discount_amount) || 0;
  return round2(Math.min(Math.max(0, raw), gross));
}

/** มูลค่าสุทธิของบรรทัด = จำนวน × ราคา − ส่วนลด (ไม่ต่ำกว่า 0) */
export function lineTotal(
  item: Pick<DocumentItem, 'qty' | 'unit_price' | 'discount_amount' | 'discount_percent'>
): number {
  return round2(Math.max(0, lineGross(item) - lineDiscount(item)));
}

export interface DocumentTotals {
  /** ผลรวมก่อนหักส่วนลด */
  subtotal: number;
  discountTotal: number;
  /** ส่วนลดพิเศษท้ายบิล (จำนวนเงินที่หักจริง) */
  extraDiscount: number;
  /** ยอดหลังหักส่วนลดรายบรรทัดและส่วนลดพิเศษ */
  afterDiscount: number;
  /** ฐานที่คำนวณภาษี (ไม่รวม VAT เสมอ) */
  vatBase: number;
  /** มูลค่าที่ไม่มี/ยกเว้นภาษี */
  vatExemptBase: number;
  vatAmount: number;
  grandTotal: number;
  /** ฐานที่ใช้คิดหัก ณ ที่จ่าย (มูลค่าก่อน VAT ของเฉพาะบรรทัดที่ตั้งอัตราไว้) */
  whtBase: number;
  whtAmount: number;
  netPayable: number;
}

/**
 * สรุปยอดเอกสาร รองรับสองโหมดที่ใช้จริงทั้งคู่:
 *
 *  priceIncludeVat = true   ราคาที่กรอกรวม VAT แล้ว
 *      ฐานภาษี = ยอดรวม ÷ 1.07 · VAT = ส่วนต่าง · ยอดรวมทั้งสิ้น = ยอดที่กรอก
 *      ตัวอย่างจริง: 12,000 → ฐาน 11,214.95 + VAT 785.05
 *
 *  priceIncludeVat = false  ราคายังไม่รวม VAT
 *      VAT บวกเพิ่มจากฐาน · ยอดรวมทั้งสิ้น = ฐาน + VAT
 *      ตัวอย่างจริง: 128,372 → +7% = 137,358.04
 *
 * บรรทัดที่ vat_type เป็น exempt/zero ไม่เข้าฐานภาษีทั้งสองโหมด
 *
 * whtRate คิดจาก "ฐานที่คำนวณภาษี" (มูลค่าก่อน VAT) ตามหลักการหักภาษี ณ ที่จ่าย
 * ซึ่งหักจากมูลค่าบริการ ไม่ใช่จากยอดที่รวม VAT แล้ว
 */
export function computeTotals(
  items: DocumentItem[],
  opts: {
    priceIncludeVat: boolean;
    vatRate: number;
    /** อัตราสำรองเมื่อบรรทัดไม่ได้ระบุเอง (เอกสารเก่า) */
    whtRate?: number;
    billingPercent?: number | null;
    /** ส่วนลดพิเศษท้ายบิล — คีย์เป็นบาทหรือ % ของยอดหลังหักส่วนลดรายบรรทัด */
    extraDiscountType?: 'amount' | 'percent';
    extraDiscountValue?: number;
  }
): DocumentTotals {
  const rate = (Number(opts.vatRate) || 0) / 100;

  let subtotal = 0;
  let discountTotal = 0;
  let taxableGross = 0;   // ยอดของบรรทัดที่เสีย VAT (ตามโหมดที่กรอก)
  let exemptGross = 0;    // ยอดของบรรทัดที่ยกเว้น/0%
  let whtBase = 0;        // มูลค่าก่อน VAT ของบรรทัดที่ตั้งอัตราหักไว้
  let whtAmountByLine = 0; // ผลรวมยอดหักของแต่ละบรรทัด

  for (const it of items) {
    const gross = lineGross(it);
    const disc = lineDiscount(it);
    subtotal += gross;
    discountTotal += disc;
    const net = Math.max(0, gross - disc);
    if (it.vat_type === 'vat') taxableGross += net;
    else exemptGross += net;

    // หัก ณ ที่จ่ายคิดจากมูลค่าก่อน VAT ของบรรทัดนั้น
    // (ขายสินค้าไม่ต้องหัก หักได้เฉพาะค่าบริการ จึงต้องแยกรายบรรทัด)
    const lineRate = it.wht_rate != null ? Number(it.wht_rate) : 0;
    if (lineRate > 0) {
      const preVat = it.vat_type === 'vat' && opts.priceIncludeVat && rate > 0
        ? net / (1 + rate)
        : net;
      whtBase += preVat;
      whtAmountByLine += (preVat * lineRate) / 100;
    }
  }

  // แบ่งชำระ: เรียกเก็บบางส่วนของยอดสัญญา ย่อทุกส่วนตามสัดส่วนเดียวกัน
  const share =
    opts.billingPercent != null && opts.billingPercent > 0 && opts.billingPercent < 100
      ? opts.billingPercent / 100
      : 1;
  taxableGross *= share;
  exemptGross *= share;
  whtBase *= share;
  whtAmountByLine *= share;

  // ส่วนลดพิเศษท้ายบิล — หักจากยอดรวมแล้วย่อทุกส่วนตามสัดส่วนเดียวกัน
  // ทำแบบนี้เพื่อให้ VAT และหัก ณ ที่จ่ายลดลงตามจริง ไม่ใช่หักแต่ยอดสุดท้าย
  const beforeExtra = taxableGross + exemptGross;
  let extraDiscount = 0;
  if (beforeExtra > 0) {
    const raw = opts.extraDiscountType === 'percent'
      ? (beforeExtra * (Number(opts.extraDiscountValue) || 0)) / 100
      : (Number(opts.extraDiscountValue) || 0);
    extraDiscount = Math.min(Math.max(0, raw), beforeExtra);
    if (extraDiscount > 0) {
      const factor = (beforeExtra - extraDiscount) / beforeExtra;
      taxableGross *= factor;
      exemptGross *= factor;
      whtBase *= factor;
      whtAmountByLine *= factor;
    }
  }

  let vatBase: number;
  let vatAmount: number;
  let grandTotal: number;

  if (opts.priceIncludeVat) {
    // คิด VAT ก่อน แล้วถอยกลับหาฐาน เพื่อให้ ฐาน + VAT = ยอดรวมทั้งสิ้น เป๊ะเสมอ
    // (ถ้าหารหาฐานก่อนแล้วปัด สองตัวจะบวกกันไม่ลงยอดในบางจำนวน)
    vatAmount = round2((taxableGross * rate) / (1 + rate));
    vatBase = round2(taxableGross - vatAmount);
    grandTotal = round2(taxableGross + exemptGross);
  } else {
    vatBase = round2(taxableGross);
    vatAmount = round2(vatBase * rate);
    grandTotal = round2(vatBase + vatAmount + exemptGross);
  }

  // ถ้าไม่มีบรรทัดไหนตั้งอัตราไว้เลย ให้ถอยไปใช้อัตราของหัวเอกสาร (รองรับเอกสารเก่า)
  const anyLineRate = items.some((i) => Number(i.wht_rate) > 0);
  const whtAmount = anyLineRate
    ? round2(whtAmountByLine)
    : round2(vatBase * ((Number(opts.whtRate) || 0) / 100));
  const effectiveWhtBase = anyLineRate ? round2(whtBase) : vatBase;

  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    extraDiscount: round2(extraDiscount),
    afterDiscount: round2(subtotal - discountTotal - extraDiscount),
    vatBase,
    vatExemptBase: round2(exemptGross),
    vatAmount,
    grandTotal,
    whtBase: effectiveWhtBase,
    whtAmount,
    netPayable: round2(grandTotal - whtAmount),
  };
}

export const VAT_TYPE_LABEL: Record<VatType, string> = {
  vat: 'VAT 7%',
  exempt: 'ยกเว้น VAT',
  zero: 'VAT 0%',
};

// ---------------------------------------------------------------------------
// จำนวนเงินเป็นตัวอักษรไทย
// ---------------------------------------------------------------------------

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** แปลงจำนวนเต็มไม่เกินหลักล้าน (ใช้ซ้ำแบบเรียกตัวเองสำหรับเลขใหญ่) */
function readInteger(n: number): string {
  if (n === 0) return DIGITS[0];
  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    return readInteger(millions) + 'ล้าน' + (rest > 0 ? readInteger(rest) : '');
  }

  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const digit = Number(s[i]);
    const place = s.length - i - 1;
    if (digit === 0) continue;

    if (place === 0) {
      // หลักหน่วย: ...เอ็ด เมื่อมีหลักสิบนำหน้า
      out += digit === 1 && s.length > 1 ? 'เอ็ด' : DIGITS[digit];
    } else if (place === 1) {
      // หลักสิบ: ยี่สิบ / สิบ / สามสิบ
      out += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : DIGITS[digit] + 'สิบ';
    } else {
      out += DIGITS[digit] + PLACES[place];
    }
  }
  return out;
}

/**
 * `137358.04` → "หนึ่งแสนสามหมื่นเจ็ดพันสามร้อยห้าสิบแปดบาทสี่สตางค์"
 * `12000`     → "หนึ่งหมื่นสองพันบาทถ้วน"
 */
export function bahtText(amount: number): string {
  const negative = amount < 0;
  const value = round2(Math.abs(amount));
  const baht = Math.floor(value);
  const satang = Math.round((value - baht) * 100);

  let text = readInteger(baht) + 'บาท';
  text += satang === 0 ? 'ถ้วน' : readInteger(satang) + 'สตางค์';
  return (negative ? 'ลบ' : '') + text;
}

/** `1234.5` → "1,234.50" */
export function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `2026-08-04` → "04/08/2026" (รูปแบบเดียวกับเอกสารเดิม) */
export function docDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

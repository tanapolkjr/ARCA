import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArcaWordmark } from '@/components/brand/ArcaWordmark';
import { bahtText, buildItemLayout, docDate, lineDiscount, money } from '@/accounting-lib/calc';
import { AP_DOC_LABEL, AR_DOC_LABEL, DOC_COLOR } from '@/accounting-lib/types';
import type { BankAccount, DocumentItem, DocumentItemGroup, PartySnapshot } from '@/accounting-lib/types';

export interface PrintableDoc {
  doc_type: string;
  doc_no: string | null;
  doc_date: string;
  due_date?: string | null;
  valid_until?: string | null;
  company_snapshot: PartySnapshot | null;
  company_email?: string | null;
  party_snapshot: PartySnapshot | null;
  party_label: string;                 // "ลูกค้า" | "ผู้ขาย"
  job_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  sales_name?: string | null;
  sales_phone?: string | null;
  reference_no?: string | null;
  tag_name?: string | null;
  customer_po_no?: string | null;
  /** วันที่รับชำระล่าสุด — พิมพ์บนใบเสร็จ */
  paid_on?: string | null;
  extra_discount?: number;
  price_include_vat: boolean;
  vat_rate: number;
  contract_total?: number | null;
  billing_percent?: number | null;
  subtotal: number;
  discount_total: number;
  vat_base: number;
  vat_exempt_base: number;
  vat_amount: number;
  grand_total: number;
  wht_base?: number;
  wht_amount: number;
  net_payable: number;
  note_text?: string | null;
  terms_text?: string | null;
  items: DocumentItem[];
  /** จัดกลุ่มรายการ (Type A/B/C) — optional, ว่างได้ถ้าเอกสารนี้ไม่ได้ใช้ */
  groups?: DocumentItemGroup[];
}

/**
 * เลือกได้ว่าสั่งพิมพ์ครั้งนี้จะออกฉบับไหนบ้าง
 *
 * เดิมพิมพ์ต้นฉบับและสำเนาต่อกันทุกครั้งโดยเลือกไม่ได้ ใบ 2 หน้าจึงได้ PDF 4 หน้า
 * ที่หน้า 3-4 เป็นหน้า 1-2 ซ้ำ ต่างกันแค่ป้ายมุมขวาบน ทั้งที่งานส่วนใหญ่ใช้แค่ต้นฉบับ
 * (ระบบเก็บเอกสารไว้ในฐานข้อมูลและสั่งพิมพ์ซ้ำได้ตลอด)
 *
 * แต่สำเนากระดาษยังจำเป็นอยู่บ้าง โดยเฉพาะใบกำกับภาษีที่ฝ่ายบัญชีเก็บเข้าแฟ้ม
 * จึงทำเป็นตัวเลือกตอนสั่งพิมพ์แทนการตัดทิ้ง
 */
export type PrintMode = 'original' | 'copy' | 'both';

export const PRINT_MODES: readonly { value: PrintMode; label: string; hint: string }[] = [
  { value: 'original', label: 'ต้นฉบับ', hint: 'สำหรับส่งลูกค้า — ใช้บ่อยที่สุด' },
  { value: 'copy', label: 'สำเนา', hint: 'สำหรับเก็บเข้าแฟ้ม' },
  { value: 'both', label: 'ต้นฉบับ + สำเนา', hint: 'ออกเป็นชุด พิมพ์ต่อกันในไฟล์เดียว' },
];

/** ป้ายฉบับที่ต้องพิมพ์ตามโหมดที่เลือก — เรียงตามลำดับที่ออกจริง */
export function copiesFor(mode: PrintMode): readonly string[] {
  if (mode === 'both') return ['ต้นฉบับ', 'สำเนา'];
  return mode === 'copy' ? ['สำเนา'] : ['ต้นฉบับ'];
}

/** ป้ายลายเซ็นต่างกันตามประเภทเอกสาร ตามธรรมเนียมที่ใช้จริง */
const SIGN_LABELS: Record<string, [string, string]> = {
  QT: ['ผู้สั่งซื้อสินค้า', 'ผู้อนุมัติ'],
  BL: ['ผู้รับวางบิล', 'ผู้วางบิล'],
  INV: ['ผู้จ่ายเงิน', 'ผู้รับเงิน'],
  RC: ['ผู้จ่ายเงิน', 'ผู้รับเงิน'],
  CN: ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'],
  DN: ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'],
  PO: ['ผู้รับใบสั่งซื้อ', 'ผู้อนุมัติ'],
  PI: ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'],
  PV: ['ผู้รับเงิน', 'ผู้จ่ายเงิน'],
  IM: ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'],
};

function labelTh(t: string) {
  return (AR_DOC_LABEL as Record<string, string>)[t] ?? (AP_DOC_LABEL as Record<string, string>)[t] ?? t;
}



// ---------------------------------------------------------------------------
// การตัดหน้า — วัดความสูงจริงจากเบราว์เซอร์ก่อนแบ่ง
//
// นับ "จำนวนบรรทัด" แบบตายตัวไม่ได้ เพราะรายละเอียดสินค้าเป็นข้อความหลายบรรทัด
// และภาษาไทยตัดคำไม่เท่ากัน จึงเรนเดอร์ลงชั้นที่ซ่อนไว้ วัดจริง แล้วค่อยจัดหน้า
//
// กฎ: หัวเอกสารซ้ำทุกหน้า · ที่เหลือขึ้นครั้งเดียว ไม่ซ้ำไม่ตก · ลายเซ็นหน้าสุดท้าย
// ---------------------------------------------------------------------------

const PX_PER_MM = 96 / 25.4;
const PAGE_H_MM = 297;
const PAGE_PAD_MM = 14;
/**
 * เผื่อกันคลาดจากการวัดเศษ pixel
 * ลดจาก 10mm เหลือ 6mm ได้หลังตรึงความกว้างคอลัมน์ (ดู COL_MM) เพราะชั้นที่ใช้วัด
 * กับหน้าที่พิมพ์จริงมีความกว้างเท่ากันแล้ว ค่าที่วัดได้จึงตรง ไม่ต้องเผื่อเยอะ
 */
const SAFETY_MM = 6;
const CONTENT_H = (PAGE_H_MM - PAGE_PAD_MM * 2 - SAFETY_MM) * PX_PER_MM;
const CONTENT_W_MM = 210 - PAGE_PAD_MM * 2;

type Block =
  | { kind: 'row'; key: string; index: number; no: number }
  | { kind: 'group-header'; key: string; name: string; cont?: boolean }
  | { kind: 'group-subtotal'; key: string; name: string; subtotal: number }
  | { kind: 'empty'; key: string }
  | { kind: 'totals'; key: string }
  | { kind: 'text'; key: string; heading?: string; line?: string; keepWithNext?: boolean }
  | { kind: 'payment'; key: string }
  | { kind: 'sign'; key: string };

/**
 * หน่วยที่ตัวจัดหน้ามองเห็น
 *
 * กลุ่มสินค้าถูกมัดเป็นก้อนเดียว (หัวกลุ่ม + รายการ + ยอดรวมย่อย) เพื่อให้พยายาม
 * วางทั้งกลุ่มไว้หน้าเดียวกันก่อนเสมอ ถ้าเลือกแตกได้ตามใจ เอกสารจะขาดตอนแบบที่
 * เคยเจอ: รายการของกลุ่มเดียวกันกระจายสามหน้าโดยหน้ากลางไม่มีชื่อกลุ่มกำกับเลย
 */
type Unit =
  | { kind: 'single'; block: Block }
  | {
      kind: 'group'; id: string;
      header: Block; contHeader: Block; rows: Block[]; subtotal: Block;
    };

/** แตกข้อความหลายบรรทัดเป็นชิ้นย่อย ให้ไหลข้ามหน้าได้โดยไม่ตัดกลางบรรทัด */
function textBlocks(prefix: string, heading: string, body: string | null | undefined): Block[] {
  const lines = (body ?? '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  return [
    { kind: 'text', key: `${prefix}-h`, heading, keepWithNext: true },
    ...lines.map((line, i) => ({ kind: 'text' as const, key: `${prefix}-${i}`, line })),
  ];
}

/** แถวที่อยู่ในตารางรายการ (นับรวมหัวกลุ่ม/สรุปย่อยของกลุ่มด้วย) — ใช้ตัดสินว่า thead ต้องซ้ำไหม */
const isRowLike = (b: Block) =>
  b.kind === 'row' || b.kind === 'empty' || b.kind === 'group-header' || b.kind === 'group-subtotal';

/** อย่างน้อยกี่รายการที่ต้องอยู่กับหัวกลุ่มบนหน้าเดียวกัน — กันหัวกลุ่มโดดท้ายหน้า */
const MIN_ROWS_UNDER_HEADER = 2;

/**
 * จัดหน้าเอกสารจากความสูงที่วัดมาจริง
 *
 * ลำดับการตัดสินใจของกลุ่มสินค้า:
 *   1. ทั้งกลุ่มลงที่เหลือของหน้านี้ได้        → วางต่อเลย
 *   2. ไม่ลง แต่ลงได้ถ้าขึ้นหน้าใหม่            → ขึ้นหน้าใหม่แล้ววางทั้งก้อน
 *   3. ใหญ่กว่าหนึ่งหน้าจริงๆ                  → ยอมแตก แต่ห้ามหัวกลุ่มโดด
 *      ห้ามยอดรวมย่อยโดด และหน้าถัดไปต้องมีหัวกลุ่ม "(ต่อ)" กำกับเสมอ
 *
 * ข้อ 2 คือหัวใจของความ compact: ยอมปล่อยท้ายหน้าว่างเพื่อให้กลุ่มถัดไปอยู่ครบใน
 * หน้าเดียว ดีกว่าแตกกลุ่มเพื่ออุดที่ว่างแล้วคนอ่านต้องพลิกหน้าไปมา
 */
export function paginate(
  units: Unit[], H: (b: Block) => number, avail: number, theadH: number
): Block[][] {
  const pages: Block[][] = [];
  let cur: Block[] = [];
  let used = 0;
  let hasRows = false;

  const room = () => avail - used;
  const theadCost = () => (hasRows ? 0 : theadH);
  const flush = () => {
    if (cur.length) { pages.push(cur); cur = []; used = 0; hasRows = false; }
  };
  const put = (b: Block) => {
    if (isRowLike(b)) { used += theadCost(); hasRows = true; }
    used += H(b);
    cur.push(b);
  };
  /** ดึงรายการสุดท้ายกลับออกมา เพื่อพาไปหน้าใหม่พร้อมยอดรวมย่อย —
   *  ทำได้ต่อเมื่อหน้าเดิมยังเหลือรายการอยู่ ไม่งั้นหน้าเดิมจะเหลือแต่หัวกลุ่มโดดๆ */
  const pullBackLastRow = (): Block | null => {
    const last = cur[cur.length - 1];
    if (!last || last.kind !== 'row') return null;
    if (cur.filter((b) => b.kind === 'row').length < 2) return null;
    cur.pop();
    used -= H(last);
    return last;
  };

  const putWholeGroup = (u: Extract<Unit, { kind: 'group' }>) => {
    put(u.header);
    u.rows.forEach(put);
    put(u.subtotal);
  };

  const splitGroup = (u: Extract<Unit, { kind: 'group' }>) => {
    let i = 0;
    let first = true;
    while (i < u.rows.length) {
      const hdr = first ? u.header : u.contHeader;
      // ต้องมีที่พอสำหรับหัวกลุ่ม + รายการขั้นต่ำ ไม่งั้นยกไปเริ่มที่หน้าใหม่
      const take = Math.min(MIN_ROWS_UNDER_HEADER, u.rows.length - i);
      let need = theadCost() + H(hdr);
      for (let k = 0; k < take; k++) need += H(u.rows[i + k]);
      if (need > room() && cur.length) flush();

      put(hdr);
      first = false;

      const before = i;
      while (i < u.rows.length && H(u.rows[i]) <= room()) { put(u.rows[i]); i += 1; }
      // รายการเดียวสูงเกินหนึ่งหน้า — ยัดลงไปตรงๆ เพื่อให้เดินหน้าต่อได้ ไม่วนไม่รู้จบ
      if (i === before) { put(u.rows[i]); i += 1; }

      if (i < u.rows.length) flush();
    }

    if (H(u.subtotal) > room()) {
      const pulled = pullBackLastRow();
      flush();
      put(u.contHeader);
      if (pulled) put(pulled);
    }
    put(u.subtotal);
  };

  for (let idx = 0; idx < units.length; idx += 1) {
    const u = units[idx];

    if (u.kind === 'single') {
      const b = u.block;
      let need = (isRowLike(b) ? theadCost() : 0) + H(b);
      // หัวข้อหมายเหตุ/เงื่อนไขต้องไม่ลอยอยู่ท้ายหน้าโดยไม่มีเนื้อหาตามมา
      if (b.kind === 'text' && b.keepWithNext) {
        const next = units[idx + 1];
        if (next?.kind === 'single') need += H(next.block);
      }
      if (need > room() && cur.length) flush();
      put(b);
      continue;
    }

    const rowsH = u.rows.reduce((a, r) => a + H(r), 0);
    const whole = H(u.header) + rowsH + H(u.subtotal);
    if (theadCost() + whole <= room()) putWholeGroup(u);
    else if (theadH + whole <= avail) { flush(); putWholeGroup(u); }
    else splitGroup(u);
  }

  flush();
  return pages;
}

export function DocumentPrintView({
  doc, copyLabel, bankAccounts = [], issuedAsSet = false,
}: {
  doc: PrintableDoc;
  copyLabel?: string;
  bankAccounts?: BankAccount[];
  /** true เมื่อสั่งพิมพ์ทั้งต้นฉบับและสำเนาพร้อมกัน — ใบกำกับภาษีต้องระบุว่าออกเป็นชุด */
  issuedAsSet?: boolean;
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);
  // โลโก้เป็นรูป โหลดเสร็จทีหลัง — ต้องวัดใหม่เหมือนตอนฟอนต์พร้อม
  const [assetsReady, setAssetsReady] = useState(0);

  const itemLayout = useMemo(
    () => buildItemLayout(doc.items, doc.groups ?? []),
    [doc.items, doc.groups]
  );

  const units = useMemo<Unit[]>(() => {
    const out: Unit[] = [];
    const single = (block: Block) => out.push({ kind: 'single', block });
    if (doc.items.length === 0) single({ kind: 'empty', key: 'empty' });

    itemLayout.forEach((b) => {
      if (b.kind === 'item') {
        single({
          kind: 'row', key: `row-${b.entry.itemIndex}`,
          index: b.entry.itemIndex, no: b.entry.displayNo,
        });
        return;
      }
      const name = b.group.group_name;
      out.push({
        kind: 'group',
        id: b.group.id,
        header: { kind: 'group-header', key: `grp-h-${b.group.id}`, name },
        contHeader: { kind: 'group-header', key: `grp-c-${b.group.id}`, name, cont: true },
        rows: b.entries.map((entry) => ({
          kind: 'row' as const, key: `row-${entry.itemIndex}`,
          index: entry.itemIndex, no: entry.displayNo,
        })),
        subtotal: {
          kind: 'group-subtotal', key: `grp-s-${b.group.id}`, name, subtotal: b.subtotal,
        },
      });
    });

    single({ kind: 'totals', key: 'totals' });
    textBlocks('note', 'หมายเหตุ', doc.note_text).forEach(single);
    textBlocks('terms', 'เงื่อนไข', doc.terms_text).forEach(single);
    if (doc.doc_type === 'INV' || doc.doc_type === 'RC') single({ kind: 'payment', key: 'payment' });
    single({ kind: 'sign', key: 'sign' });
    return out;
  }, [doc, itemLayout]);

  /** ทุกบล็อกเรียงแบน — ใช้เรนเดอร์ชั้นวัดความสูง และใช้เป็นหน้าเดียวตอนยังวัดไม่เสร็จ */
  const blocks = useMemo<Block[]>(() => units.flatMap((u) => (
    u.kind === 'single' ? [u.block] : [u.header, ...u.rows, u.subtotal]
  )), [units]);

  const measureKey = useMemo(() => JSON.stringify([
    doc.doc_type, doc.doc_no, copyLabel,
    doc.company_snapshot, doc.party_snapshot, doc.job_name,
    doc.contact_name, doc.contact_phone, doc.sales_name, doc.sales_phone,
    doc.note_text, doc.terms_text, bankAccounts.length,
    doc.items.map((i) => [i.description, i.qty, i.unit_price, i.line_total, i.group_id ?? null]),
    (doc.groups ?? []).map((g) => [g.id, g.group_name]),
  ]), [doc, copyLabel, bankAccounts.length]);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;

    const measure = () => {
      const h: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>('[data-mk]').forEach((el) => {
        h[el.dataset.mk!] = el.getBoundingClientRect().height;
      });
      const headerH = h['header'] ?? 0;
      const theadH = h['thead'] ?? 0;
      if (!headerH) return;

      setPages(paginate(units, (b) => h[b.key] ?? 0, CONTENT_H - headerH, theadH));
    };

    measure();
    // ฟอนต์ไทยมักโหลดเสร็จหลังการวาดครั้งแรก ถ้าวัดด้วยฟอนต์สำรองความสูงจะเพี้ยน
    // แล้วเนื้อหาจะล้นหน้า — วัดซ้ำเมื่อฟอนต์พร้อมจริง
    let cancelled = false;
    void document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [measureKey, units, assetsReady]);

  const rendered = pages ?? [blocks];

  return (
    <>
      {/* ชั้นวัดความสูง — ซ่อนจากสายตาและไม่ถูกพิมพ์ */}
      <div
        ref={measureRef}
        aria-hidden
        className="doc-page no-print"
        style={{
          position: 'absolute', left: '-9999px', top: 0,
          width: `${CONTENT_W_MM}mm`, padding: 0, minHeight: 0,
        }}
      >
        <div data-mk="header" onLoad={() => setAssetsReady((n) => n + 1)}>
          <DocHeader doc={doc} copyLabel={copyLabel} pageNo={1} totalPages={2}
                     issuedAsSet={issuedAsSet} />
        </div>
        <table className="w-full table-fixed text-[11px] border-collapse">
          <ItemCols />
          <thead><tr data-mk="thead"><ItemHead color={color} /></tr></thead>
          <tbody>
            {blocks.filter(isRowLike).map((b) => {
              if (b.kind === 'row') return <ItemRow key={b.key} it={doc.items[b.index]} no={b.no} mk={b.key} />;
              if (b.kind === 'group-header') return <GroupHeaderRow key={b.key} mk={b.key} name={b.name} />;
              if (b.kind === 'group-subtotal') {
                return <GroupSubtotalRow key={b.key} mk={b.key} name={b.name} subtotal={b.subtotal} />;
              }
              return <tr key={b.key} data-mk={b.key}><td colSpan={7} className="py-6" /></tr>;
            })}
            {/* หัวกลุ่ม "(ต่อ)" ต้องวัดแยก เพราะคำต่อท้ายอาจดันให้ตัดบรรทัดเพิ่มเมื่อชื่อกลุ่มยาว */}
            {units.map((u) => (u.kind === 'group' ? (
              <GroupHeaderRow key={u.contHeader.key} mk={u.contHeader.key}
                              name={(u.header as { name: string }).name} cont />
            ) : null))}
          </tbody>
        </table>
        <div data-mk="totals"><TotalsBlock doc={doc} color={color} bankAccounts={bankAccounts} /></div>
        {textBlocks('note', 'หมายเหตุ', doc.note_text).map((b) => (
          <div key={b.key} data-mk={b.key}><TextLine block={b} color={color} /></div>
        ))}
        {textBlocks('terms', 'เงื่อนไข', doc.terms_text).map((b) => (
          <div key={b.key} data-mk={b.key}><TextLine block={b} color={color} /></div>
        ))}
        {(doc.doc_type === 'INV' || doc.doc_type === 'RC') && (
          <div data-mk="payment"><PaymentBlock /></div>
        )}
        <div data-mk="sign"><SignBlock docType={doc.doc_type} /></div>
      </div>

      {rendered.map((pageBlocks, i) => (
        <DocPage
          key={i}
          doc={doc}
          blocks={pageBlocks}
          copyLabel={copyLabel}
          issuedAsSet={issuedAsSet}
          pageNo={i + 1}
          totalPages={rendered.length}
          bankAccounts={bankAccounts}
        />
      ))}
    </>
  );
}

function DocPage({
  doc, blocks, copyLabel, pageNo, totalPages, bankAccounts, issuedAsSet,
}: {
  doc: PrintableDoc;
  blocks: Block[];
  copyLabel?: string;
  pageNo: number;
  totalPages: number;
  bankAccounts: BankAccount[];
  issuedAsSet?: boolean;
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const rowBlocks = blocks.filter(isRowLike);
  const rest = blocks.filter((b) => !isRowLike(b));

  return (
    <div className="doc-page bg-white text-stone-900"
         style={{ width: '210mm', height: '297mm', padding: `${PAGE_PAD_MM}mm`, overflow: 'hidden' }}>
      <DocHeader doc={doc} copyLabel={copyLabel} pageNo={pageNo} totalPages={totalPages}
                 issuedAsSet={issuedAsSet} />

      {rowBlocks.length > 0 && (
        <table className="w-full table-fixed text-[11px] border-collapse">
          <ItemCols />
          <thead><tr><ItemHead color={color} /></tr></thead>
          <tbody>
            {rowBlocks.map((b) => {
              if (b.kind === 'row') return <ItemRow key={b.key} it={doc.items[b.index]} no={b.no} />;
              if (b.kind === 'group-header') {
                return <GroupHeaderRow key={b.key} name={b.name} cont={b.cont} />;
              }
              if (b.kind === 'group-subtotal') {
                return <GroupSubtotalRow key={b.key} name={b.name} subtotal={b.subtotal} />;
              }
              return (
                <tr key={b.key}>
                  <td colSpan={7} className="py-6 text-center text-stone-400">ยังไม่มีรายการ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rest.map((b) => {
        if (b.kind === 'totals') {
          return <TotalsBlock key={b.key} doc={doc} color={color} bankAccounts={bankAccounts} />;
        }
        if (b.kind === 'text') return <TextLine key={b.key} block={b} color={color} />;
        if (b.kind === 'payment') return <PaymentBlock key={b.key} />;
        if (b.kind === 'sign') return <SignBlock key={b.key} docType={doc.doc_type} />;
        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- หัวเอกสาร

function DocHeader({
  doc, copyLabel, pageNo, totalPages, issuedAsSet,
}: {
  doc: PrintableDoc; copyLabel?: string; pageNo: number; totalPages: number;
  issuedAsSet?: boolean;
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const co = doc.company_snapshot;
  const party = doc.party_snapshot;
  const isTaxInvoice = doc.doc_type === 'INV';
  const showDue = doc.doc_type === 'BL' || doc.doc_type === 'PO';

  return (
    <>
      {/* แถวบน: โลโก้ + ข้อมูลบริษัท ซ้าย · ชื่อเอกสาร ขวา */}
      <div className="flex justify-between items-start gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <ArcaWordmark className="w-[34mm] mt-1 shrink-0" />
          <div className="text-[10px] leading-[1.55] min-w-0">
            <div className="text-[13px] font-bold leading-tight">{co?.name ?? '—'}</div>
            {co?.name_en && <div className="text-[10px]">{co.name_en}</div>}
            {co?.address && <div className="whitespace-pre-line">{co.address}</div>}
            <div>
              เลขประจำตัวผู้เสียภาษี {co?.tax_id || '-'}
              {doc.company_email && <span className="ml-6">E-mail {doc.company_email}</span>}
              {co?.phone && <span className="ml-6">โทร. {co.phone}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[24px] font-bold leading-none" style={{ color }}>
            {labelTh(doc.doc_type)}
          </div>
          {copyLabel && <div className="text-[9px] text-stone-500 mt-1.5">{copyLabel}</div>}
          {/* ระบุ "ออกเป็นชุด" เฉพาะตอนที่ออกเป็นชุดจริง — พิมพ์แค่ต้นฉบับใบเดียวไม่ใช่ชุด */}
          {isTaxInvoice && copyLabel === 'ต้นฉบับ' && issuedAsSet && (
            <div className="text-[8px] text-stone-500">(เอกสารออกเป็นชุด)</div>
          )}
          <div className="text-[9px] text-stone-500">หน้าที่ {pageNo}/{totalPages}</div>
        </div>
      </div>

      {/* แถวสอง: ลูกค้า ซ้าย · ข้อมูลเอกสาร ขวา */}
      <div className="flex justify-between gap-6 mt-6">
        <div className="text-[10px] leading-[1.6] min-w-0">
          <div className="text-[11px] font-bold">{doc.party_label}</div>
          <div className="text-[11px] font-bold">
            {party?.name ?? '—'}
            {party?.branch_label && <span> ({party.branch_label})</span>}
          </div>
          {party?.tax_id && <div>เลขประจำตัวผู้เสียภาษี {party.tax_id}</div>}
          {party?.address && <div className="whitespace-pre-line">{party.address}</div>}
          <div>
            ผู้ติดต่อ {doc.contact_name || '-'}
            <span className="ml-4">โทร. {doc.contact_phone || '-'}</span>
          </div>
        </div>

        <div className="w-[72mm] text-[10px] leading-[1.8] shrink-0">
          <Row k="เลขที่" v={doc.doc_no ?? '(ร่าง — ยังไม่ออกเลขที่)'} bold />
          <Row k="วันที่" v={docDate(doc.doc_date)} />
          {showDue && doc.due_date && <Row k="ครบกำหนด" v={docDate(doc.due_date)} />}
          {doc.doc_type === 'QT' && doc.valid_until && (
            <Row k="ยืนราคาถึง" v={docDate(doc.valid_until)} />
          )}
          {doc.sales_name && (
            <Row k="ผู้ขาย" v={
              <>
                {doc.sales_name}
                {doc.sales_phone && <span className="ml-3">{doc.sales_phone}</span>}
              </>
            } />
          )}
          {doc.reference_no && <Row k="อ้างอิง" v={doc.reference_no} />}
          {doc.customer_po_no && <Row k="เลขที่ PO" v={doc.customer_po_no} />}
          {doc.paid_on && (doc.doc_type === 'INV' || doc.doc_type === 'RC') && (
            <Row k="วันที่รับชำระ" v={docDate(doc.paid_on)} />
          )}
        </div>
      </div>

      {/* ชื่องานเต็มความกว้าง — ชื่อโครงการมักยาว ให้พื้นที่เต็มบรรทัด */}
      {doc.job_name && (
        <div className="flex gap-6 text-[11px] pt-5 pb-3">
          <span className="w-[22mm] shrink-0 text-stone-500">ชื่องาน</span>
          <span className="flex-1">{doc.job_name}</span>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ ตาราง

const HEAD_CELL = 'py-2 font-semibold';

/**
 * ความกว้างคอลัมน์ตายตัว (มม.) — รายละเอียดกินที่เหลือ
 *
 * ต้องคุมความกว้างเองและใช้คู่กับ table-layout: fixed เสมอ เพราะ CSS ตาราง
 * แบบ auto คิดความกว้างคอลัมน์จาก "เนื้อหาที่มีอยู่ในตารางนั้น" — ชั้นที่ใช้วัด
 * มีทุกแถวของเอกสาร ส่วนตารางของแต่ละหน้ามีแค่แถวของหน้านั้น ความกว้างจึงไม่ตรงกัน
 * ผลคือความสูงที่วัดได้ไม่ใช่ความสูงที่พิมพ์จริง ตัวจัดหน้าเลยคำนวณผิดทั้งใบ
 * (เคยทำให้หน้าแรกว่างเกือบครึ่งหน้า และคอลัมน์รายละเอียดในหน้าสุดท้ายแคบจนข้อความ
 * ตัดเป็น 7 บรรทัด) ตรึงความกว้างแล้วทั้งสองชั้นจะวัดได้เท่ากันเป๊ะ
 */
const COL_MM = [12, null, 16, 14, 24, 22, 26] as const;

function ItemCols() {
  return (
    <colgroup>
      {COL_MM.map((w, i) => (
        <col key={i} style={w == null ? undefined : { width: `${w}mm` }} />
      ))}
    </colgroup>
  );
}

function ItemHead({ color }: { color: string }) {
  const border = { borderTop: `1.5px solid ${color}`, borderBottom: `1.5px solid ${color}`, color };
  return (
    <>
      <th className={`${HEAD_CELL} text-left`} style={border}>ลำดับ</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>รายละเอียด</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>จำนวน</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>หน่วย</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>ราคา/หน่วย</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>ส่วนลด</th>
      <th className={`${HEAD_CELL} text-right pr-1`} style={border}>มูลค่า</th>
    </>
  );
}

function ItemRow({ it, no, mk }: { it: DocumentItem; no: number; mk?: string }) {
  const qty = Number(it.qty) || 0;
  const disc = lineDiscount(it);
  return (
    <tr data-mk={mk} className="align-top">
      <td className="py-2 pl-1">{no}</td>
      {/* รายละเอียดหลายบรรทัด: ชื่อรุ่นบรรทัดแรก สเปกย่อยบรรทัดถัดไป */}
      <td className="py-2 whitespace-pre-line pr-3">{it.description}</td>
      <td className="py-2 text-right tabular-nums">{money(it.qty).replace('.00', '')}</td>
      <td className="py-2 text-center">{it.unit ?? ''}</td>
      <td className="py-2 text-right tabular-nums">{money(it.unit_price)}</td>
      {/* ส่วนลดต่อหน่วย เพื่อให้บวกลบในบรรทัดเดียวได้:
          (ราคา/หน่วย − ส่วนลด) × จำนวน = มูลค่า */}
      <td className="py-2 text-right tabular-nums">
        {disc > 0 && qty > 0 ? money(disc / qty) : ''}
      </td>
      <td className="py-2 text-right tabular-nums pr-1">{money(it.line_total)}</td>
    </tr>
  );
}

/**
 * แถวหัวกลุ่ม (Type A/B/C) — ไม่มีจำนวน/ราคา แค่ชื่อกลุ่มคาดเส้นบาง
 * `cont` = หัวกลุ่มที่พิมพ์ซ้ำตอนกลุ่มยาวจนต้องขึ้นหน้าใหม่ ต่อท้ายด้วย "(ต่อ)"
 * ไม่งั้นคนอ่านหน้าถัดไปจะไม่รู้ว่ารายการที่เห็นอยู่เป็นของกลุ่มไหน
 */
function GroupHeaderRow({ name, mk, cont }: { name: string; mk?: string; cont?: boolean }) {
  return (
    <tr data-mk={mk}>
      <td colSpan={7} className="pt-3 pb-1 font-semibold border-b border-stone-300">
        {name}{cont && <span className="font-normal text-stone-500"> (ต่อ)</span>}
      </td>
    </tr>
  );
}

/**
 * แถวสรุปยอดย่อยท้ายกลุ่ม — ชิดขวาใต้คอลัมน์มูลค่า เหมือนแถวรวมย่อยในตารางบัญชีทั่วไป
 *
 * ป้ายกินตั้งแต่คอลัมน์แรกถึงคอลัมน์ส่วนลด ไม่ใช่ยัดไว้ในคอลัมน์ส่วนลดคอลัมน์เดียว
 * ชื่อกลุ่มยาวๆ จึงมีที่พอเสมอโดยไม่ต้องใช้ nowrap ซึ่งเคยดันความกว้างคอลัมน์จน
 * ตารางทั้งหน้าเพี้ยน
 */
function GroupSubtotalRow({ name, subtotal, mk }: { name: string; subtotal: number; mk?: string }) {
  return (
    <tr data-mk={mk}>
      <td colSpan={6} className="py-1 pr-3 text-right text-stone-500">รวม{name}</td>
      <td className="py-1 text-right tabular-nums font-semibold pr-1 border-t border-stone-200">
        {money(subtotal)}
      </td>
    </tr>
  );
}

// -------------------------------------------------------------- สรุปยอด

function TotalsBlock({
  doc, color, bankAccounts = [],
}: { doc: PrintableDoc; color: string; bankAccounts?: BankAccount[] }) {
  const hasDiscount = doc.discount_total > 0 || (doc.extra_discount ?? 0) > 0;
  return (
    <div className="flex justify-between items-start gap-8 pt-6">
      {/* บัญชีรับเงินอยู่ระดับเดียวกับยอด ลูกค้าเห็นเลขบัญชีกับยอดที่ต้องโอนพร้อมกัน */}
      <div className="flex-1 text-[10px] leading-[1.7] pt-1">
        <div className="font-semibold" style={{ color }}>กรุณาชำระ</div>
        <div className="pl-3">
          <div>{doc.company_snapshot?.name ?? ''}</div>
          {bankAccounts.length > 0
            ? bankAccounts.map((b) => (
                <div key={b.id}>
                  ธนาคาร{b.bank_name} เลขที่ : {b.account_no}
                  {b.branch ? ` (${b.branch})` : ''}
                </div>
              ))
            : <div className="text-stone-400">ธนาคาร — เลขที่ :</div>}
        </div>
      </div>

      <div className="w-[86mm] text-[10px] shrink-0">
        <Total k="รวมเป็นเงิน" v={doc.subtotal} />
        {doc.discount_total > 0 && <Total k="ส่วนลด" v={doc.discount_total} />}
        {(doc.extra_discount ?? 0) > 0 && <Total k="ส่วนลดพิเศษ" v={doc.extra_discount ?? 0} />}
        {hasDiscount && (
          <Total k="จำนวนเงินหลังหักส่วนลด"
                 v={doc.subtotal - doc.discount_total - (doc.extra_discount ?? 0)} />
        )}
        {doc.billing_percent != null && doc.billing_percent > 0 && doc.billing_percent < 100 && (
          <Total k={`แบ่งชำระ ${doc.billing_percent}%`} v={doc.grand_total} bold />
        )}
        <Total k="มูลค่าที่ไม่มี/ยกเว้นภาษี" v={doc.vat_exempt_base} />
        <Total k="มูลค่าที่คำนวณภาษี" v={doc.vat_base} />
        <Total k={`ภาษีมูลค่าเพิ่ม ${doc.vat_rate}%`} v={doc.vat_amount} />
        <div style={{ borderTop: `1.5px solid ${color}` }} className="mt-1.5 pt-1.5">
          <Total k="จำนวนเงินรวมทั้งสิ้น" v={doc.grand_total} bold />
        </div>
        <Total k="หักภาษี ณ ที่จ่ายทั้งสิ้น" v={doc.wht_amount} />
        <Total k="ยอดชำระ" v={doc.net_payable} bold />
        <div className="text-[10px] italic text-right mt-1">({bahtText(doc.net_payable)})</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------ หมายเหตุ / เงื่อนไข

function TextLine({ block, color }: { block: Block; color: string }) {
  if (block.kind !== 'text') return null;
  if (block.heading) {
    return (
      <div className="text-[10px] font-semibold pt-4"
           style={{ color, borderTop: block.key === 'note-h' ? '1px solid #cbd5e1' : undefined }}>
        {block.heading}
      </div>
    );
  }
  return <div className="text-[10px] leading-[1.7] pl-1">{block.line}</div>;
}

function PaymentBlock() {
  return (
    <div className="text-[10px] border-t border-stone-200 pt-2 mt-0">
      <div className="mb-1">การชำระเงินจะสมบูรณ์เมื่อบริษัทได้รับเงินเรียบร้อยแล้ว</div>
      <div className="flex gap-5">
        {['เงินสด', 'เช็ค', 'โอนเงิน', 'บัตรเครดิต'].map((m) => <span key={m}>☐ {m}</span>)}
      </div>
      <div className="mt-1.5 flex gap-6">
        <span>ธนาคาร ______________</span>
        <span>เลขที่ ______________</span>
        <span>วันที่ __________</span>
        <span>จำนวนเงิน __________</span>
      </div>
    </div>
  );
}

function SignBlock({ docType }: { docType: string }) {
  const [leftSign, rightSign] = SIGN_LABELS[docType] ?? ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'];
  return (
    <div className="flex justify-between gap-16 text-[10px] pt-12 px-6">
      {[leftSign, rightSign].map((label) => (
        <div key={label} className="flex-1 text-center">
          <div className="border-b border-stone-400 h-8" />
          <div className="mt-1.5">{label}</div>
          <div className="text-stone-400 text-[9px]">วันที่</div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[22mm] shrink-0 text-stone-500">{k}</span>
      <span className={`flex-1 ${bold ? 'font-semibold' : ''}`}>{v}</span>
    </div>
  );
}

function Total({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-[1.5px] ${bold ? 'font-semibold' : ''}`}>
      <span>{k}</span>
      <span className="tabular-nums">{money(v)} บาท</span>
    </div>
  );
}

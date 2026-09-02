import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArcaWordmark } from '@/components/brand/ArcaWordmark';
import { bahtText, docDate, lineDiscount, money } from '@/accounting-lib/calc';
import { AP_DOC_LABEL, AR_DOC_LABEL, DOC_COLOR } from '@/accounting-lib/types';
import type { BankAccount, DocumentItem, PartySnapshot } from '@/accounting-lib/types';

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
/** เผื่อกันคลาดจากการวัดเศษ pixel — ยอมเสียพื้นที่นิดเดียวดีกว่าล้นหน้า */
const SAFETY_MM = 10;
const CONTENT_H = (PAGE_H_MM - PAGE_PAD_MM * 2 - SAFETY_MM) * PX_PER_MM;
const CONTENT_W_MM = 210 - PAGE_PAD_MM * 2;

type Block =
  | { kind: 'row'; key: string; index: number }
  | { kind: 'empty'; key: string }
  | { kind: 'totals'; key: string }
  | { kind: 'text'; key: string; heading?: string; line?: string; keepWithNext?: boolean }
  | { kind: 'payment'; key: string }
  | { kind: 'sign'; key: string };

/** แตกข้อความหลายบรรทัดเป็นชิ้นย่อย ให้ไหลข้ามหน้าได้โดยไม่ตัดกลางบรรทัด */
function textBlocks(prefix: string, heading: string, body: string | null | undefined): Block[] {
  const lines = (body ?? '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  return [
    { kind: 'text', key: `${prefix}-h`, heading, keepWithNext: true },
    ...lines.map((line, i) => ({ kind: 'text' as const, key: `${prefix}-${i}`, line })),
  ];
}

export function DocumentPrintView({
  doc, copyLabel, bankAccounts = [],
}: {
  doc: PrintableDoc;
  copyLabel?: string;
  bankAccounts?: BankAccount[];
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);
  // โลโก้เป็นรูป โหลดเสร็จทีหลัง — ต้องวัดใหม่เหมือนตอนฟอนต์พร้อม
  const [assetsReady, setAssetsReady] = useState(0);

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    if (doc.items.length === 0) out.push({ kind: 'empty', key: 'empty' });
    doc.items.forEach((_, i) => out.push({ kind: 'row', key: `row-${i}`, index: i }));
    out.push({ kind: 'totals', key: 'totals' });
    out.push(...textBlocks('note', 'หมายเหตุ', doc.note_text));
    out.push(...textBlocks('terms', 'เงื่อนไข', doc.terms_text));
    if (doc.doc_type === 'INV' || doc.doc_type === 'RC') out.push({ kind: 'payment', key: 'payment' });
    out.push({ kind: 'sign', key: 'sign' });
    return out;
  }, [doc]);

  const measureKey = useMemo(() => JSON.stringify([
    doc.doc_type, doc.doc_no, copyLabel,
    doc.company_snapshot, doc.party_snapshot, doc.job_name,
    doc.contact_name, doc.contact_phone, doc.sales_name, doc.sales_phone,
    doc.note_text, doc.terms_text, bankAccounts.length,
    doc.items.map((i) => [i.description, i.qty, i.unit_price, i.line_total]),
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

      const avail = CONTENT_H - headerH;
      const out: Block[][] = [];
      let cur: Block[] = [];
      let used = 0;
      let curHasRows = false;
      const heightOf = (b: Block) => h[b.key] ?? 0;

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const needThead = (b.kind === 'row' || b.kind === 'empty') && !curHasRows ? theadH : 0;
        let need = needThead + heightOf(b);
        if (b.kind === 'text' && b.keepWithNext && blocks[i + 1]) need += heightOf(blocks[i + 1]);

        if (used + need > avail && cur.length > 0) {
          out.push(cur); cur = []; used = 0; curHasRows = false;
        }
        const thead2 = (b.kind === 'row' || b.kind === 'empty') && !curHasRows ? theadH : 0;
        cur.push(b);
        used += thead2 + heightOf(b);
        if (b.kind === 'row' || b.kind === 'empty') curHasRows = true;
      }
      if (cur.length) out.push(cur);
      setPages(out);
    };

    measure();
    // ฟอนต์ไทยมักโหลดเสร็จหลังการวาดครั้งแรก ถ้าวัดด้วยฟอนต์สำรองความสูงจะเพี้ยน
    // แล้วเนื้อหาจะล้นหน้า — วัดซ้ำเมื่อฟอนต์พร้อมจริง
    let cancelled = false;
    void document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [measureKey, blocks, assetsReady]);

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
          <DocHeader doc={doc} copyLabel={copyLabel} pageNo={1} totalPages={2} />
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead><tr data-mk="thead"><ItemHead color={color} /></tr></thead>
          <tbody>
            {doc.items.map((it, i) => (
              <ItemRow key={i} it={it} no={i + 1} mk={`row-${i}`} />
            ))}
            {doc.items.length === 0 && <tr data-mk="empty"><td colSpan={7} className="py-6" /></tr>}
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
          pageNo={i + 1}
          totalPages={rendered.length}
          bankAccounts={bankAccounts}
        />
      ))}
    </>
  );
}

function DocPage({
  doc, blocks, copyLabel, pageNo, totalPages, bankAccounts,
}: {
  doc: PrintableDoc;
  blocks: Block[];
  copyLabel?: string;
  pageNo: number;
  totalPages: number;
  bankAccounts: BankAccount[];
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const rowBlocks = blocks.filter((b) => b.kind === 'row' || b.kind === 'empty');
  const rest = blocks.filter((b) => b.kind !== 'row' && b.kind !== 'empty');

  return (
    <div className="doc-page bg-white text-slate-900"
         style={{ width: '210mm', height: '297mm', padding: `${PAGE_PAD_MM}mm`, overflow: 'hidden' }}>
      <DocHeader doc={doc} copyLabel={copyLabel} pageNo={pageNo} totalPages={totalPages} />

      {rowBlocks.length > 0 && (
        <table className="w-full text-[11px] border-collapse">
          <thead><tr><ItemHead color={color} /></tr></thead>
          <tbody>
            {rowBlocks.map((b) =>
              b.kind === 'row' ? (
                <ItemRow key={b.key} it={doc.items[b.index]} no={b.index + 1} />
              ) : (
                <tr key={b.key}>
                  <td colSpan={7} className="py-6 text-center text-slate-400">ยังไม่มีรายการ</td>
                </tr>
              )
            )}
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
  doc, copyLabel, pageNo, totalPages,
}: { doc: PrintableDoc; copyLabel?: string; pageNo: number; totalPages: number }) {
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
          {copyLabel && <div className="text-[9px] text-slate-500 mt-1.5">{copyLabel}</div>}
          {isTaxInvoice && copyLabel === 'ต้นฉบับ' && (
            <div className="text-[8px] text-slate-500">(เอกสารออกเป็นชุด)</div>
          )}
          <div className="text-[9px] text-slate-500">หน้าที่ {pageNo}/{totalPages}</div>
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
          <span className="w-[22mm] shrink-0 text-slate-500">ชื่องาน</span>
          <span className="flex-1">{doc.job_name}</span>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ ตาราง

const HEAD_CELL = 'py-2 font-semibold';

function ItemHead({ color }: { color: string }) {
  const border = { borderTop: `1.5px solid ${color}`, borderBottom: `1.5px solid ${color}`, color };
  return (
    <>
      <th className={`${HEAD_CELL} w-[12mm] text-left`} style={border}>ลำดับ</th>
      <th className={`${HEAD_CELL} text-center`} style={border}>รายละเอียด</th>
      <th className={`${HEAD_CELL} w-[16mm] text-center`} style={border}>จำนวน</th>
      <th className={`${HEAD_CELL} w-[14mm] text-center`} style={border}>หน่วย</th>
      <th className={`${HEAD_CELL} w-[24mm] text-center`} style={border}>ราคา/หน่วย</th>
      <th className={`${HEAD_CELL} w-[22mm] text-center`} style={border}>ส่วนลด</th>
      <th className={`${HEAD_CELL} w-[26mm] text-right pr-1`} style={border}>มูลค่า</th>
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
            : <div className="text-slate-400">ธนาคาร — เลขที่ :</div>}
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
    <div className="text-[10px] border-t border-slate-200 pt-2 mt-0">
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
          <div className="border-b border-slate-400 h-8" />
          <div className="mt-1.5">{label}</div>
          <div className="text-slate-400 text-[9px]">วันที่</div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[22mm] shrink-0 text-slate-500">{k}</span>
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

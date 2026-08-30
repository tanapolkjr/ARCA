import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bahtText, docDate, lineDiscount, money } from '@/accounting-lib/calc';
import {
  AP_DOC_LABEL, AP_DOC_LABEL_EN, AR_DOC_LABEL, AR_DOC_LABEL_EN, DOC_COLOR,
} from '@/accounting-lib/types';
import type { BankAccount, DocumentItem, PartySnapshot } from '@/accounting-lib/types';

export interface PrintableDoc {
  doc_type: string;
  doc_no: string | null;
  doc_date: string;
  due_date?: string | null;
  valid_until?: string | null;
  company_snapshot: PartySnapshot | null;
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
function labelEn(t: string) {
  return (AR_DOC_LABEL_EN as Record<string, string>)[t] ?? (AP_DOC_LABEL_EN as Record<string, string>)[t] ?? '';
}


function PartyBlock({ label, party }: { label: string; party: PartySnapshot | null }) {
  if (!party) return <div className="text-[11px] text-slate-400">— ยังไม่ได้เลือก{label} —</div>;
  return (
    <div className="text-[11px] leading-[1.6]">
      <div className="font-semibold mb-0.5">{label}</div>
      <div className="font-medium">
        {party.name}
        {party.branch_label && <span className="font-normal"> ({party.branch_label})</span>}
      </div>
      {party.address && <div className="whitespace-pre-line">{party.address}</div>}
      {party.tax_id && <div>เลขประจำตัวผู้เสียภาษี {party.tax_id}</div>}
      {party.phone && <div>โทร. {party.phone}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// การตัดหน้า
//
// เดิมนับ "จำนวนบรรทัด" ต่อหน้าแบบตายตัว ซึ่งเดาไม่ได้จริง เพราะรายละเอียดสินค้า
// เป็นข้อความหลายบรรทัดและภาษาไทยตัดคำไม่เท่ากัน เอกสารจึงล้นออกนอก A4
//
// วิธีใหม่: เรนเดอร์ทุกชิ้นลงในชั้นที่ซ่อนไว้ก่อน วัดความสูงจริงจากเบราว์เซอร์
// แล้วค่อยจัดลงหน้า จึงพอดี A4 เสมอไม่ว่ารายการจะยาวแค่ไหน
//
// กฎการจัดหน้า:
//   • หัวเอกสารซ้ำทุกหน้า (จำเป็น เพราะแต่ละแผ่นต้องอ่านได้ด้วยตัวเอง)
//   • ทุกอย่างที่เหลือขึ้นครั้งเดียว — สรุปยอด หมายเหตุ เงื่อนไข ลายเซ็น
//     ไม่มีทางซ้ำสองหน้า เพราะแต่ละชิ้นถูกจัดลงหน้าใดหน้าหนึ่งเท่านั้น
//   • ลายเซ็นและข้อมูลธนาคารอยู่ท้ายสุดเสมอ
// ---------------------------------------------------------------------------

/** px ต่อ 1 มิลลิเมตรตามมาตรฐาน CSS */
const PX_PER_MM = 96 / 25.4;
const PAGE_H_MM = 297;
const PAGE_PAD_MM = 12;
/** เผื่อไว้กันคลาดจากการวัดเศษ pixel — ยอมเสียพื้นที่นิดเดียวดีกว่าล้นหน้า */
const SAFETY_MM = 6;
const CONTENT_H = (PAGE_H_MM - PAGE_PAD_MM * 2 - SAFETY_MM) * PX_PER_MM;
/** ความกว้างเนื้อหาจริงในหน้า ใช้ให้ชั้นวัดกว้างเท่ากันเป๊ะ */
const CONTENT_W_MM = 210 - PAGE_PAD_MM * 2;

type Block =
  | { kind: 'row'; key: string; index: number }
  | { kind: 'empty'; key: string }
  | { kind: 'totals'; key: string }
  | { kind: 'text'; key: string; heading?: string; line?: string; keepWithNext?: boolean }
  | { kind: 'payment'; key: string }
  | { kind: 'sign'; key: string }
  | { kind: 'bank'; key: string };

/** แตกข้อความหลายบรรทัดเป็นชิ้นย่อย เพื่อให้ไหลข้ามหน้าได้โดยไม่ตัดกลางบรรทัด */
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

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    if (doc.items.length === 0) out.push({ kind: 'empty', key: 'empty' });
    doc.items.forEach((_, i) => out.push({ kind: 'row', key: `row-${i}`, index: i }));
    out.push({ kind: 'totals', key: 'totals' });
    out.push(...textBlocks('note', 'หมายเหตุ', doc.note_text));
    out.push(...textBlocks('terms', 'เงื่อนไข', doc.terms_text));
    if (doc.doc_type === 'INV' || doc.doc_type === 'RC') out.push({ kind: 'payment', key: 'payment' });
    out.push({ kind: 'sign', key: 'sign' });
    if (bankAccounts.length > 0) out.push({ kind: 'bank', key: 'bank' });
    return out;
  }, [doc, bankAccounts.length]);

  // วัดใหม่เมื่อเนื้อหาที่มีผลต่อความสูงเปลี่ยน
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

    const h: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>('[data-mk]').forEach((el) => {
      h[el.dataset.mk!] = el.getBoundingClientRect().height;
    });
    const headerH = h['header'] ?? 0;
    const theadH = h['thead'] ?? 0;
    if (!headerH) return;                       // ยังวัดไม่ได้ ปล่อยไว้ก่อน

    const avail = CONTENT_H - headerH;
    const out: Block[][] = [];
    let cur: Block[] = [];
    let used = 0;
    let curHasRows = false;

    const heightOf = (b: Block) => h[b.key] ?? 0;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      // แถวรายการแถวแรกของหน้าต้องเผื่อหัวตารางด้วย
      const needThead = (b.kind === 'row' || b.kind === 'empty') && !curHasRows ? theadH : 0;
      let need = needThead + heightOf(b);
      // หัวข้อห้ามค้างท้ายหน้าโดยไม่มีเนื้อหาตามมา
      if (b.kind === 'text' && b.keepWithNext && blocks[i + 1]) need += heightOf(blocks[i + 1]);

      if (used + need > avail && cur.length > 0) {
        out.push(cur);
        cur = []; used = 0; curHasRows = false;
      }
      const thead2 = (b.kind === 'row' || b.kind === 'empty') && !curHasRows ? theadH : 0;
      cur.push(b);
      used += thead2 + heightOf(b);
      if (b.kind === 'row' || b.kind === 'empty') curHasRows = true;
    }
    if (cur.length) out.push(cur);
    setPages(out);
  }, [measureKey, blocks]);

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
        <div data-mk="header"><DocHeader doc={doc} copyLabel={copyLabel} pageNo={1} totalPages={2} /></div>
        <table className="w-full text-[11px] border-collapse">
          <thead><tr data-mk="thead"><ItemHead color={color} /></tr></thead>
          <tbody>
            {doc.items.map((it, i) => (
              <ItemRow key={i} it={it} no={i + 1} vatRate={doc.vat_rate} mk={`row-${i}`} />
            ))}
            {doc.items.length === 0 && (
              <tr data-mk="empty"><td colSpan={9} className="py-6" /></tr>
            )}
          </tbody>
        </table>
        <div data-mk="totals"><TotalsBlock doc={doc} color={color} /></div>
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
        {bankAccounts.length > 0 && (
          <div data-mk="bank"><BankBlock accounts={bankAccounts} color={color} /></div>
        )}
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
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 0, height: 0,
        borderTop: `26mm solid ${color}`, borderLeft: '26mm solid transparent',
      }} />

      <DocHeader doc={doc} copyLabel={copyLabel} pageNo={pageNo} totalPages={totalPages} />

      {rowBlocks.length > 0 && (
        <table className="w-full text-[11px] border-collapse mb-3">
          <thead><tr><ItemHead color={color} /></tr></thead>
          <tbody>
            {rowBlocks.map((b) =>
              b.kind === 'row' ? (
                <ItemRow key={b.key} it={doc.items[b.index]} no={b.index + 1} vatRate={doc.vat_rate} />
              ) : (
                <tr key={b.key}>
                  <td colSpan={9} className="py-6 text-center text-slate-400">ยังไม่มีรายการ</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {rest.map((b) => {
        if (b.kind === 'totals') return <TotalsBlock key={b.key} doc={doc} color={color} />;
        if (b.kind === 'text') return <TextLine key={b.key} block={b} color={color} />;
        if (b.kind === 'payment') return <PaymentBlock key={b.key} />;
        if (b.kind === 'sign') return <SignBlock key={b.key} docType={doc.doc_type} />;
        if (b.kind === 'bank') return <BankBlock key={b.key} accounts={bankAccounts} color={color} />;
        return null;
      })}
    </div>
  );
}

function DocHeader({
  doc, copyLabel, pageNo, totalPages,
}: { doc: PrintableDoc; copyLabel?: string; pageNo: number; totalPages: number }) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const isTaxInvoice = doc.doc_type === 'INV';
  const showDue = doc.doc_type === 'BL' || doc.doc_type === 'PO';

  return (
    <>
      <div className="flex justify-between items-start mb-4 relative">
        <div className="text-[13px] font-bold leading-tight">
          {doc.company_snapshot?.name ?? '—'}
          <div className="text-[10px] font-normal text-slate-500">{labelEn(doc.doc_type)}</div>
        </div>
        <div className="text-right pr-[22mm]">
          <div className="text-[17px] font-bold" style={{ color }}>{labelTh(doc.doc_type)}</div>
          {copyLabel && <div className="text-[10px] text-slate-500">{copyLabel}</div>}
          {isTaxInvoice && copyLabel === 'ต้นฉบับ' && (
            <div className="text-[9px] text-slate-500">(เอกสารออกเป็นชุด)</div>
          )}
          {totalPages > 1 && (
            <div className="text-[9px] text-slate-400">หน้าที่ {pageNo}/{totalPages}</div>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-3">
        <div className="flex-1 flex flex-col gap-3">
          <PartyBlock label="ผู้ออกเอกสาร" party={doc.company_snapshot} />
          <PartyBlock label={doc.party_label} party={doc.party_snapshot} />
          {(doc.contact_name || doc.contact_phone) && (
            <div className="text-[11px] leading-[1.6]">
              {doc.contact_name && (
                <div><span className="text-slate-500">ผู้ติดต่อ </span>{doc.contact_name}</div>
              )}
              {doc.contact_phone && (
                <div><span className="text-slate-500">เบอร์โทร </span>{doc.contact_phone}</div>
              )}
            </div>
          )}
        </div>

        <div className="w-[75mm] text-[11px] leading-[1.7] border-l border-slate-200 pl-3">
          <Row k="เลขที่" v={doc.doc_no ?? '(ร่าง — ยังไม่ออกเลขที่)'} bold />
          <Row k="วันที่" v={docDate(doc.doc_date)} />
          {showDue && doc.due_date && <Row k="ครบกำหนด" v={docDate(doc.due_date)} />}
          {doc.doc_type === 'QT' && doc.valid_until && (
            <Row k="ยืนราคาถึง" v={docDate(doc.valid_until)} />
          )}
          {doc.sales_name && <Row k="ผู้ขาย" v={doc.sales_name} />}
          {doc.sales_phone && <Row k="เบอร์โทร" v={doc.sales_phone} />}
          {doc.reference_no && <Row k="อ้างอิง" v={doc.reference_no} />}
          {doc.customer_po_no && <Row k="เลขที่ PO" v={doc.customer_po_no} />}
          {doc.paid_on && (doc.doc_type === 'INV' || doc.doc_type === 'RC') && (
            <Row k="วันที่รับชำระ" v={docDate(doc.paid_on)} />
          )}
          {doc.job_name && <Row k="ชื่องาน" v={doc.job_name} />}
        </div>
      </div>
    </>
  );
}

function ItemHead({ color }: { color: string }) {
  return (
    <>
      <th className="py-1.5 w-[8mm] text-center font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>#</th>
      <th className="py-1.5 text-left font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>รายละเอียด</th>
      <th className="py-1.5 w-[16mm] text-right font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>จำนวน</th>
      <th className="py-1.5 w-[12mm] text-left font-semibold pl-1"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>หน่วย</th>
      <th className="py-1.5 w-[20mm] text-right font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>ราคา/หน่วย</th>
      <th className="py-1.5 w-[22mm] text-right font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>ส่วนลด/หน่วย</th>
      <th className="py-1.5 w-[20mm] text-right font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>ราคาสุทธิ/หน่วย</th>
      <th className="py-1.5 w-[12mm] text-center font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>ภาษี</th>
      <th className="py-1.5 w-[26mm] text-right font-semibold"
          style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>มูลค่า</th>
    </>
  );
}

function ItemRow({
  it, no, vatRate, mk,
}: { it: DocumentItem; no: number; vatRate: number; mk?: string }) {
  const qty = Number(it.qty) || 0;
  const disc = lineDiscount(it);
  return (
    <tr data-mk={mk} className="align-top border-b border-slate-100">
      <td className="py-1.5 text-center">{no}</td>
      {/* รายละเอียดหลายบรรทัด: ชื่อรุ่นบรรทัดแรก สเปกย่อยบรรทัดถัดไป */}
      <td className="py-1.5 whitespace-pre-line pr-2">{it.description}</td>
      <td className="py-1.5 text-right tabular-nums">{money(it.qty).replace('.00', '')}</td>
      <td className="py-1.5 pl-1">{it.unit ?? ''}</td>
      <td className="py-1.5 text-right tabular-nums">{money(it.unit_price)}</td>
      <td className="py-1.5 text-right tabular-nums">
        {disc > 0 && (
          <>
            {qty > 0 ? money(disc / qty) : ''}
            <div className="text-[9px] text-slate-500">รวม {money(disc)}</div>
          </>
        )}
      </td>
      <td className="py-1.5 text-right tabular-nums">
        {qty > 0 ? money(it.line_total / qty) : ''}
      </td>
      <td className="py-1.5 text-center">
        {it.vat_type === 'vat' ? `${vatRate}%` : it.vat_type === 'zero' ? '0%' : 'ยกเว้น'}
      </td>
      <td className="py-1.5 text-right tabular-nums">{money(it.line_total)}</td>
    </tr>
  );
}

function TotalsBlock({ doc, color }: { doc: PrintableDoc; color: string }) {
  return (
    <>
      <div className="flex justify-end mb-2">
        <div className="w-[80mm] text-[11px]">
          <Total k="รวมเป็นเงิน" v={doc.subtotal} />
          {doc.discount_total > 0 && <Total k="ส่วนลด" v={doc.discount_total} />}
          {(doc.extra_discount ?? 0) > 0 && <Total k="ส่วนลดพิเศษ" v={doc.extra_discount ?? 0} />}
          {(doc.discount_total > 0 || (doc.extra_discount ?? 0) > 0) && (
            <Total k="จำนวนเงินหลังหักส่วนลด"
                   v={doc.subtotal - doc.discount_total - (doc.extra_discount ?? 0)} />
          )}
          {doc.billing_percent != null && doc.billing_percent > 0 && doc.billing_percent < 100 && (
            <Total k={`แบ่งชำระ ${doc.billing_percent}%`} v={doc.grand_total} bold />
          )}
          <Total k="มูลค่าที่ไม่มี/ยกเว้นภาษี" v={doc.vat_exempt_base} />
          <Total k="มูลค่าที่คำนวณภาษี" v={doc.vat_base} />
          <Total k={`ภาษีมูลค่าเพิ่ม ${doc.vat_rate}%`} v={doc.vat_amount} />
          <div className="text-[9px] text-slate-400 text-right -mt-0.5">
            {doc.price_include_vat ? '(ราคาต่อหน่วยรวมภาษีแล้ว)' : '(ราคาต่อหน่วยยังไม่รวมภาษี)'}
          </div>
          <div style={{ borderTop: `1px solid ${color}` }} className="mt-1 pt-1">
            <Total k="จำนวนเงินรวมทั้งสิ้น" v={doc.grand_total} bold />
          </div>
          <Total k="หักภาษี ณ ที่จ่ายทั้งสิ้น" v={doc.wht_amount} />
          {doc.wht_amount > 0 && doc.wht_base != null && (
            <div className="text-[9px] text-slate-500 text-right -mt-0.5">
              (จากมูลค่าก่อนภาษี {money(doc.wht_base)})
            </div>
          )}
          <Total k="ยอดชำระ" v={doc.net_payable} bold />
        </div>
      </div>
      <div className="text-[11px] italic mb-4">({bahtText(doc.net_payable)})</div>
    </>
  );
}

function TextLine({ block, color }: { block: Block; color: string }) {
  if (block.kind !== 'text') return null;
  if (block.heading) {
    return (
      <div className="text-[10px] font-semibold mt-1" style={{ color }}>{block.heading}</div>
    );
  }
  return <div className="text-[10px] leading-[1.65]">{block.line}</div>;
}

function PaymentBlock() {
  return (
    <div className="text-[10px] border-t border-slate-200 pt-2 mt-3 mb-4">
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
    <div className="flex justify-between gap-10 text-[10px] mt-8">
      <div className="flex-1 text-center">
        <div className="border-b border-slate-400 h-10" />
        <div className="mt-1">{leftSign}</div>
        <div className="text-slate-400">วันที่</div>
      </div>
      <div className="flex-1 text-center">
        <div className="border-b border-slate-400 h-10" />
        <div className="mt-1">{rightSign}</div>
        <div className="text-slate-400">วันที่</div>
      </div>
    </div>
  );
}

function BankBlock({ accounts, color }: { accounts: BankAccount[]; color: string }) {
  return (
    <div className="mt-6 pt-3 border-t border-slate-200 text-[10px]">
      <div className="font-semibold mb-1" style={{ color }}>ข้อมูลการรับชำระ</div>
      <div className="flex flex-wrap gap-4">
        {accounts.map((b) => (
          <div key={b.id} className="border border-slate-200 rounded px-3 py-1.5">
            <div className="font-medium tabular-nums">{b.account_no}</div>
            <div>ธ. {b.bank_name}{b.branch ? ` (${b.branch})` : ''}</div>
            <div className="text-slate-500">{b.account_name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[22mm] shrink-0 text-slate-500">{k}</span>
      <span className={`flex-1 ${bold ? 'font-semibold' : ''}`}>{v}</span>
    </div>
  );
}

function Total({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-slate-600">{k}</span>
      <span className="tabular-nums">{money(v)} บาท</span>
    </div>
  );
}

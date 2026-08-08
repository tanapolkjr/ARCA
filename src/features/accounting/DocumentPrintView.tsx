import { bahtText, docDate, money } from '@/accounting-lib/calc';
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
  reference_no?: string | null;
  tag_name?: string | null;
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

/**
 * หน้าเอกสารขนาด A4 ใช้ทั้งดูตัวอย่างบนจอและพิมพ์/บันทึกเป็น PDF
 *
 * ทำไมพิมพ์ผ่านเบราว์เซอร์: ระบบไม่มี server และการจัดวางสระ-วรรณยุกต์ไทย
 * ให้เบราว์เซอร์ทำถูกต้องเสมอ ต่างจาก library สร้าง PDF ฝั่ง client
 * ที่ต้องทดสอบฟอนต์ก่อนถึงจะไว้ใจได้
 */
/**
 * จำนวนบรรทัดต่อหน้า — เลือกให้พอดี A4 หลังหักหัวเอกสาร สรุปยอด และลายเซ็น
 * หน้าแรกมีบล็อกคู่ค้าจึงใส่ได้น้อยกว่าหน้าถัดไป
 */
const ROWS_FIRST_PAGE = 11;
const ROWS_NEXT_PAGE = 20;

function paginate<T>(rows: T[], first: number, rest: number): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [rows.slice(0, first)];
  let i = first;
  while (i < rows.length) {
    pages.push(rows.slice(i, i + rest));
    i += rest;
  }
  return pages;
}

/**
 * เอกสารทั้งใบ — ตัดหน้าอัตโนมัติเมื่อรายการยาวเกิน A4
 * หัวเอกสารซ้ำทุกหน้า สรุปยอดอยู่หน้าสุดท้ายของรายการ
 * ส่วนหมายเหตุ/เงื่อนไขและลายเซ็นย้ายไปหน้าถัดไปเมื่อเอกสารยาวหลายหน้า
 */
export function DocumentPrintView({
  doc, copyLabel, bankAccounts = [],
}: {
  doc: PrintableDoc;
  copyLabel?: string;
  bankAccounts?: BankAccount[];
}) {
  const chunks = paginate(doc.items, ROWS_FIRST_PAGE, ROWS_NEXT_PAGE);
  const longNotes = ((doc.note_text?.length ?? 0) + (doc.terms_text?.length ?? 0)) > 500;
  // เอกสารหลายหน้า หรือหมายเหตุยาว → แยกเงื่อนไขกับลายเซ็นไปหน้าสุดท้ายของตัวเอง
  const tailOnOwnPage = chunks.length > 1 || longNotes;
  const totalPages = chunks.length + (tailOnOwnPage ? 1 : 0);

  return (
    <>
      {chunks.map((rows, idx) => (
        <DocPage
          key={idx}
          doc={doc}
          rows={rows}
          startIndex={idx === 0 ? 0 : ROWS_FIRST_PAGE + (idx - 1) * ROWS_NEXT_PAGE}
          copyLabel={copyLabel}
          pageNo={idx + 1}
          totalPages={totalPages}
          showTotals={idx === chunks.length - 1}
          showTail={!tailOnOwnPage && idx === chunks.length - 1}
          bankAccounts={!tailOnOwnPage && idx === chunks.length - 1 ? bankAccounts : []}
        />
      ))}
      {tailOnOwnPage && (
        <DocPage
          doc={doc}
          rows={[]}
          startIndex={0}
          copyLabel={copyLabel}
          pageNo={totalPages}
          totalPages={totalPages}
          showTotals={false}
          showTail
          hideTable
          bankAccounts={bankAccounts}
        />
      )}
    </>
  );
}

function DocPage({
  doc, rows, startIndex, copyLabel, pageNo, totalPages,
  showTotals, showTail, hideTable, bankAccounts = [],
}: {
  doc: PrintableDoc;
  rows: DocumentItem[];
  startIndex: number;
  copyLabel?: string;
  pageNo: number;
  totalPages: number;
  showTotals: boolean;
  showTail: boolean;
  hideTable?: boolean;
  bankAccounts?: BankAccount[];
}) {
  const color = DOC_COLOR[doc.doc_type] ?? '#5C6B7A';
  const [leftSign, rightSign] = SIGN_LABELS[doc.doc_type] ?? ['ผู้รับเอกสาร', 'ผู้มีอำนาจลงนาม'];
  const isTaxInvoice = doc.doc_type === 'INV';
  const showDue = doc.doc_type === 'BL' || doc.doc_type === 'PO';

  return (
    <div className="doc-page bg-white text-slate-900" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}>
      {/* แถบสีมุมขวาบน ตามประเภทเอกสาร */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 0, height: 0,
        borderTop: `26mm solid ${color}`, borderLeft: '26mm solid transparent',
      }} />

      <div className="flex justify-between items-start mb-4 relative">
        <div className="text-[13px] font-bold leading-tight">
          {doc.company_snapshot?.name ?? '—'}
          <div className="text-[10px] font-normal text-slate-500">
            {labelEn(doc.doc_type)}
          </div>
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
        </div>

        <div className="w-[75mm] text-[11px] leading-[1.7] border-l border-slate-200 pl-3">
          <Row k="เลขที่" v={doc.doc_no ?? '(ร่าง — ยังไม่ออกเลขที่)'} bold />
          <Row k="วันที่" v={docDate(doc.doc_date)} />
          {showDue && doc.due_date && <Row k="ครบกำหนด" v={docDate(doc.due_date)} />}
          {doc.doc_type === 'QT' && doc.valid_until && (
            <Row k="ยืนราคาถึง" v={docDate(doc.valid_until)} />
          )}
          {doc.sales_name && <Row k="ผู้ขาย" v={doc.sales_name} />}
          {doc.reference_no && <Row k="อ้างอิง" v={doc.reference_no} />}
          {doc.tag_name && <Row k="ประเภทงาน" v={doc.tag_name} />}
          {doc.job_name && <Row k="ชื่องาน" v={doc.job_name} />}
          {doc.contact_name && <Row k="ผู้ติดต่อ" v={doc.contact_name} />}
          {doc.contact_phone && <Row k="เบอร์โทร" v={doc.contact_phone} />}
        </div>
      </div>

      {!hideTable && (
      <table className="w-full text-[11px] border-collapse mb-3">
        <thead>
          <tr style={{ borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}` }}>
            <th className="py-1.5 w-[8mm] text-center font-semibold">#</th>
            <th className="py-1.5 text-left font-semibold">รายละเอียด</th>
            <th className="py-1.5 w-[18mm] text-right font-semibold">จำนวน</th>
            <th className="py-1.5 w-[16mm] text-left font-semibold pl-1">หน่วย</th>
            <th className="py-1.5 w-[24mm] text-right font-semibold">ราคาต่อหน่วย</th>
            <th className="py-1.5 w-[22mm] text-right font-semibold">ส่วนลด</th>
            <th className="py-1.5 w-[14mm] text-center font-semibold">ภาษี</th>
            <th className="py-1.5 w-[26mm] text-right font-semibold">มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, i) => (
            <tr key={i} className="align-top border-b border-slate-100">
              <td className="py-1.5 text-center">{startIndex + i + 1}</td>
              {/* รายละเอียดหลายบรรทัด: ชื่อรุ่นบรรทัดแรก สเปกย่อยบรรทัดถัดไป */}
              <td className="py-1.5 whitespace-pre-line pr-2">{it.description}</td>
              <td className="py-1.5 text-right tabular-nums">{money(it.qty).replace('.00', '')}</td>
              <td className="py-1.5 pl-1">{it.unit ?? ''}</td>
              <td className="py-1.5 text-right tabular-nums">{money(it.unit_price)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {it.discount_amount > 0 ? money(it.discount_amount) : ''}
              </td>
              <td className="py-1.5 text-center">
                {it.vat_type === 'vat' ? `${doc.vat_rate}%` : it.vat_type === 'zero' ? '0%' : 'ยกเว้น'}
              </td>
              <td className="py-1.5 text-right tabular-nums">{money(it.line_total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-slate-400">ยังไม่มีรายการ</td></tr>
          )}
        </tbody>
      </table>
      )}

      {showTotals && (<><div className="flex justify-end mb-2">
        <div className="w-[80mm] text-[11px]">
          <Total k="รวมเป็นเงิน" v={doc.subtotal} />
          {doc.discount_total > 0 && (
            <>
              <Total k="ส่วนลด" v={doc.discount_total} />
              <Total k="จำนวนเงินหลังหักส่วนลด" v={doc.subtotal - doc.discount_total} />
            </>
          )}
          {doc.billing_percent != null && doc.billing_percent > 0 && doc.billing_percent < 100 && (
            <Total k={`แบ่งชำระ ${doc.billing_percent}%`} v={doc.grand_total} bold />
          )}
          <Total k="มูลค่าที่ไม่มี/ยกเว้นภาษี" v={doc.vat_exempt_base} />
          <Total k="มูลค่าที่คำนวณภาษี" v={doc.vat_base} />
          <Total k={`ภาษีมูลค่าเพิ่ม ${doc.vat_rate}%`} v={doc.vat_amount} />
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

      <div className="text-[11px] italic mb-4">({bahtText(doc.net_payable)})</div></>)}

      {showTail && (doc.note_text || doc.terms_text) && (
        <div className="text-[10px] leading-[1.65] mb-4">
          {doc.note_text && (
            <div className="mb-2">
              <div className="font-semibold" style={{ color }}>หมายเหตุ</div>
              <div className="whitespace-pre-line">{doc.note_text}</div>
            </div>
          )}
          {doc.terms_text && (
            <div>
              <div className="font-semibold" style={{ color }}>เงื่อนไข</div>
              <div className="whitespace-pre-line">{doc.terms_text}</div>
            </div>
          )}
        </div>
      )}

      {showTail && (doc.doc_type === 'INV' || doc.doc_type === 'RC') && (
        <div className="text-[10px] border-t border-slate-200 pt-2 mb-4">
          <div className="mb-1">การชำระเงินจะสมบูรณ์เมื่อบริษัทได้รับเงินเรียบร้อยแล้ว</div>
          <div className="flex gap-5">
            {['เงินสด', 'เช็ค', 'โอนเงิน', 'บัตรเครดิต'].map((m) => (
              <span key={m}>☐ {m}</span>
            ))}
          </div>
          <div className="mt-1.5 flex gap-6">
            <span>ธนาคาร ______________</span>
            <span>เลขที่ ______________</span>
            <span>วันที่ __________</span>
            <span>จำนวนเงิน __________</span>
          </div>
        </div>
      )}

      {showTail && (
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
      )}

      {bankAccounts.length > 0 && (
        <div className="mt-6 pt-3 border-t border-slate-200 text-[10px]">
          <div className="font-semibold mb-1" style={{ color }}>ข้อมูลการรับชำระ</div>
          <div className="flex flex-wrap gap-4">
            {bankAccounts.map((b) => (
              <div key={b.id} className="border border-slate-200 rounded px-3 py-1.5">
                <div className="font-medium tabular-nums">{b.account_no}</div>
                <div>ธ. {b.bank_name}{b.branch ? ` (${b.branch})` : ''}</div>
                <div className="text-slate-500">{b.account_name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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

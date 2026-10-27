/**
 * ใบส่งของ (Delivery Note) — หน้า A4 สำหรับดูตัวอย่างและพิมพ์
 *
 * ตามหลักสากล: ไม่มีราคา · มีที่อยู่จัดส่งแยกจากที่อยู่ลูกค้า (ไม่มีข้อมูลขนส่ง — ตัดตามที่ตกลง) · จำนวน สั่ง/ส่งครั้งนี้/ค้างส่ง ·
 * ช่องสภาพสินค้าเมื่อรับ · ลงนามผู้ส่งและผู้รับ (เซ็นมือจริง) · ตราประทับลูกค้า
 *
 * การตัดหน้าใช้หลักเดียวกับเอกสารอื่น: วัดความสูงจริงก่อน หัวเอกสารซ้ำทุกหน้า
 * ส่วนท้าย (สภาพสินค้า + ลงนาม) อยู่หน้าสุดท้ายเสมอ ไม่ถูกแยกจากกัน
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArcaWordmark } from '@/components/brand/ArcaWordmark';
import { docDate } from '@/accounting-lib/calc';
import type { DeliveryNote } from '@/accounting-api/delivery';
import { totalsByUnit } from '@/accounting-lib/delivery';

export const DO_COLOR = '#0E7490';

const PX_PER_MM = 96 / 25.4;
const PAGE_PAD_MM = 14;
const CONTENT_H = (297 - PAGE_PAD_MM * 2 - 6) * PX_PER_MM;
const CONTENT_W_MM = 210 - PAGE_PAD_MM * 2;

const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US')
  : n.toLocaleString('en-US', { maximumFractionDigits: 3 }));

type Block = { kind: 'row'; key: string; index: number } | { kind: 'notes'; key: string } | { kind: 'foot'; key: string };

export function DeliveryNotePrint({
  dn, copyLabel, deliveredTotal,
}: {
  dn: DeliveryNote;
  copyLabel: string;
  /** ส่งไปแล้วสะสมถึงใบนี้ ต่อบรรทัดใบเสนอราคา — ใช้คำนวณค้างส่ง */
  deliveredTotal: Map<string, number>;
}) {
  const items = dn.items ?? [];
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);
  const [assets, setAssets] = useState(0);

  const blocks = useMemo<Block[]>(() => [
    ...items.map((_, i) => ({ kind: 'row' as const, key: `r${i}`, index: i })),
    { kind: 'notes', key: 'notes' },
    { kind: 'foot', key: 'foot' },
  ], [items]);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const measure = () => {
      const h: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>('[data-mk]').forEach((el) => { h[el.dataset.mk!] = el.getBoundingClientRect().height; });
      const avail = CONTENT_H - (h.header ?? 0);
      const out: Block[][] = [];
      let cur: Block[] = []; let used = 0; let hasRows = false;
      for (const b of blocks) {
        const extra = b.kind === 'row' && !hasRows ? (h.thead ?? 0) : 0;
        const need = extra + (h[b.key] ?? 0);
        if (used + need > avail && cur.length) { out.push(cur); cur = []; used = 0; hasRows = false; }
        cur.push(b);
        used += (b.kind === 'row' && !hasRows ? (h.thead ?? 0) : 0) + (h[b.key] ?? 0);
        if (b.kind === 'row') hasRows = true;
      }
      if (cur.length) out.push(cur);
      setPages(out);
    };
    measure();
    let cancelled = false;
    void document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [blocks, assets, dn, copyLabel]);

  const rendered = pages ?? [blocks];
  // ยอดรวมแยกตามหน่วย ("344 ชิ้น · 4 ชุด") — รวมต่างหน่วยเป็นตัวเลขเดียวไม่มีความหมาย
  const totalText = totalsByUnit(items.map((i) => ({ unit: i.unit, qty: Number(i.qty_delivered) || 0 })))
    .map((t) => `${num(t.qty)} ${t.unit}`).join(' · ');
  // ทั้งใบไม่มีรหัสสินค้าเลย (พิมพ์รายการเอง ไม่ผูกคลัง) → ซ่อนคอลัมน์ ให้รายละเอียดกว้างขึ้น
  const showCode = items.some((i) => (i.model_code ?? '').trim());

  const row = (i: number, mk?: string) => {
    const it = items[i];
    const ordered = Number(it.qty_ordered) || 0;
    const sent = it.source_ar_item_id ? deliveredTotal.get(it.source_ar_item_id) ?? Number(it.qty_delivered) : Number(it.qty_delivered);
    const backorder = Math.max(0, Math.round((ordered - sent) * 1000) / 1000);
    const [first, ...rest] = it.description.split('\n');
    return (
      <tr key={i} data-mk={mk} className="align-top border-b border-stone-100">
        <td className="py-2 text-center">{i + 1}</td>
        {showCode && <td className="py-2 pr-2 break-words">{it.model_code ?? '—'}</td>}
        <td className="py-2 pr-3">
          <div>{first}</div>
          {rest.length > 0 && <div className="text-stone-500 whitespace-pre-line">{rest.join('\n')}</div>}
        </td>
        <td className="py-2 text-right tabular-nums">{num(ordered)}</td>
        <td className="py-2 text-right tabular-nums font-semibold">{num(Number(it.qty_delivered) || 0)}</td>
        <td className="py-2 text-right tabular-nums">{num(backorder)}</td>
        <td className="py-2 text-center">{it.unit ?? ''}</td>
      </tr>
    );
  };

  return (
    <>
      {/* ชั้นวัดความสูง — ไม่แสดง ไม่พิมพ์ */}
      <div ref={measureRef} aria-hidden className="doc-page no-print text-[10.5px] leading-[1.55]"
           style={{ position: 'absolute', left: '-9999px', top: 0, width: `${CONTENT_W_MM}mm`, padding: 0 }}>
        <div data-mk="header" onLoad={() => setAssets((n) => n + 1)}>
          <Header dn={dn} copyLabel={copyLabel} pageNo={1} total={2} />
        </div>
        <table className="w-full table-fixed text-[10.5px] border-collapse">
          <Cols showCode={showCode} />
          <thead><tr data-mk="thead"><Head showCode={showCode} /></tr></thead>
          <tbody>{items.map((_, i) => row(i, `r${i}`))}</tbody>
        </table>
        <div data-mk="notes"><Notes dn={dn} total={totalText} count={items.length} /></div>
        <div data-mk="foot"><Foot senderName={dn.sender_name ?? null} /></div>
      </div>

      {rendered.map((pb, p) => {
        const rows = pb.filter((b) => b.kind === 'row') as Extract<Block, { kind: 'row' }>[];
        return (
          <div key={p} className="doc-page bg-white text-stone-900 text-[10.5px] leading-[1.55]"
               style={{ width: '210mm', height: '297mm', padding: `${PAGE_PAD_MM}mm`, overflow: 'hidden' }}>
            <Header dn={dn} copyLabel={copyLabel} pageNo={p + 1} total={rendered.length} />
            {rows.length > 0 && (
              <table className="w-full table-fixed text-[10.5px] border-collapse">
                <Cols showCode={showCode} />
                <thead><tr><Head showCode={showCode} /></tr></thead>
                <tbody>{rows.map((b) => row(b.index))}</tbody>
              </table>
            )}
            {pb.some((b) => b.kind === 'notes') && <Notes dn={dn} total={totalText} count={items.length} />}
            {pb.some((b) => b.kind === 'foot') && <Foot senderName={dn.sender_name ?? null} />}
          </div>
        );
      })}
    </>
  );
}

function Cols({ showCode }: { showCode: boolean }) {
  return (
    <colgroup>
      <col style={{ width: '10mm' }} />{showCode && <col style={{ width: '28mm' }} />}<col />
      <col style={{ width: '16mm' }} /><col style={{ width: '18mm' }} /><col style={{ width: '16mm' }} />
      <col style={{ width: '14mm' }} />
    </colgroup>
  );
}

function Head({ showCode }: { showCode: boolean }) {
  const st = { color: DO_COLOR, borderTop: `1.5px solid ${DO_COLOR}`, borderBottom: `1.5px solid ${DO_COLOR}` };
  const c = 'py-2 font-semibold';
  return (
    <>
      <th className={`${c} text-center`} style={st}>ลำดับ</th>
      {showCode && <th className={`${c} text-center`} style={st}>รหัสสินค้า</th>}
      <th className={`${c} text-center`} style={st}>รายละเอียด</th>
      <th className={`${c} text-right`} style={st}>สั่งซื้อ</th>
      <th className={`${c} text-right`} style={st}>ส่งครั้งนี้</th>
      <th className={`${c} text-right`} style={st}>ค้างส่ง</th>
      <th className={`${c} text-center`} style={st}>หน่วย</th>
    </>
  );
}

function Header({ dn, copyLabel, pageNo, total }: { dn: DeliveryNote; copyLabel: string; pageNo: number; total: number }) {
  const co = dn.company_snapshot;
  const cu = dn.customer_snapshot;
  const kv = (k: string, v: React.ReactNode, bold = false) => (
    <div className="flex gap-2"><span className="w-[25mm] shrink-0 text-stone-500">{k}</span>
      <span className={bold ? 'font-semibold' : ''}>{v}</span></div>
  );
  return (
    <div className="pb-3">
      <div className="flex justify-between items-center gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <ArcaWordmark className="w-[34mm] shrink-0" />
          <div className="text-[10px] leading-[1.55] min-w-0">
            <div className="text-[13px] font-bold leading-tight">{co?.name ?? '—'}</div>
            {co?.name_en && <div>{co.name_en}</div>}
            {co?.address && <div className="whitespace-pre-line">{co.address}</div>}
            <div>
              เลขประจำตัวผู้เสียภาษี {co?.tax_id || '-'}
              {co?.phone && <span className="ml-5">โทร. {co.phone}</span>}
              {dn.company?.email && <span className="ml-5">E-mail {dn.company.email}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[24px] font-bold leading-none" style={{ color: DO_COLOR }}>ใบส่งของ</div>
          <div className="text-[10px] font-semibold tracking-[0.08em] mt-1" style={{ color: DO_COLOR }}>DELIVERY NOTE</div>
          <div className="text-[9px] text-stone-500 mt-1">{copyLabel} · หน้าที่ {pageNo}/{total}</div>
          {dn.status === 'cancelled' && <div className="text-[11px] font-bold text-rose-600 mt-1">ยกเลิกแล้ว</div>}
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <div className="flex-1 rounded-md border border-stone-200 px-3 py-2 min-w-0">
          <div className="font-semibold text-[10.5px]">ลูกค้า / Bill to</div>
          <div className="font-semibold">{cu?.name ?? '—'}{cu?.branch_label ? ` (${cu.branch_label})` : ''}</div>
          {cu?.tax_id && <div>เลขประจำตัวผู้เสียภาษี {cu.tax_id}</div>}
          {cu?.address && <div className="whitespace-pre-line">{cu.address}</div>}
        </div>
        <div className="flex-1 rounded-md border border-stone-200 px-3 py-2 min-w-0">
          <div className="font-semibold text-[10.5px]">สถานที่จัดส่ง / Ship to</div>
          {dn.ship_to_name && <div className="font-semibold">{dn.ship_to_name}</div>}
          {dn.ship_to_address && <div className="whitespace-pre-line">{dn.ship_to_address}</div>}
          <div>ผู้รับหน้างาน {dn.receiver_name || '-'}<span className="ml-3">โทร. {dn.receiver_phone || '-'}</span></div>
        </div>
        <div className="w-[64mm] shrink-0 leading-[1.75]">
          {kv('เลขที่', dn.doc_no, true)}
          {kv('วันที่ส่ง', docDate(dn.doc_date))}
          {kv('อ้างอิงใบเสนอราคา', dn.quotation?.doc_no ?? '—')}
          {dn.quotation?.customer_po_no && kv('เลขที่ PO ลูกค้า', dn.quotation.customer_po_no)}
          {kv('การส่ง', `ครั้งที่ ${dn.delivery_seq}`)}
          {dn.coordinator_name && kv('ผู้ประสานงาน', <>{dn.coordinator_name}{dn.coordinator_phone && <span className="ml-2">{dn.coordinator_phone}</span>}</>)}
        </div>
      </div>

      {dn.job_name && (
        <div className="flex gap-2 mt-3"><span className="w-[25mm] shrink-0 text-stone-500">ชื่องาน</span><span>{dn.job_name}</span></div>
      )}
    </div>
  );
}

function Notes({ dn, total, count }: { dn: DeliveryNote; total: string; count: number }) {
  return (
    <div className="pt-2">
      <div className="flex justify-end gap-8 py-2 border-b border-stone-200">
        <span className="font-semibold">รวมส่งครั้งนี้</span>
        <span className="tabular-nums font-bold text-right">{total || '—'}</span>
        <span className="w-[30mm] text-right">{count} รายการ</span>
      </div>
      <div className="pt-3">
        <div className="font-semibold" style={{ color: DO_COLOR }}>หมายเหตุ</div>
        {dn.note_text && dn.note_text.split('\n').filter((l) => l.trim()).map((l, i) => <div key={i} className="pl-1">· {l}</div>)}
        <div className="pl-1">· กรุณาตรวจนับจำนวนและสภาพสินค้าก่อนลงนามรับ หากพบสินค้าไม่ครบหรือเสียหาย ให้ระบุในช่องด้านล่างก่อนลงนาม</div>
        <div className="pl-1">· การแจ้งสินค้าเสียหายหลังลงนามรับ ต้องแจ้งภายใน 3 วัน พร้อมรูปถ่าย</div>
        <div className="pl-1">· เอกสารนี้ไม่ใช่ใบกำกับภาษี / ใบเสร็จรับเงิน</div>
      </div>
    </div>
  );
}

function Foot({ senderName }: { senderName: string | null }) {
  const box = <span className="inline-block w-[9px] h-[9px] border border-stone-600 mr-1 align-[-1px]" />;
  return (
    <div className="pt-4">
      <div className="rounded-md border border-stone-200 px-3 py-2">
        <b>สภาพสินค้าเมื่อรับ</b>
        <span className="ml-4">{box}ครบถ้วน สภาพเรียบร้อย</span>
        <span className="ml-4">{box}ไม่ครบ / เสียหาย ระบุ ________________________________________</span>
      </div>
      <div className="mt-2">ได้รับสินค้าตามรายการข้างต้นไว้ถูกต้องเรียบร้อยแล้ว</div>
      <div className="flex gap-7 mt-2 items-start">
        {[['ผู้ส่งสินค้า', 'Delivered by', false], ['ผู้รับสินค้า', 'Received by', true]].map(([th, en, name]) => (
          <div key={th as string} className="flex-1 text-center">
            <div className="border-b border-stone-400 h-[15mm]" />
            <div className="mt-1 font-semibold">{th}</div>
            {/* ผู้ส่งเลือกจากระบบ → พิมพ์ชื่อให้ · ผู้รับเขียนชื่อตัวบรรจงเอง */}
            {!name && senderName && <div>({senderName})</div>}
            <div className="text-[9px] text-stone-500">{en}{name ? ' · ชื่อตัวบรรจง ______________________' : ''}</div>
            <div className="mt-2">วันที่ ____/____/______ เวลา ______</div>
          </div>
        ))}
        <div className="w-[24mm] h-[24mm] mt-[2mm] rounded-full border border-dashed border-stone-400 flex items-center justify-center text-center text-[8.5px] text-stone-400 shrink-0">
          ตราประทับ<br />ลูกค้า (ถ้ามี)
        </div>
      </div>
    </div>
  );
}

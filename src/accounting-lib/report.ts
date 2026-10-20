/**
 * รายงานผู้บริหาร (Module Report) — สูตรคำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * นิยามที่ตกลงกับเจ้าของ (ยอดก่อน VAT ทั้งหมด):
 *
 *   ขายได้       = ใบเสนอราคาที่อนุมัติแล้ว และมีเอกสารวางบิลออกไปแล้วอย่างน้อย 1 ใบ
 *                  นับมูลค่าเต็มของใบเสนอราคา · ช่วงเวลาตามวันที่อนุมัติ
 *   วางบิลแล้ว    = ยอดเอกสารวางบิลที่ออกแล้ว · ช่วงเวลาตามวันที่เอกสาร
 *   รายได้ / เก็บได้ = ยอดที่ลูกค้าชำระกลับมาแล้วบนเอกสารวางบิล · ช่วงเวลาตามวันที่รับเงิน
 *   ค้างรับ       = เอกสารวางบิลที่ออกแล้ว ยอดยังรับไม่ครบ ณ วันนี้ (ไม่ขึ้นกับช่วงเวลา)
 *
 * "เอกสารวางบิล" = ใบแจ้งหนี้ (BL) และใบกำกับ/ใบเสร็จ (INV/RC) ที่ไม่ได้ออกต่อจากใบแจ้งหนี้
 * ใบกำกับที่ออกต่อจากใบแจ้งหนี้คือ "ใบรับเงิน" ของใบแจ้งหนี้นั้น — นับซ้ำไม่ได้
 * (ตอนออก ระบบตัดยอดใบแจ้งหนี้ต้นทางให้อยู่แล้ว เงินจึงไปโผล่ที่ใบแจ้งหนี้)
 *
 * ยอดก่อน VAT ของเงินที่รับ = เงินที่ตัดหนี้ × (ยอดก่อน VAT ÷ ยอดรวม VAT ของใบนั้น)
 */

export interface RDoc {
  id: string;
  doc_type: string;
  doc_no: string | null;
  doc_date: string;
  due_date: string | null;
  status: string;
  source_document_id: string | null;
  customer_id: string | null;
  customer_name: string;
  job_name: string | null;
  grand_total: number;
  vat_amount: number;
  paid_amount: number;
  approved_at: string | null;
  lead_source_id: string | null;
}
export interface RItem { document_id: string; line_total: number; category: string | null; model: string }
export interface RAlloc { document_id: string; amount: number; payment_date: string }
export interface RSource { id: string; name: string }

export interface Period { from: string | null; to: string | null } // วันที่แบบ YYYY-MM-DD, null = ไม่จำกัด

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inP = (d: string | null | undefined, p: Period) =>
  !!d && (!p.from || d >= p.from) && (!p.to || d <= p.to);
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round(part / whole * 1000) / 10 : 0);
const live = (d: RDoc) => d.status !== 'draft' && d.status !== 'cancelled';

export function exVat(d: RDoc) { return r2((Number(d.grand_total) || 0) - (Number(d.vat_amount) || 0)); }
function exRatio(d: RDoc) {
  const g = Number(d.grand_total) || 0;
  return g > 0 ? exVat(d) / g : 0;
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export type Bucket = 'over' | 'soon' | 'later' | 'nodue';

export interface ChainDoc {
  id: string; doc_type: string; doc_no: string | null; doc_date: string; due_date: string | null;
  status: string; amount: number; collected: number; outstanding: number;
}
export interface QtRow {
  id: string; doc_no: string | null; customer: string; job: string | null; approved: string;
  sold: number; billed: number; collected: number; chain: ChainDoc[];
}
export interface ArRow {
  id: string; doc_type: string; doc_no: string | null; customer: string; job: string | null;
  qt_id: string | null; qt_no: string | null; due_date: string | null; bucket: Bucket; days: number | null;
  outstanding: number; status: string; paid_any: boolean;
}
export interface Slice { key: string; name: string; amount: number; pct: number; qts: { id: string; doc_no: string | null; customer: string; job: string | null; amount: number }[]; subs: { name: string; amount: number; pct: number }[] }

export interface Report {
  revenue: number;                 // เก็บได้ (ก่อน VAT) ในช่วง
  revenueAllTime: number;
  revenueCount: number;            // จำนวนใบที่มีเงินเข้าในช่วง
  monthly: { month: string; amount: number }[]; // YYYY-MM ในช่วง (หรือ 12 เดือนล่าสุดถ้าไม่จำกัด)
  sold: number; soldCount: number;
  billed: number; billedCount: number;
  collected: number;
  unbilledOfSold: number;          // ขายได้แล้วแต่ยังไม่ได้วางบิลส่วนที่เหลือ (ของใบที่ขายได้ในช่วง)
  /** ของใบเสนอราคาที่ขายได้ในช่วง: วางบิลไปแล้วเท่าไร เก็บได้แล้วเท่าไร (นับถึงวันนี้) */
  soldBilled: number; soldCollected: number;
  qtRows: QtRow[];
  ar: { rows: ArRow[]; total: number; byBucket: Record<Bucket, { count: number; amount: number }> };
  byProduct: Slice[]; byCustomer: Slice[]; bySource: Slice[];
}

export function buildReport(
  docs: RDoc[], items: RItem[], allocs: RAlloc[], sources: RSource[], period: Period, today: string,
): Report {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const isBilling = (d: RDoc) => {
    if (!live(d)) return false;
    if (d.doc_type === 'BL') return true;
    if (d.doc_type === 'INV' || d.doc_type === 'RC') {
      const src = d.source_document_id ? byId.get(d.source_document_id) : undefined;
      return !src || src.doc_type !== 'BL';
    }
    return false;
  };
  const billing = docs.filter(isBilling);
  const qtOf = (d: RDoc) => {
    const src = d.source_document_id ? byId.get(d.source_document_id) : undefined;
    return src && src.doc_type === 'QT' ? src : null;
  };

  // เงินที่รับต่อใบ (ก่อน VAT)
  const allocByDoc = new Map<string, RAlloc[]>();
  for (const a of allocs) {
    const list = allocByDoc.get(a.document_id) ?? [];
    list.push(a); allocByDoc.set(a.document_id, list);
  }
  const billingIds = new Set(billing.map((d) => d.id));
  const exAlloc = (a: RAlloc) => {
    const d = byId.get(a.document_id);
    return d ? (Number(a.amount) || 0) * exRatio(d) : 0;
  };

  // ---------------- รายได้ / เก็บได้
  let revenue = 0, revenueAllTime = 0;
  const docsWithMoney = new Set<string>();
  const monthMap = new Map<string, number>();
  for (const a of allocs) {
    if (!billingIds.has(a.document_id)) continue;
    const v = exAlloc(a);
    revenueAllTime += v;
    if (inP(a.payment_date, period)) {
      revenue += v; docsWithMoney.add(a.document_id);
    }
    const m = a.payment_date.slice(0, 7);
    monthMap.set(m, (monthMap.get(m) ?? 0) + v);
  }
  const monthly = monthsFor(period, today).map((m) => ({ month: m, amount: r2(monthMap.get(m) ?? 0) }));

  // ---------------- ขายได้
  const childrenByQt = new Map<string, RDoc[]>();
  for (const b of billing) {
    const q = qtOf(b);
    if (!q) continue;
    const list = childrenByQt.get(q.id) ?? [];
    list.push(b); childrenByQt.set(q.id, list);
  }
  const approvedDate = (q: RDoc) => (q.approved_at ? q.approved_at.slice(0, 10) : q.doc_date);
  const soldQts = docs.filter((q) =>
    q.doc_type === 'QT' && live(q) && (childrenByQt.get(q.id)?.length ?? 0) > 0 && inP(approvedDate(q), period));

  const qtRows: QtRow[] = soldQts.map((q) => {
    const chain = (childrenByQt.get(q.id) ?? []).slice().sort((a, b) => a.doc_date.localeCompare(b.doc_date))
      .map((c) => {
        const collected = (allocByDoc.get(c.id) ?? []).reduce((s, a) => s + exAlloc(a), 0);
        return {
          id: c.id, doc_type: c.doc_type, doc_no: c.doc_no, doc_date: c.doc_date, due_date: c.due_date,
          status: c.status, amount: exVat(c), collected: r2(collected),
          outstanding: r2(Math.max(0, (Number(c.grand_total) || 0) - (Number(c.paid_amount) || 0)) * exRatio(c)),
        };
      });
    return {
      id: q.id, doc_no: q.doc_no, customer: q.customer_name, job: q.job_name, approved: approvedDate(q),
      sold: exVat(q), billed: r2(chain.reduce((s, c) => s + c.amount, 0)),
      collected: r2(chain.reduce((s, c) => s + c.collected, 0)), chain,
    };
  });
  const sold = r2(qtRows.reduce((s, r) => s + r.sold, 0));
  const unbilledOfSold = r2(qtRows.reduce((s, r) => s + Math.max(0, r.sold - r.billed), 0));

  // ---------------- วางบิลแล้ว (ตามวันที่เอกสารในช่วง)
  const billedInP = billing.filter((b) => inP(b.doc_date, period));
  const billed = r2(billedInP.reduce((s, b) => s + exVat(b), 0));

  // ---------------- ค้างรับ ณ วันนี้
  const byBucket: Record<Bucket, { count: number; amount: number }> = {
    over: { count: 0, amount: 0 }, soon: { count: 0, amount: 0 },
    later: { count: 0, amount: 0 }, nodue: { count: 0, amount: 0 },
  };
  const arRows: ArRow[] = [];
  for (const b of billing) {
    const owe = (Number(b.grand_total) || 0) - (Number(b.paid_amount) || 0);
    if (owe <= 0.005) continue;
    const outstanding = r2(owe * exRatio(b));
    let bucket: Bucket = 'nodue'; let days: number | null = null;
    if (b.due_date) {
      days = daysBetween(today, b.due_date); // บวก = อีกกี่วัน, ลบ = เกินมาแล้ว
      bucket = days < 0 ? 'over' : days <= 7 ? 'soon' : 'later';
    }
    const q = qtOf(b);
    arRows.push({
      id: b.id, doc_type: b.doc_type, doc_no: b.doc_no, customer: b.customer_name, job: b.job_name,
      qt_id: q?.id ?? null, qt_no: q?.doc_no ?? null, due_date: b.due_date, bucket, days,
      outstanding, status: b.status, paid_any: (Number(b.paid_amount) || 0) > 0,
    });
    byBucket[bucket].count++; byBucket[bucket].amount = r2(byBucket[bucket].amount + outstanding);
  }
  const order: Record<Bucket, number> = { over: 0, soon: 1, later: 2, nodue: 3 };
  arRows.sort((a, b) => order[a.bucket] - order[b.bucket] || (a.days ?? 9e9) - (b.days ?? 9e9));

  // ---------------- แยกตามมิติ (จากใบที่ขายได้ในช่วง)
  // กระจายยอดก่อน VAT ของใบเสนอราคาลงแต่ละบรรทัดตามสัดส่วนมูลค่าบรรทัด
  // (รองรับใบแบบรวม VAT และส่วนลดท้ายบิลได้ในตัว ผลรวมทุกบรรทัด = ยอดใบพอดี)
  const itemsByDoc = new Map<string, RItem[]>();
  for (const it of items) {
    const list = itemsByDoc.get(it.document_id) ?? [];
    list.push(it); itemsByDoc.set(it.document_id, list);
  }
  const srcName = new Map(sources.map((s) => [s.id, s.name]));
  type Acc = { name: string; amount: number; qts: Map<string, number>; subs: Map<string, number> };
  const P = new Map<string, Acc>(), C = new Map<string, Acc>(), S = new Map<string, Acc>();
  const add = (m: Map<string, Acc>, key: string, name: string, qtId: string, sub: string, v: number) => {
    const a = m.get(key) ?? { name, amount: 0, qts: new Map(), subs: new Map() };
    a.amount += v;
    a.qts.set(qtId, (a.qts.get(qtId) ?? 0) + v);
    a.subs.set(sub, (a.subs.get(sub) ?? 0) + v);
    m.set(key, a);
  };
  const qById = new Map(soldQts.map((q) => [q.id, q]));
  for (const q of soldQts) {
    const total = exVat(q);
    const lines = itemsByDoc.get(q.id) ?? [];
    const sumLines = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
    const customerKey = q.customer_id ?? 'none:' + q.customer_name;
    const sourceKey = q.lead_source_id ?? 'none';
    const sourceName = q.lead_source_id ? (srcName.get(q.lead_source_id) ?? 'ไม่ระบุ') : 'ไม่ระบุ';
    add(S, sourceKey, sourceName, q.id, q.customer_name, total);
    if (sumLines <= 0) {
      add(P, 'none', 'ไม่ระบุหมวด', q.id, 'ไม่มีรายการ', total);
      add(C, customerKey, q.customer_name, q.id, 'ไม่ระบุหมวด', total);
      continue;
    }
    for (const l of lines) {
      const v = total * (Number(l.line_total) || 0) / sumLines;
      if (v === 0) continue;
      const cat = (l.category ?? '').trim() || 'ไม่ระบุหมวด';
      add(P, cat, cat, q.id, l.model, v);
      add(C, customerKey, q.customer_name, q.id, cat, v);
    }
  }
  const toSlices = (m: Map<string, Acc>): Slice[] => [...m.entries()]
    .map(([key, a]) => ({
      key, name: a.name, amount: r2(a.amount), pct: pct(a.amount, sold),
      qts: [...a.qts.entries()].sort((x, y) => y[1] - x[1]).map(([id, v]) => {
        const q = qById.get(id)!;
        return { id, doc_no: q.doc_no, customer: q.customer_name, job: q.job_name, amount: r2(v) };
      }),
      subs: [...a.subs.entries()].sort((x, y) => y[1] - x[1])
        .map(([name, v]) => ({ name, amount: r2(v), pct: pct(v, a.amount) })),
    }))
    .sort((x, y) => y.amount - x.amount);

  return {
    revenue: r2(revenue), revenueAllTime: r2(revenueAllTime), revenueCount: docsWithMoney.size, monthly,
    sold, soldCount: soldQts.length, billed, billedCount: billedInP.length,
    collected: r2(revenue), unbilledOfSold,
    soldBilled: r2(qtRows.reduce((s, r) => s + r.billed, 0)),
    soldCollected: r2(qtRows.reduce((s, r) => s + r.collected, 0)), qtRows: qtRows.sort((a, b) => (b.sold - b.collected) - (a.sold - a.collected)),
    ar: { rows: arRows, total: r2(arRows.reduce((s, r) => s + r.outstanding, 0)), byBucket },
    byProduct: toSlices(P), byCustomer: toSlices(C), bySource: toSlices(S),
  };
}

/** เดือนที่แสดงในกราฟ: ตามช่วงที่เลือก (สูงสุด 24 เดือน) หรือ 12 เดือนล่าสุดถ้าไม่จำกัดช่วง */
export function monthsFor(p: Period, today: string): string[] {
  const end = (p.to && p.to < today ? p.to : today).slice(0, 7);
  let start: string;
  if (p.from) start = p.from.slice(0, 7);
  else {
    const [y, m] = end.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - 11, 1));
    start = d.toISOString().slice(0, 7);
  }
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  while (out.length < 24) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    out.push(key);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function periodOf(mode: 'all' | 'year' | 'month', year: number, month: number): Period {
  if (mode === 'all') return { from: null, to: null };
  if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` };
}

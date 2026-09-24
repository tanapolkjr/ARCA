import { supabase } from "../lib/supabaseClient.js";

const OVERDUE_TICKET_FALLBACK_DAYS = 3; // used only when a ticket has no appointment_date set yet
const OVERDUE_PR_DAYS = 5;

function daysAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Pulls real overdue items across Project / Ticket / PM Request / Purchase
 * Request.
 *
 * Tickets and PM Requests are checked against their actual due-date field
 * (appointment_date / needed_at) — this was missing entirely before, which
 * is why nothing overdue on those ever showed up on the Dashboard. Tickets
 * without an appointment set yet fall back to a generic days-since-reported
 * heuristic (no per-company SLA config exists yet in the schema).
 */
export async function getOverdueItems() {
  const items = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, ticket_code, status, reported_at, appointment_date")
    .not("status", "in", "(ปิดงานแล้ว,ยกเลิกรายการ)");
  (tickets || []).forEach((t) => {
    if (t.appointment_date) {
      if (t.appointment_date < todayStr) {
        const d = daysAgo(t.appointment_date);
        items.push({ type: "Ticket", id: t.id, code: t.ticket_code, label: `เลยวันนัดหมายมา ${d} วัน`, severity: d > 2 ? "rose" : "amber" });
      }
    } else {
      const d = daysAgo(t.reported_at);
      if (d >= OVERDUE_TICKET_FALLBACK_DAYS) {
        items.push({ type: "Ticket", id: t.id, code: t.ticket_code, label: `ยังไม่นัดหมาย เกิน ${d} วันจากที่แจ้ง`, severity: "rose" });
      }
    }
  });

  const { data: pmRequests } = await supabase
    .from("pm_requests")
    .select("id, request_code, status, needed_at")
    .not("status", "in", "(เสร็จสิ้น,ยกเลิก)")
    .not("needed_at", "is", null);
  (pmRequests || []).forEach((r) => {
    if (new Date(r.needed_at) < new Date()) {
      const d = daysAgo(r.needed_at);
      items.push({ type: "PM Request", id: r.id, code: r.request_code, label: `เลยวันที่ต้องการใช้มา ${d} วัน`, severity: d > 2 ? "rose" : "amber" });
    }
  });

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_number, status, delivery_due")
    .not("status", "in", "(Installation Completed,Cancelled)")
    .not("delivery_due", "is", null);
  (projects || []).forEach((p) => {
    const d = daysAgo(p.delivery_due);
    if (d > 0) {
      items.push({ type: "Project", id: p.id, code: p.project_number, label: `เลยกำหนดส่งมอบ ${d} วัน`, severity: d > 3 ? "rose" : "amber" });
    }
  });

  const { data: prs } = await supabase
    .from("purchase_requests")
    .select("id, request_no, status, requested_at")
    .eq("status", "รออนุมัติ");
  (prs || []).forEach((p) => {
    const d = daysAgo(p.requested_at);
    if (d >= OVERDUE_PR_DAYS) {
      items.push({ type: "ใบขอซื้อ", id: p.id, code: p.request_no, label: `ค้างอนุมัติ ${d} วัน`, severity: "rose" });
    }
  });

  return items;
}

/**
 * Unfinished PM Requests (ไม่รวม เสร็จสิ้น/ยกเลิก) grouped by request type
 * for the Dashboard: the three main types get their own bucket, everything
 * else rolls into "อื่นๆ". Items come back sorted by needed_at ascending
 * (nearest due date first, no-due-date last) so the panel can list them in
 * urgency order.
 */
export const PM_DASHBOARD_MAIN_TYPES = ["ขอสำรวจหน้างาน", "ขอออกแบบระบบ", "ขอทดสอบสินค้า"];

export async function getPendingPMRequestsByType() {
  const { data, error } = await supabase
    .from("pm_requests")
    .select("id, request_code, request_type, needed_at, status")
    .not("status", "in", "(เสร็จสิ้น,ยกเลิก)");
  if (error) throw error;

  const rows = (data || []).slice().sort((a, b) => {
    if (!a.needed_at && !b.needed_at) return 0;
    if (!a.needed_at) return 1; // no due date sinks to the bottom
    if (!b.needed_at) return -1;
    return new Date(a.needed_at) - new Date(b.needed_at);
  });

  const counts = { "อื่นๆ": 0 };
  PM_DASHBOARD_MAIN_TYPES.forEach((t) => { counts[t] = 0; });
  rows.forEach((r) => {
    const bucket = PM_DASHBOARD_MAIN_TYPES.includes(r.request_type) ? r.request_type : "อื่นๆ";
    counts[bucket] += 1;
  });

  return { counts, items: rows, total: rows.length };
}

export async function getWarrantyStats() {
  const { data, error } = await supabase.from("project_device_detail").select("start_date, warranty_months");
  if (error) throw error;
  if (!data || data.length === 0) return { inWarrantyPct: 0, outWarrantyPct: 0, total: 0 };

  const now = new Date();
  let inWarranty = 0;
  data.forEach((r) => {
    const end = new Date(r.start_date);
    end.setMonth(end.getMonth() + (r.warranty_months || 0));
    if (now <= end) inWarranty++;
  });
  const total = data.length;
  const inPct = Math.round((inWarranty / total) * 100);
  return { inWarrantyPct: inPct, outWarrantyPct: 100 - inPct, total };
}

// ---------------------------------------------------------------------------
// ตัวเลขฝั่งขายและคลังสำหรับหน้า Dashboard
//
// ทั้งสามฟังก์ชันอ่านอย่างเดียว ไม่แตะสูตรคำนวณของโมดูลบัญชี — ยอดที่ใช้คือ
// grand_total / paid_amount ที่ saveArDocument คำนวณและแช่ไว้ในเอกสารแล้ว
// ---------------------------------------------------------------------------

/**
 * มูลค่าใบเสนอราคาที่เสนอออกไป แยกตามหมวดสินค้า (Tag ประเภทงาน)
 *
 * นับเฉพาะใบที่ยังไม่ถูกยกเลิก เพราะใบที่ยกเลิกแล้วไม่ใช่ข้อเสนอที่ยังอยู่บนโต๊ะ
 * ใบที่ไม่ได้ติด Tag รวมไว้ใต้ "ไม่ระบุหมวด" แทนที่จะถูกตัดทิ้งเงียบๆ —
 * ยอดรวมบนการ์ดจึงตรงกับยอดรวมในหน้าใบเสนอราคาเสมอ
 */
export async function getQuotationsByCategory({ from, to } = {}) {
  let q = supabase
    .from("ar_documents")
    .select("id, grand_total, status, tag:document_tags(id, name, color)")
    .eq("doc_type", "QT")
    .neq("status", "cancelled");
  if (from) q = q.gte("doc_date", from);
  if (to) q = q.lte("doc_date", to);

  const { data, error } = await q;
  if (error) throw error;

  const byCat = new Map();
  let total = 0;
  let count = 0;
  (data ?? []).forEach((d) => {
    const name = d.tag?.name || "ไม่ระบุหมวด";
    const amount = Number(d.grand_total) || 0;
    const cur = byCat.get(name) ?? { name, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    byCat.set(name, cur);
    total += amount;
    count += 1;
  });

  const categories = [...byCat.values()].sort((a, b) => b.amount - a.amount);
  // สัดส่วนคิดจากยอดรวม ใช้วาดแถบเทียบสายตา
  categories.forEach((c) => { c.share = total > 0 ? c.amount / total : 0; });
  return { categories, total, count };
}

/**
 * ใบแจ้งหนี้/ใบกำกับที่ออกไปแล้วแต่ยังเก็บเงินไม่ครบ
 *
 * "ค้างชำระ" = grand_total − paid_amount ของใบที่ออกเลขแล้วและยังไม่ถูกยกเลิก
 * เรียงจากค้างนานที่สุดก่อน เพราะใบที่เลยกำหนดมานานคือใบที่ต้องโทรตามก่อน
 */
export async function getUnpaidBills({ limit = 8 } = {}) {
  const { data, error } = await supabase
    .from("ar_documents")
    .select(`id, doc_no, doc_type, doc_date, due_date, grand_total, paid_amount, status,
             customer:customers(display_name, company_name)`)
    .in("doc_type", ["BL", "INV"])
    .neq("status", "cancelled")
    .not("doc_no", "is", null)
    .order("doc_date", { ascending: true });
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? [])
    .map((d) => {
      const total = Number(d.grand_total) || 0;
      const paid = Number(d.paid_amount) || 0;
      const outstanding = Math.round((total - paid) * 100) / 100;
      const dueOn = d.due_date || null;
      return {
        id: d.id,
        docNo: d.doc_no,
        docType: d.doc_type,
        docDate: d.doc_date,
        dueDate: dueOn,
        customer: d.customer?.company_name || d.customer?.display_name || "—",
        total,
        paid,
        outstanding,
        // เลยกำหนดเมื่อมีวันครบกำหนดและวันนั้นผ่านไปแล้ว ใบที่ไม่ได้ตั้งวันไม่นับว่าเลย
        overdueDays: dueOn && dueOn < today ? daysAgo(dueOn) : 0,
      };
    })
    // ปัดเศษสตางค์ทิ้ง: ใบที่เหลือค้างไม่ถึงสลึงถือว่าเก็บครบแล้ว
    .filter((r) => r.outstanding > 0.01)
    .sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding);

  return {
    rows: rows.slice(0, limit),
    totalOutstanding: Math.round(rows.reduce((a, r) => a + r.outstanding, 0) * 100) / 100,
    count: rows.length,
    overdueCount: rows.filter((r) => r.overdueDays > 0).length,
  };
}

/**
 * สินค้าที่มีของในคลังมากที่สุด
 *
 * รวม on_hand ข้ามทุกคลัง แต่เฉพาะ pool 'normal' — ของชำรุด ของที่ถูกยืมไป
 * และของที่หายไม่ใช่ของที่หยิบมาขายได้ จึงไม่ควรนับรวมในอันดับนี้
 */
export async function getTopStockItems({ limit = 5 } = {}) {
  const { data, error } = await supabase
    .from("stock_balances")
    .select("on_hand, stock_item:stock_items(id, model_code, description, unit, category)")
    .eq("pool", "normal");
  if (error) throw error;

  const byItem = new Map();
  (data ?? []).forEach((b) => {
    const it = b.stock_item;
    if (!it) return;
    const cur = byItem.get(it.id) ?? {
      id: it.id, modelCode: it.model_code, description: it.description,
      unit: it.unit || "ชิ้น", category: it.category, onHand: 0,
    };
    cur.onHand += Number(b.on_hand) || 0;
    byItem.set(it.id, cur);
  });

  return [...byItem.values()]
    .filter((r) => r.onHand > 0)
    .sort((a, b) => b.onHand - a.onHand)
    .slice(0, limit);
}

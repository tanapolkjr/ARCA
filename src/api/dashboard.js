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

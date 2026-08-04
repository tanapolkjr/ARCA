import { supabase } from "../lib/supabaseClient.js";

const SELECT_LIST = `
  id, ticket_code, status, support_type, reported_at, reporter_name, reporter_phone,
  project:projects ( project_number, project_type, customer:customers ( display_name ) )
`;

const SELECT_DETAIL = `
  *,
  project:projects ( id, project_number, site:sites(name), customer:customers(display_name, phone) ),
  issues:ticket_issues ( * ),
  subcontractors:ticket_subcontractors ( * ),
  stock_movements:ticket_stock_movements ( * )
`;

export async function countTicketsByStatus() {
  const { data, error } = await supabase.from("tickets").select("status");
  if (error) throw error;
  const counts = {};
  (data || []).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return counts;
}

export async function listTickets({ status, query } = {}) {
  let q = supabase.from("tickets").select(SELECT_LIST).order("reported_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  if (query) q = q.ilike("ticket_code", `%${query}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getTicket(id) {
  const { data, error } = await supabase.from("tickets").select(SELECT_DETAIL).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createTicket(payload) {
  // payload.project_id is mandatory — a Ticket must always reference a Project (spec §1.2/§3)
  const { data, error } = await supabase.from("tickets").insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Single save for the whole record, same "one Save button" rule as Project.
export async function updateTicket(id, payload) {
  const { data, error } = await supabase.from("tickets").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTicket(id) {
  const { error } = await supabase.from("tickets").delete().eq("id", id);
  if (error) throw error;
}

// ---- Request & Issue: per-device problem rows (spec §3.1.2) ----
export async function listIssues(ticketId) {
  const { data, error } = await supabase.from("ticket_issues").select("*").eq("ticket_id", ticketId);
  if (error) throw error;
  return data;
}
export async function addIssue(ticketId, payload) {
  const { data, error } = await supabase.from("ticket_issues").insert({ ...payload, ticket_id: ticketId }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteIssue(id) {
  const { error } = await supabase.from("ticket_issues").delete().eq("id", id);
  if (error) throw error;
}

// ---- Subcontractor (spec §3.1.3) ----
export async function listSubcontractors(ticketId) {
  const { data, error } = await supabase.from("ticket_subcontractors").select("*").eq("ticket_id", ticketId);
  if (error) throw error;
  return data;
}
export async function addSubcontractor(ticketId, payload) {
  const { data, error } = await supabase.from("ticket_subcontractors").insert({ ...payload, ticket_id: ticketId }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteSubcontractor(id) {
  const { error } = await supabase.from("ticket_subcontractors").delete().eq("id", id);
  if (error) throw error;
}

// ---- เบิกสินค้า / คืนเบิกสินค้า / รับสินค้าเก่า (spec §3.1.4) ----
export async function listStockMovements(ticketId) {
  const { data, error } = await supabase
    .from("ticket_stock_movements")
    .select("*, item:stock_items(model_code, description)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Records a เบิก/คืน/รับของเก่า movement AND applies the real stock effect:
 *  - withdraw     → decrements on_hand at the given location
 *  - return       → increments on_hand back
 *  - receive_old  → logged only, does not touch sellable on_hand (spec §3.1.4)
 */
export async function addStockMovement(ticketId, { movementType, stockItemId, locationId, serialNo, qty, createdBy }) {
  // เบิก/คืน MUST know which warehouse they hit — previously the location was
  // optional, and when omitted the movement was recorded but no balance or
  // ledger entry was ever written (while the UI still claimed "ปรับสต็อกแล้ว").
  if ((movementType === "withdraw" || movementType === "return") && !locationId) {
    throw new Error("ต้องเลือกคลังก่อนบันทึกเบิก/คืนสินค้า — ระบบต้องรู้ว่าตัด/คืนสต็อกที่คลังไหน");
  }

  const { data: movement, error } = await supabase
    .from("ticket_stock_movements")
    .insert({ ticket_id: ticketId, movement_type: movementType, stock_item_id: stockItemId, location_id: locationId || null, serial_no: serialNo || null, qty: qty || 1 })
    .select()
    .single();
  if (error) throw error;

  if ((movementType === "withdraw" || movementType === "return") && stockItemId && locationId) {
    const moveQty = qty || 1;
    const { data: bal, error: balReadError } = await supabase
      .from("stock_balances")
      .select("id, on_hand")
      .eq("stock_item_id", stockItemId)
      .eq("location_id", locationId)
      .eq("pool", "normal")
      .maybeSingle();
    if (balReadError) throw balReadError;
    if (bal) {
      const delta = movementType === "withdraw" ? -moveQty : moveQty;
      const { error: balError } = await supabase.from("stock_balances").update({ on_hand: Math.max(0, bal.on_hand + delta) }).eq("id", bal.id);
      if (balError) throw balError;
    } else if (movementType === "return") {
      // Returning to a warehouse that has never stocked this item yet —
      // create the balance row so the returned unit doesn't vanish.
      const { error: balError } = await supabase
        .from("stock_balances")
        .insert({ stock_item_id: stockItemId, location_id: locationId, pool: "normal", on_hand: moveQty, reserved: 0 });
      if (balError) throw balError;
    }
    const { error: txnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: stockItemId,
      location_id: locationId,
      transaction_type: movementType,
      qty: moveQty,
      reference_type: "ticket",
      reference_id: ticketId,
      serial_no: serialNo || null,
      created_by: createdBy,
    });
    if (txnError) throw txnError;
  }

  return movement;
}

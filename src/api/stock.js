import { supabase } from "../lib/supabaseClient.js";

export async function listLocations() {
  const { data, error } = await supabase.from("stock_locations").select("id, name, location_type").eq("is_active", true).order("name");
  if (error) throw error;
  return data;
}

export async function listStockItems({ query } = {}) {
  let q = supabase.from("stock_items").select("id, model_code, description, category, unit").order("model_code");
  if (query) q = q.or(`model_code.ilike.%${query}%,description.ilike.%${query}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function listProductCategories() {
  const { data, error } = await supabase.from("stock_items").select("category").not("category", "is", null);
  if (error) throw error;
  return Array.from(new Set((data || []).map((r) => r.category).filter(Boolean)));
}

export async function listProductSubCategories() {
  const { data, error } = await supabase.from("stock_items").select("sub_category").not("sub_category", "is", null);
  if (error) throw error;
  return Array.from(new Set((data || []).map((r) => r.sub_category).filter(Boolean)));
}

export async function createStockItem(payload) {
  const { data, error } = await supabase.from("stock_items").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteStockItem(id) {
  const { error } = await supabase.from("stock_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Bulk import from Excel (spec follow-up request). Uses upsert on
 * model_code so re-importing the same file updates existing products
 * instead of erroring on the unique constraint — makes it safe to re-run
 * an import after fixing a typo in the sheet.
 */
export async function bulkUpsertStockItems(items) {
  const { data, error } = await supabase
    .from("stock_items")
    .upsert(items, { onConflict: "model_code" })
    .select();
  if (error) throw error;
  return data;
}

/**
 * รับสินค้าเข้าคลัง (spec §7.5) — the one piece missing from the whole Stock
 * module until this recheck: on_hand could only ever go DOWN (withdrawals)
 * with no way to receive new stock in. This is that.
 *
 * Logs a stock_transactions "receive_in" row per serial for the audit
 * trail and bumps stock_balances.on_hand for the item/location (creating
 * the balance row if it's the first time this item has been stocked at
 * that location). Warranty is intentionally NOT touched here — it only
 * starts once a unit is withdrawn to a project (see fulfillInstallJob).
 */
export async function receiveStock({ stockItemId, locationId, serials, roundNo, purchaseRequestId, createdBy }) {
  const cleanSerials = (serials || []).map((s) => s.trim()).filter(Boolean);
  const qty = cleanSerials.length || 1;

  for (const serial of cleanSerials.length ? cleanSerials : [null]) {
    const { error: txnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: stockItemId,
      location_id: locationId,
      transaction_type: "receive_in",
      qty: 1,
      reference_type: purchaseRequestId ? "purchase_request" : "stock_in_round",
      reference_id: purchaseRequestId || null,
      serial_no: serial,
      note: roundNo ? `Round: ${roundNo}` : null,
      created_by: createdBy,
    });
    if (txnError) throw txnError;
  }

  const { data: existing, error: balReadError } = await supabase
    .from("stock_balances")
    .select("id, on_hand")
    .eq("stock_item_id", stockItemId)
    .eq("location_id", locationId)
    .eq("pool", "normal")
    .maybeSingle();
  if (balReadError) throw balReadError;

  if (existing) {
    const { error } = await supabase.from("stock_balances").update({ on_hand: existing.on_hand + qty }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("stock_balances").insert({ stock_item_id: stockItemId, location_id: locationId, pool: "normal", on_hand: qty, reserved: 0 });
    if (error) throw error;
  }

  return { qty };
}

/**
 * Adjusts stock_balances.reserved by `delta` for (item, location, normal
 * pool), creating the balance row if it doesn't exist yet. This is what
 * actually makes the Device Install "จองสต็อก" toggle real — previously it
 * only flipped a boolean on project_device_install and never touched Stock
 * at all (found in the spec recheck).
 */
export async function adjustReservation(stockItemId, locationId, delta) {
  if (!stockItemId || !locationId || !delta) return;
  const { data: existing, error: readError } = await supabase
    .from("stock_balances")
    .select("id, reserved")
    .eq("stock_item_id", stockItemId)
    .eq("location_id", locationId)
    .eq("pool", "normal")
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase.from("stock_balances").update({ reserved: Math.max(0, existing.reserved + delta) }).eq("id", existing.id);
    if (error) throw error;
  } else if (delta > 0) {
    const { error } = await supabase.from("stock_balances").insert({ stock_item_id: stockItemId, location_id: locationId, pool: "normal", on_hand: 0, reserved: delta });
    if (error) throw error;
  }
}

/**
 * Step 1 — anyone who can plan a project (Sale/PM/Admin/Manager/Super Admin)
 * can REQUEST a withdrawal job. This does NOT touch stock yet.
 */
export async function createInstallJobRequest(projectId, jobPayload) {
  const { data: job, error } = await supabase
    .from("project_install_jobs")
    .insert({ ...jobPayload, project_id: projectId, status: "รอดำเนินการ" })
    .select()
    .single();
  if (error) throw error;
  return job;
}

/**
 * Step 2 — fulfilling the job (spec §2.2.4 ↔ §2.2.5 ↔ §7.1): only
 * Super Admin / Manager / Store should do this (Permission Matrix §8.2,
 * "รับสินค้าเข้าคลัง / เบิก-คืน / ย้ายคลัง / ยืมคืนสินค้า"). Gated at the UI
 * layer (NewJobModal / InstallPeriodTab check profile.role) — see the note
 * in 0004_fixes.sql for why this isn't also a hard RLS wall on
 * stock_balances specifically.
 *
 * For every serial being withdrawn: logs a Device Detail row (warranty
 * start = today), a stock_transactions "withdraw" entry, decrements
 * stock_balances.on_hand (and reserved, capped at 0), and bumps
 * project_device_install.withdrawn_qty. Marks the job "เบิกสินค้าแล้ว".
 *
 * Not wrapped in a single DB transaction (supabase-js has no client-side
 * transaction API without a Postgres RPC function) — for a v1 with one
 * concurrent user per job this is an acceptable, honestly-documented
 * limitation. A `withdraw_stock()` RPC function would be the hardening step.
 */
export async function fulfillInstallJob({ jobId, projectId, locationId, warrantyMonths, withdrawals, createdBy }) {
  const today = new Date().toISOString().slice(0, 10);

  for (const w of withdrawals) {
    for (const serial of w.serials) {
      if (!serial.trim()) continue;

      const { error: ddError } = await supabase.from("project_device_detail").insert({
        project_id: projectId,
        serial_no: serial.trim(),
        model_code: w.modelCode,
        description: w.description,
        start_date: today,
        warranty_months: warrantyMonths || 6,
        install_job_id: jobId,
      });
      if (ddError) throw ddError;

      const { error: txnError } = await supabase.from("stock_transactions").insert({
        stock_item_id: w.stockItemId,
        location_id: locationId,
        transaction_type: "withdraw",
        qty: 1,
        reference_type: "project",
        reference_id: projectId,
        serial_no: serial.trim(),
        created_by: createdBy,
        install_job_id: jobId,
      });
      if (txnError) throw txnError;

      if (w.stockItemId) {
        const { data: bal, error: balError } = await supabase
          .from("stock_balances")
          .select("id, on_hand, reserved")
          .eq("stock_item_id", w.stockItemId)
          .eq("location_id", locationId)
          .eq("pool", "normal")
          .maybeSingle();
        if (balError) throw balError;
        if (bal) {
          // Only release a reservation if THIS Device Install row was
          // actually reserved — otherwise Math.max would silently eat a
          // reservation belonging to another project on the same
          // item/location (found in the launch recheck).
          const nextReserved = w.isReserved ? Math.max(0, bal.reserved - 1) : bal.reserved;
          const { error } = await supabase
            .from("stock_balances")
            .update({ on_hand: Math.max(0, bal.on_hand - 1), reserved: nextReserved })
            .eq("id", bal.id);
          if (error) throw error;
        }
      }
    }

    if (w.deviceInstallId) {
      const { data: row } = await supabase.from("project_device_install").select("withdrawn_qty").eq("id", w.deviceInstallId).maybeSingle();
      if (row) {
        const { error } = await supabase.from("project_device_install").update({ withdrawn_qty: (row.withdrawn_qty || 0) + w.serials.filter((s) => s.trim()).length }).eq("id", w.deviceInstallId);
        if (error) throw error;
      }
    }
  }

  const { data: job, error: jobError } = await supabase
    .from("project_install_jobs")
    .update({ status: "เบิกสินค้าแล้ว" })
    .eq("id", jobId)
    .select()
    .single();
  if (jobError) throw jobError;
  return job;
}

/**
 * Returns a single serialized unit (a project_device_detail row) back to
 * stock — different from cancelInstallJob, which reverses a whole job at
 * once. Finds the original withdraw transaction for this exact serial to
 * know which item/location to credit back, logs a "return" transaction,
 * rolls back the Device Install withdrawn_qty, and deletes the Device
 * Detail row (its warranty tracking is done, per the confirm-to-delete UX
 * in DeviceDetailTab).
 *
 * If no matching withdraw transaction is found (e.g. a record from before
 * install_job_id linking, or manually-entered test data), on_hand can't be
 * safely adjusted automatically — still deletes the record since that's
 * what was asked for, but flags that stock needs a manual check.
 */
export async function returnDeviceDetailToStock({ deviceDetailId, projectId, serialNo, modelCode, returnedBy }) {
  // A serial can legitimately have MORE than one historical "withdraw"
  // transaction (withdrawn → returned → withdrawn again, or used on a
  // Ticket too). The old `.maybeSingle()` errored on >1 row and the error
  // was swallowed — the Device Detail row got deleted WITHOUT the stock
  // being credited back. Fix: scope to this row's install_job_id when it
  // has one, otherwise take the most recent withdraw for the serial.
  const { data: ddRow, error: ddReadError } = await supabase
    .from("project_device_detail")
    .select("install_job_id")
    .eq("id", deviceDetailId)
    .maybeSingle();
  if (ddReadError) throw ddReadError;

  let txnQuery = supabase
    .from("stock_transactions")
    .select("stock_item_id, location_id, install_job_id")
    .eq("serial_no", serialNo)
    .eq("transaction_type", "withdraw")
    .order("created_at", { ascending: false })
    .limit(1);
  if (ddRow?.install_job_id) txnQuery = txnQuery.eq("install_job_id", ddRow.install_job_id);
  const { data: txnRows, error: txnReadError } = await txnQuery;
  if (txnReadError) throw txnReadError;
  const txn = txnRows?.[0] || null;

  let stockAdjusted = false;

  if (txn) {
    const { data: bal } = await supabase
      .from("stock_balances")
      .select("id, on_hand")
      .eq("stock_item_id", txn.stock_item_id)
      .eq("location_id", txn.location_id)
      .eq("pool", "normal")
      .maybeSingle();
    if (bal) {
      const { error } = await supabase.from("stock_balances").update({ on_hand: bal.on_hand + 1 }).eq("id", bal.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("stock_balances").insert({ stock_item_id: txn.stock_item_id, location_id: txn.location_id, pool: "normal", on_hand: 1, reserved: 0 });
      if (error) throw error;
    }
    const { error: returnTxnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: txn.stock_item_id,
      location_id: txn.location_id,
      transaction_type: "return",
      qty: 1,
      reference_type: "project",
      reference_id: projectId,
      serial_no: serialNo,
      install_job_id: txn.install_job_id,
      created_by: returnedBy,
      note: "คืนสินค้าเข้าคลังจาก Device Detail",
    });
    if (returnTxnError) throw returnTxnError;

    const { data: row } = await supabase
      .from("project_device_install")
      .select("id, withdrawn_qty")
      .eq("project_id", projectId)
      .eq("stock_item_id", txn.stock_item_id)
      .maybeSingle();
    if (row) {
      await supabase.from("project_device_install").update({ withdrawn_qty: Math.max(0, (row.withdrawn_qty || 0) - 1) }).eq("id", row.id);
    }
    stockAdjusted = true;
  }

  const { error: deleteError } = await supabase.from("project_device_detail").delete().eq("id", deviceDetailId);
  if (deleteError) throw deleteError;

  return { stockAdjusted };
}

/**
 * ยกเลิกการเบิก (Cancel Withdrawal) — reverses a fulfilled Install Period
 * job: adds the withdrawn qty back to stock_balances.on_hand, logs a
 * "cancel_withdraw" transaction for the audit trail, removes the
 * Device Detail (serial/warranty) rows that job created, rolls back
 * project_device_install.withdrawn_qty, and marks the job cancelled.
 *
 * No manual data entry needed — everything required (which items, which
 * location, which serials, how much) was already captured automatically
 * when the job was fulfilled, linked via install_job_id (added in
 * 0011_cancel_withdrawal.sql). Jobs withdrawn before that migration have no
 * such link and can't be auto-reversed — this throws a clear error for
 * those instead of guessing.
 */
export async function cancelInstallJob(jobId, cancelledBy) {
  // Guard 1 — double-cancel: two open tabs (or a double click) could both
  // see the job as "เบิกสินค้าแล้ว" and replay the reversal twice, crediting
  // stock back double. Check the CURRENT status first and refuse.
  const { data: job, error: jobReadError } = await supabase
    .from("project_install_jobs")
    .select("project_id, status")
    .eq("id", jobId)
    .single();
  if (jobReadError) throw jobReadError;
  if (job.status === "ยกเลิกแล้ว") {
    throw new Error("Job นี้ถูกยกเลิกไปแล้ว — ไม่สามารถยกเลิกซ้ำได้ (สต็อกถูกคืนไปแล้วในการยกเลิกครั้งแรก)");
  }

  const { data: txns, error: txnError } = await supabase
    .from("stock_transactions")
    .select("*")
    .eq("install_job_id", jobId)
    .eq("transaction_type", "withdraw");
  if (txnError) throw txnError;

  if (!txns || txns.length === 0) {
    throw new Error("ไม่พบข้อมูลการเบิกที่ผูกกับ Job นี้ในระบบ — น่าจะเป็น Job ที่เบิกไว้ก่อนอัปเดตฟีเจอร์นี้ กรุณาปรับยอดสต็อกด้วยตนเองที่หน้า Stock แทน");
  }

  // Guard 2 — partially-returned jobs: any serial already credited back
  // individually (per-serial Return on the Device Detail tab) still has its
  // original "withdraw" transaction, so replaying ALL withdraws would credit
  // that unit twice. Skip serials that already have a return/cancel entry
  // for this job.
  const { data: reversals, error: revError } = await supabase
    .from("stock_transactions")
    .select("serial_no, transaction_type")
    .eq("install_job_id", jobId)
    .in("transaction_type", ["return", "cancel_withdraw"]);
  if (revError) throw revError;
  const alreadyReversed = new Set((reversals || []).map((r) => r.serial_no).filter(Boolean));
  const toReverse = txns.filter((t) => !t.serial_no || !alreadyReversed.has(t.serial_no));

  for (const t of toReverse) {
    const { data: bal, error: balReadError } = await supabase
      .from("stock_balances")
      .select("id, on_hand")
      .eq("stock_item_id", t.stock_item_id)
      .eq("location_id", t.location_id)
      .eq("pool", "normal")
      .maybeSingle();
    if (balReadError) throw balReadError;
    if (bal) {
      const { error } = await supabase.from("stock_balances").update({ on_hand: bal.on_hand + t.qty }).eq("id", bal.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("stock_balances").insert({ stock_item_id: t.stock_item_id, location_id: t.location_id, pool: "normal", on_hand: t.qty, reserved: 0 });
      if (error) throw error;
    }
    const { error: cancelTxnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: t.stock_item_id,
      location_id: t.location_id,
      transaction_type: "cancel_withdraw",
      qty: t.qty,
      reference_type: "project",
      reference_id: t.reference_id,
      serial_no: t.serial_no,
      install_job_id: jobId,
      created_by: cancelledBy,
      note: "ยกเลิกการเบิก",
    });
    if (cancelTxnError) throw cancelTxnError;
  }

  // Roll back project_device_install.withdrawn_qty, grouped by item —
  // only for the units actually reversed here (per-serial Returns already
  // rolled back their own withdrawn_qty when they happened).
  const byItem = new Map();
  for (const t of toReverse) byItem.set(t.stock_item_id, (byItem.get(t.stock_item_id) || 0) + t.qty);
  for (const [stockItemId, qty] of byItem.entries()) {
    const { data: row } = await supabase
      .from("project_device_install")
      .select("id, withdrawn_qty")
      .eq("project_id", job.project_id)
      .eq("stock_item_id", stockItemId)
      .maybeSingle();
    if (row) {
      await supabase.from("project_device_install").update({ withdrawn_qty: Math.max(0, (row.withdrawn_qty || 0) - qty) }).eq("id", row.id);
    }
  }

  // The Device Detail (serial + warranty) rows this job created are void.
  await supabase.from("project_device_detail").delete().eq("install_job_id", jobId);

  const { data: updated, error: updateErr } = await supabase
    .from("project_install_jobs")
    .update({ status: "ยกเลิกแล้ว", cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy })
    .eq("id", jobId)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return updated;
}

/**
 * Stock Summary (spec §7.4) — On Hand / Reserved / Available per item.
 * Aggregated client-side across locations when `locationId` is not given,
 * since a straight group-by sum is simplest done here rather than adding a
 * Postgres view/RPC for v1. Revisit with a `stock_summary` VIEW if the
 * item/location count grows large enough for this to matter.
 */
export async function listStockSummary({ locationId, query } = {}) {
  // Starts from stock_items (not stock_balances) so newly-added products
  // with no stock movement yet still show up — previously they were
  // invisible on this page until their first Stock In, which also made
  // them impossible to find/delete here.
  let itemQuery = supabase.from("stock_items").select("id, model_code, description, category, sub_category, reorder_point").order("model_code");
  if (query) itemQuery = itemQuery.or(`model_code.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%,sub_category.ilike.%${query}%`);
  const { data: items, error: itemError } = await itemQuery;
  if (itemError) throw itemError;

  let balQuery = supabase.from("stock_balances").select("stock_item_id, location_id, on_hand, reserved").eq("pool", "normal");
  if (locationId && locationId !== "all") balQuery = balQuery.eq("location_id", locationId);
  const { data: balances, error: balError } = await balQuery;
  if (balError) throw balError;

  const balByItem = new Map();
  for (const row of balances || []) {
    const entry = balByItem.get(row.stock_item_id) || { onHand: 0, reserved: 0 };
    entry.onHand += row.on_hand || 0;
    entry.reserved += row.reserved || 0;
    balByItem.set(row.stock_item_id, entry);
  }

  return (items || []).map((it) => ({
    id: it.id,
    model: it.model_code,
    desc: it.description,
    category: it.category,
    subCategory: it.sub_category,
    onHand: balByItem.get(it.id)?.onHand || 0,
    reserved: balByItem.get(it.id)?.reserved || 0,
  }));
}

export async function createStockLocation(payload) {
  // RLS restricts this to Manager/Store roles (see 0001_init.sql §8) —
  // Supabase will reject with a permissions error for anyone else.
  const { data, error } = await supabase.from("stock_locations").insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ---- 7.6 Warehouse Transfer ----
// Redesigned in the launch recheck: previously a transfer was a from/to
// header ONLY — no item lines existed, no stock ever moved, and the create
// modal promised a detail page that was never built. Now (with
// 0013_launch_recheck_fixes.sql): a transfer carries item lines, decrements
// the SOURCE warehouse on create (transfer_out), and credits the
// DESTINATION on "ยืนยันรับของ" (transfer_in) — so goods in transit are
// visible as "gone from A, not yet at B", matching physical reality.

async function shiftBalance(stockItemId, locationId, delta) {
  const { data: bal, error: readError } = await supabase
    .from("stock_balances")
    .select("id, on_hand")
    .eq("stock_item_id", stockItemId)
    .eq("location_id", locationId)
    .eq("pool", "normal")
    .maybeSingle();
  if (readError) throw readError;
  if (bal) {
    const { error } = await supabase.from("stock_balances").update({ on_hand: Math.max(0, bal.on_hand + delta) }).eq("id", bal.id);
    if (error) throw error;
  } else if (delta > 0) {
    const { error } = await supabase.from("stock_balances").insert({ stock_item_id: stockItemId, location_id: locationId, pool: "normal", on_hand: delta, reserved: 0 });
    if (error) throw error;
  }
}

export async function listTransfers() {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select("*, from_location:stock_locations!stock_transfers_from_location_id_fkey(name), to_location:stock_locations!stock_transfers_to_location_id_fkey(name), items:stock_transfer_items(id, stock_item_id, qty, item:stock_items(model_code, description))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** items: [{ stockItemId, qty }] — qty-based (no serials; serialized units use เบิก/คืน flows). */
export async function createTransfer({ fromLocationId, toLocationId, items, requestedBy }) {
  const { data: transfer, error } = await supabase
    .from("stock_transfers")
    .insert({ transfer_no: `TRF-${Date.now()}`, from_location_id: fromLocationId, to_location_id: toLocationId, requested_by: requestedBy })
    .select()
    .single();
  if (error) throw error;

  for (const it of items) {
    const qty = Math.max(1, Number(it.qty) || 1);
    const { error: itemError } = await supabase
      .from("stock_transfer_items")
      .insert({ transfer_id: transfer.id, stock_item_id: it.stockItemId, qty });
    if (itemError) throw itemError;

    const { error: txnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: it.stockItemId, location_id: fromLocationId, transaction_type: "transfer_out",
      qty, reference_type: "transfer", reference_id: transfer.id, created_by: requestedBy,
    });
    if (txnError) throw txnError;

    await shiftBalance(it.stockItemId, fromLocationId, -qty);
  }

  return transfer;
}

export async function receiveTransfer(id, receivedBy) {
  const { data: transfer, error: readError } = await supabase
    .from("stock_transfers")
    .select("*, items:stock_transfer_items(stock_item_id, qty)")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  if (transfer.status === "received") {
    throw new Error("ใบย้ายนี้ยืนยันรับของไปแล้ว — ไม่สามารถรับซ้ำได้");
  }

  for (const it of transfer.items || []) {
    const { error: txnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: it.stock_item_id, location_id: transfer.to_location_id, transaction_type: "transfer_in",
      qty: it.qty, reference_type: "transfer", reference_id: id, created_by: receivedBy,
    });
    if (txnError) throw txnError;
    await shiftBalance(it.stock_item_id, transfer.to_location_id, it.qty);
  }

  const { data, error } = await supabase
    .from("stock_transfers")
    .update({ status: "received", received_by: receivedBy, received_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/**
 * Deleting an IN-TRANSIT transfer returns the goods to the source warehouse
 * automatically (they left A but never arrived at B — cancelling the paper
 * means the goods go back on the shelf). Deleting a RECEIVED transfer only
 * removes the record — both warehouses already settled correctly.
 */
export async function deleteTransfer(id, deletedBy) {
  const { data: transfer, error: readError } = await supabase
    .from("stock_transfers")
    .select("*, items:stock_transfer_items(stock_item_id, qty)")
    .eq("id", id)
    .single();
  if (readError) throw readError;

  if (transfer.status !== "received") {
    for (const it of transfer.items || []) {
      const { error: txnError } = await supabase.from("stock_transactions").insert({
        stock_item_id: it.stock_item_id, location_id: transfer.from_location_id, transaction_type: "transfer_in",
        qty: it.qty, reference_type: "transfer", reference_id: id, created_by: deletedBy,
        note: "ยกเลิกใบย้าย — คืนสินค้ากลับคลังต้นทาง",
      });
      if (txnError) throw txnError;
      await shiftBalance(it.stock_item_id, transfer.from_location_id, it.qty);
    }
  }

  const { error } = await supabase.from("stock_transfers").delete().eq("id", id);
  if (error) throw error;
  return { restoredToSource: transfer.status !== "received" && (transfer.items || []).length > 0 };
}

// ---- 7.7 Borrow & Return ----
export async function listBorrows() {
  const { data, error } = await supabase
    .from("stock_borrows")
    .select("*, location:stock_locations(name), items:stock_borrow_items(id, stock_item_id, serial_no, returned, returned_at, item:stock_items(model_code, description))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Creates a borrow job with one or more items, each with captured Serial
 * Numbers — same shape as Install Period's fulfillment flow. Actually
 * decrements stock_balances.on_hand per unit (previously this never
 * touched stock in either direction).
 *
 * items: [{ stockItemId, serials: string[] }]
 */
export async function createBorrowJob({ borrowerName, dueDate, locationId, items, createdBy }) {
  const { data: borrow, error: borrowError } = await supabase
    .from("stock_borrows")
    .insert({ borrow_no: `BRW-${Date.now()}`, borrower_name: borrowerName, due_date: dueDate || null, location_id: locationId, status: "borrowed" })
    .select()
    .single();
  if (borrowError) throw borrowError;

  for (const it of items) {
    for (const serial of it.serials) {
      if (!serial.trim()) continue;

      const { error: itemError } = await supabase.from("stock_borrow_items").insert({
        borrow_id: borrow.id, stock_item_id: it.stockItemId, serial_no: serial.trim(),
      });
      if (itemError) throw itemError;

      const { error: txnError } = await supabase.from("stock_transactions").insert({
        stock_item_id: it.stockItemId, location_id: locationId, transaction_type: "borrow",
        qty: 1, reference_type: "borrow", reference_id: borrow.id, serial_no: serial.trim(), created_by: createdBy,
      });
      if (txnError) throw txnError;

      const { data: bal, error: balReadError } = await supabase
        .from("stock_balances")
        .select("id, on_hand")
        .eq("stock_item_id", it.stockItemId)
        .eq("location_id", locationId)
        .eq("pool", "normal")
        .maybeSingle();
      if (balReadError) throw balReadError;
      if (bal) {
        const { error } = await supabase.from("stock_balances").update({ on_hand: Math.max(0, bal.on_hand - 1) }).eq("id", bal.id);
        if (error) throw error;
      }
    }
  }

  return borrow;
}

/** Returns a single borrowed unit — adds stock back, marks that line returned. */
export async function returnBorrowItem(borrowItemId, returnedBy) {
  const { data: item, error: itemError } = await supabase
    .from("stock_borrow_items")
    .select("*, borrow:stock_borrows(id, location_id)")
    .eq("id", borrowItemId)
    .single();
  if (itemError) throw itemError;
  if (item.returned) return item;

  const locationId = item.borrow?.location_id;
  if (locationId) {
    const { data: bal } = await supabase
      .from("stock_balances")
      .select("id, on_hand")
      .eq("stock_item_id", item.stock_item_id)
      .eq("location_id", locationId)
      .eq("pool", "normal")
      .maybeSingle();
    if (bal) {
      const { error } = await supabase.from("stock_balances").update({ on_hand: bal.on_hand + 1 }).eq("id", bal.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("stock_balances").insert({ stock_item_id: item.stock_item_id, location_id: locationId, pool: "normal", on_hand: 1, reserved: 0 });
      if (error) throw error;
    }
    const { error: txnError } = await supabase.from("stock_transactions").insert({
      stock_item_id: item.stock_item_id, location_id: locationId, transaction_type: "borrow_return",
      qty: 1, reference_type: "borrow", reference_id: item.borrow_id, serial_no: item.serial_no, created_by: returnedBy,
    });
    if (txnError) throw txnError;
  }

  const { data: updated, error: updateError } = await supabase
    .from("stock_borrow_items")
    .update({ returned: true, returned_at: new Date().toISOString() })
    .eq("id", borrowItemId)
    .select()
    .single();
  if (updateError) throw updateError;

  // If every item on this borrow is now returned, close out the header.
  const { data: siblings } = await supabase.from("stock_borrow_items").select("returned").eq("borrow_id", item.borrow_id);
  if (siblings && siblings.every((s) => s.returned)) {
    await supabase.from("stock_borrows").update({ status: "returned", returned_date: new Date().toISOString().slice(0, 10) }).eq("id", item.borrow_id);
  }

  return updated;
}

export async function deleteBorrow(id) {
  const { error } = await supabase.from("stock_borrows").delete().eq("id", id);
  if (error) throw error;
}

// ---- 7.8 Refund ----
export async function listRefunds() {
  const { data, error } = await supabase
    .from("stock_refunds")
    .select("*, customer:customers(display_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function createRefund(payload) {
  const { data, error } = await supabase.from("stock_refunds").insert(payload).select().single();
  if (error) throw error;
  return data;
}
export async function updateRefundStatus(id, status) {
  const { data, error } = await supabase.from("stock_refunds").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteRefund(id) {
  const { error } = await supabase.from("stock_refunds").delete().eq("id", id);
  if (error) throw error;
}

// ---- 7.9 Purchase Request ----
export async function listPurchaseRequests() {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*, project:projects(project_number), items:purchase_request_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function createPurchaseRequest(payload, items) {
  const { data: pr, error } = await supabase.from("purchase_requests").insert(payload).select().single();
  if (error) throw error;
  if (items?.length) {
    await supabase.from("purchase_request_items").insert(items.map((it) => ({ ...it, purchase_request_id: pr.id })));
  }
  return pr;
}
export async function updatePurchaseRequestStatus(id, status) {
  const { data, error } = await supabase.from("purchase_requests").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePurchaseRequest(id) {
  const { error } = await supabase.from("purchase_requests").delete().eq("id", id);
  if (error) throw error;
}

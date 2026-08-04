import { supabase } from "../lib/supabaseClient.js";
import { adjustReservation } from "./stock.js";

const SELECT_LIST = `
  id, project_number, project_type, product_category, project_source,
  salesman_id, site_id, customer_id, status, installation_date, plan,
  created_at,
  site:sites ( name ),
  customer:customers ( display_name, phone ),
  salesman:users!projects_salesman_id_fkey ( name )
`;

const SELECT_DETAIL = `
  *,
  site:sites ( * ),
  customer:customers ( * ),
  device_install:project_device_install ( * ),
  device_detail:project_device_detail ( * ),
  payment_periods:project_payment_periods ( * ),
  app_data:project_app_data ( * )
`;

export async function listProjectsForSite(siteId) {
  const { data, error } = await supabase.from("projects").select("id, project_number, status").eq("site_id", siteId);
  if (error) throw error;
  return data;
}

export async function listProjectsForCustomer(customerId) {
  const { data, error } = await supabase.from("projects").select("id, project_number, status").eq("customer_id", customerId);
  if (error) throw error;
  return data;
}

export async function countProjectsByStatus() {
  const { data, error } = await supabase.from("projects").select("status");
  if (error) throw error;
  const counts = {};
  (data || []).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return counts;
}

export async function listProjects({ status, projectName, customerName, projectNumber } = {}) {
  let query = supabase.from("projects").select(SELECT_LIST).order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (projectNumber) query = query.ilike("project_number", `%${projectNumber}%`);
  // project/customer name filters need the joined tables — Supabase/PostgREST
  // can't ilike a joined column directly in the same query builder chain,
  // so for those two we filter client-side after fetch (fine at this data
  // volume; move to a Postgres view or RPC if the table grows large).
  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((p) => {
    const matchesProjectName = !projectName || p.site?.name?.toLowerCase().includes(projectName.toLowerCase());
    const matchesCustomer = !customerName || p.customer?.display_name?.toLowerCase().includes(customerName.toLowerCase());
    return matchesProjectName && matchesCustomer;
  });
}

export async function getProject(id) {
  const { data, error } = await supabase.from("projects").select(SELECT_DETAIL).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createProject(payload) {
  const { data, error } = await supabase.from("projects").insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Single save for the whole record — matches the "one Save button, no
// per-tab save" UX rule from the design spec. The caller passes the full
// merged state object; this just does one UPDATE.
export async function updateProject(id, payload) {
  const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ---- SO Info: Quotations (spec §2.2.2) ----
export async function listQuotations(projectId) {
  const { data, error } = await supabase.from("project_quotations").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function addQuotation(projectId, payload) {
  const { data, error } = await supabase.from("project_quotations").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteQuotation(id) {
  const { error } = await supabase.from("project_quotations").delete().eq("id", id);
  if (error) throw error;
}

// ---- Device Install: planned/reserved list (spec §2.2.3) ----
export async function listDeviceInstall(projectId) {
  const { data, error } = await supabase
    .from("project_device_install")
    .select("*, stock_item:stock_items(model_code, description)")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return data;
}
export async function addDeviceInstallRow(projectId, payload) {
  const { data, error } = await supabase.from("project_device_install").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  // Auto-reserve in Stock per spec §2.2.3 — this is the actual fix for the
  // gap found in the recheck: adding a row here used to never touch Stock.
  if (data.is_reserved && data.stock_item_id && data.location_id) {
    await adjustReservation(data.stock_item_id, data.location_id, data.planned_qty - (data.withdrawn_qty || 0));
  }
  return data;
}
export async function updateDeviceInstallRow(id, payload) {
  const { data: before } = await supabase.from("project_device_install").select("*").eq("id", id).single();
  const { data, error } = await supabase.from("project_device_install").update(payload).eq("id", id).select().single();
  if (error) throw error;

  // Keep stock_balances.reserved in sync with this row (spec §2.2.3/§7.1).
  // Covers BOTH cases: `is_reserved` flipping on/off, AND `planned_qty`
  // being edited while the row stays reserved — the old version only
  // handled the flip, so qty edits silently drifted the Reserved number.
  if (before && data.stock_item_id && data.location_id) {
    const beforeRemaining = Math.max(0, (before.planned_qty || 0) - (before.withdrawn_qty || 0));
    const afterRemaining = Math.max(0, (data.planned_qty || 0) - (data.withdrawn_qty || 0));
    let delta = 0;
    if (before.is_reserved && data.is_reserved) delta = afterRemaining - beforeRemaining;
    else if (!before.is_reserved && data.is_reserved) delta = afterRemaining;
    else if (before.is_reserved && !data.is_reserved) delta = -beforeRemaining;
    if (delta !== 0) await adjustReservation(data.stock_item_id, data.location_id, delta);
  }
  return data;
}
export async function deleteDeviceInstallRow(id) {
  const { data: row } = await supabase.from("project_device_install").select("*").eq("id", id).single();
  const { error } = await supabase.from("project_device_install").delete().eq("id", id);
  if (error) throw error;
  // Release any outstanding reservation before the row disappears.
  if (row?.is_reserved && row.stock_item_id && row.location_id) {
    const remaining = row.planned_qty - (row.withdrawn_qty || 0);
    if (remaining > 0) await adjustReservation(row.stock_item_id, row.location_id, -remaining);
  }
}

// ---- Install Period: stock withdrawal jobs (spec §2.2.4) ----
export async function listInstallJobs(projectId) {
  const { data, error } = await supabase
    .from("project_install_jobs")
    .select("*, requester:users!project_install_jobs_requested_by_fkey(name), canceller:users!project_install_jobs_cancelled_by_fkey(name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * For a Device Install row (identified by model_code), shows which Jobs
 * actually withdrew serials against it and when — answers "when was this
 * withdrawn, and what did that withdrawal include?" directly on the
 * Device Install tab instead of having to cross-reference Install Period.
 */
export async function listJobsForModel(projectId, modelCode) {
  const { data, error } = await supabase
    .from("project_device_detail")
    .select("serial_no, install_job_id, job:project_install_jobs(job_code, created_at, status)")
    .eq("project_id", projectId)
    .eq("model_code", modelCode)
    .not("install_job_id", "is", null);
  if (error) throw error;

  const byJob = new Map();
  for (const row of data || []) {
    if (!byJob.has(row.install_job_id)) {
      byJob.set(row.install_job_id, {
        jobId: row.install_job_id,
        jobCode: row.job?.job_code,
        createdAt: row.job?.created_at,
        status: row.job?.status,
        serials: [],
      });
    }
    byJob.get(row.install_job_id).serials.push(row.serial_no);
  }
  return Array.from(byJob.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
export async function createInstallJob(projectId, payload) {
  const { data, error } = await supabase.from("project_install_jobs").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}

// ---- Device Detail: serialized withdrawn units (spec §2.2.5) ----
export async function listDeviceDetail(projectId) {
  const { data, error } = await supabase.from("project_device_detail").select("*").eq("project_id", projectId).order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}
export async function addDeviceDetailRow(projectId, payload) {
  const { data, error } = await supabase.from("project_device_detail").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}

// ---- Payment Period (spec §2.2.6) ----
export async function listPaymentPeriods(projectId) {
  const { data, error } = await supabase.from("project_payment_periods").select("*").eq("project_id", projectId).order("period_no");
  if (error) throw error;
  return data;
}
export async function addPaymentPeriod(projectId, payload) {
  const { data, error } = await supabase.from("project_payment_periods").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}
export async function markPaymentPaid(id, receivedAmount) {
  const { data, error } = await supabase
    .from("project_payment_periods")
    .update({ paid: true, received_amount: receivedAmount, paid_date: new Date().toISOString().slice(0, 10) })
    .eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePaymentPeriod(id) {
  const { error } = await supabase.from("project_payment_periods").delete().eq("id", id);
  if (error) throw error;
}

// ---- File attachments (spec §2.2.7) ----
export async function listProjectFiles(projectId) {
  const { data, error } = await supabase
    .from("project_files")
    .select("*, uploader:users(name)")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function addProjectFile(projectId, payload) {
  const { data, error } = await supabase.from("project_files").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteProjectFile(id) {
  const { error } = await supabase.from("project_files").delete().eq("id", id);
  if (error) throw error;
}

// ---- App Data (spec §2.2.8) ----
export async function listAppData(projectId) {
  const { data, error } = await supabase.from("project_app_data").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return data;
}
export async function addAppData(projectId, payload) {
  const { data, error } = await supabase.from("project_app_data").insert({ ...payload, project_id: projectId }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteAppData(id) {
  const { error } = await supabase.from("project_app_data").delete().eq("id", id);
  if (error) throw error;
}

import { supabase } from "../lib/supabaseClient.js";

const SELECT_LIST = `
  id, request_code, request_type, customer_name_free, requested_at, needed_at, status,
  requester:users!pm_requests_requester_id_fkey ( name ),
  project:projects ( project_number )
`;

export async function listPMRequests({ type } = {}) {
  let q = supabase.from("pm_requests").select(SELECT_LIST).order("requested_at", { ascending: false });
  if (type && type !== "all") q = q.eq("request_type", type);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getPMRequest(id) {
  const { data, error } = await supabase
    .from("pm_requests")
    .select("*, requester:users!pm_requests_requester_id_fkey(id, name), assignee:users!pm_requests_assigned_pm_fkey(id, name), project:projects(id, project_number)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createPMRequest(payload) {
  const { data, error } = await supabase.from("pm_requests").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updatePMRequest(id, payload) {
  const { data, error } = await supabase.from("pm_requests").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePMRequest(id) {
  const { error } = await supabase.from("pm_requests").delete().eq("id", id);
  if (error) throw error;
}

// ---- Attachments (files + external links) ----
export async function listPMRequestFiles(pmRequestId) {
  const { data, error } = await supabase
    .from("pm_request_files")
    .select("*, uploader:users(name)")
    .eq("pm_request_id", pmRequestId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addPMRequestFile(pmRequestId, payload) {
  const { data, error } = await supabase.from("pm_request_files").insert({ ...payload, pm_request_id: pmRequestId }).select().single();
  if (error) throw error;
  return data;
}

export async function deletePMRequestFile(id) {
  const { error } = await supabase.from("pm_request_files").delete().eq("id", id);
  if (error) throw error;
}

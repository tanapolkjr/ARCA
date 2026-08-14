import { supabase } from "../lib/supabaseClient.js";

const SELECT_LIST = `
  id, customer_type, display_name, phone, email,
  contacts:customer_contacts ( id )
`;

export async function listContacts({ query } = {}) {
  let q = supabase.from("customers").select(SELECT_LIST).order("display_name", { ascending: true });
  if (query) q = q.ilike("display_name", `%${query}%`);
  const { data, error } = await q;
  if (error) throw error;
  // project count needs a separate query since it's not a direct FK on customers
  return data;
}

export async function getCustomer(id) {
  const { data, error } = await supabase
    .from("customers")
    .select("*, contacts:customer_contacts(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createCustomer(payload) {
  const { data, error } = await supabase.from("customers").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id, payload) {
  const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

export async function addCustomerContact(customerId, contact) {
  const { data, error } = await supabase
    .from("customer_contacts")
    .insert({ ...contact, customer_id: customerId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Site Master — lives alongside Contact in the spec (§6.2), same "search or
// create inline" pattern used from the Project form.
export async function listSites(query) {
  let q = supabase.from("sites").select("id, name, address, province, google_map").order("name");
  if (query) q = q.ilike("name", `%${query}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getSite(id) {
  const { data, error } = await supabase.from("sites").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function updateSite(id, payload) {
  const { data, error } = await supabase.from("sites").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSite(id) {
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) throw error;
}

export async function createSite(payload) {
  const { data, error } = await supabase.from("sites").insert(payload).select().single();
  if (error) throw error;
  return data;
}

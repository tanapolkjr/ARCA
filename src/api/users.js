import { supabase } from "../lib/supabaseClient.js";

export async function listUsers({ roles } = {}) {
  let q = supabase.from("users").select("id, name, email, role, phone").eq("is_active", true).order("name");
  if (roles?.length) q = q.in("role", roles);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Restricted by RLS to Super Admin only (see 0001_init.sql "users_update_self_or_admin").
/** แก้ชื่อและเบอร์โทรของผู้ใช้ — เบอร์นี้ขึ้นบนเอกสารใต้ชื่อผู้ขาย */
export async function updateUserProfile(userId, { name, phone }) {
  const patch = {};
  if (name !== undefined) patch.name = name?.trim() || null;
  if (phone !== undefined) patch.phone = phone?.trim() || null;
  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function updateUserRole(userId, role) {
  const { data, error } = await supabase.from("users").update({ role }).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

export async function deactivateUser(userId) {
  const { error } = await supabase.from("users").update({ is_active: false }).eq("id", userId);
  if (error) throw error;
}

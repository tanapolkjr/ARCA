import { supabase } from "../lib/supabaseClient.js";

export async function listMyNotifications(userId, { limit = 20 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, entity_type, entity_id, reason, is_read, created_at, comment:comments(body, author:users!comments_author_id_fkey(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function countUnread(userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count || 0;
}

export async function markRead(notificationId) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
  if (error) throw error;
}

export async function markAllRead(userId) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (error) throw error;
}

// Entity-type-aware link builder so the notification bell can route straight
// to the record + comment thread, per spec §5.2 ("คลิกแล้วลิงก์กลับไปที่ Record").
export function notificationLink(n) {
  if (n.entity_type === "project") return `/project/${n.entity_id}`;
  if (n.entity_type === "ticket") return `/ticket/${n.entity_id}`;
  if (n.entity_type === "pm_request") return `/pm-request/${n.entity_id}`;
  return "/";
}

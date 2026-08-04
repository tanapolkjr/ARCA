import { supabase } from "../lib/supabaseClient.js";

export async function listConversations(userId) {
  if (!userId) return [];
  const { data: participantRows, error: pErr } = await supabase
    .from("chat_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  if (pErr) throw pErr;
  const ids = (participantRows || []).map((r) => r.conversation_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, name, is_group, created_at, participants:chat_participants(user:users(id, name))")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMessages(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, body, created_at, sender:users(id, name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage(conversationId, senderId, body) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select("id, body, created_at, sender:users(id, name)")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Starts (or reuses) a conversation.
 *  - 1-1: if a non-group conversation already exists with exactly these two
 *    people, reuse it instead of creating a duplicate thread.
 *  - group: always creates a new conversation.
 */
export async function startConversation({ createdBy, participantIds, isGroup, name }) {
  const allParticipants = Array.from(new Set([createdBy, ...participantIds]));

  if (!isGroup && allParticipants.length === 2) {
    const existing = await findExistingDirectConversation(allParticipants);
    if (existing) return existing;
  }

  const { data: convo, error } = await supabase
    .from("chat_conversations")
    .insert({ name: isGroup ? name : null, is_group: isGroup, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;

  const rows = allParticipants.map((user_id) => ({ conversation_id: convo.id, user_id }));
  const { error: partError } = await supabase.from("chat_participants").insert(rows);
  if (partError) throw partError;

  return convo;
}

async function findExistingDirectConversation([userA, userB]) {
  const { data: mine } = await supabase.from("chat_participants").select("conversation_id").eq("user_id", userA);
  const ids = (mine || []).map((r) => r.conversation_id);
  if (ids.length === 0) return null;

  const { data: candidates } = await supabase
    .from("chat_conversations")
    .select("id, is_group, participants:chat_participants(user_id)")
    .in("id", ids)
    .eq("is_group", false);

  return (candidates || []).find((c) => {
    const ids2 = c.participants.map((p) => p.user_id).sort();
    return ids2.length === 2 && ids2.includes(userA) && ids2.includes(userB);
  }) || null;
}

/** Subscribes to new messages in a conversation via Supabase Realtime. Returns an unsubscribe function. */
export function subscribeToMessages(conversationId, onInsert) {
  const channel = supabase
    .channel(`chat-${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

import { supabase } from "../lib/supabaseClient.js";

export async function listComments(entityType, entityId) {
  if (!entityId) return [];
  const { data, error } = await supabase
    .from("comments")
    // "author:users(...)" alone is ambiguous here — comment_mentions is a
    // bridge table (comment_id -> comments, user_id -> users), so
    // PostgREST sees two possible paths from comments to users (the direct
    // author_id FK, and the implicit many-to-many via comment_mentions).
    // Pinning the exact FK constraint name resolves it, same fix as the
    // projects/salesman embed bug.
    .select("id, body, status_tag, created_at, author:users!comments_author_id_fkey(id, name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Posts a comment and fans out notifications:
 *  - everyone in `mentionedUserIds` gets a "mention" notification (always)
 *  - everyone who has previously commented on this entity (the "participants")
 *    gets a "participant" notification, except the author and anyone already
 *    notified as a mention (spec §5.2 — no duplicate notification per person).
 */
export async function createComment({ entityType, entityId, authorId, body, statusTag, mentionedUserIds = [] }) {
  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ entity_type: entityType, entity_id: entityId, author_id: authorId, body, status_tag: statusTag || null })
    .select()
    .single();
  if (error) throw error;

  if (mentionedUserIds.length > 0) {
    const rows = mentionedUserIds.map((user_id) => ({ comment_id: comment.id, user_id }));
    await supabase.from("comment_mentions").insert(rows);
  }

  const { data: priorAuthors } = await supabase
    .from("comments")
    .select("author_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  const participantIds = new Set((priorAuthors || []).map((c) => c.author_id).filter(Boolean));
  participantIds.delete(authorId);
  mentionedUserIds.forEach((id) => participantIds.delete(id)); // avoid double notification

  const notifRows = [
    ...mentionedUserIds.map((user_id) => ({
      user_id, comment_id: comment.id, entity_type: entityType, entity_id: entityId, reason: "mention",
    })),
    ...Array.from(participantIds).map((user_id) => ({
      user_id, comment_id: comment.id, entity_type: entityType, entity_id: entityId, reason: "participant",
    })),
  ];
  if (notifRows.length > 0) {
    await supabase.from("notifications").insert(notifRows);
  }

  return comment;
}

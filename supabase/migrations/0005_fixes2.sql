-- =============================================================================
-- 0005 — Fixes from the latest round of feedback
-- =============================================================================
-- Run in Supabase SQL Editor AFTER 0001-0004.

-- ---------------------------------------------------------------------------
-- Fix 1: chat_participants RLS had a self-referential policy — a policy ON
-- chat_participants that queries chat_participants again inside itself.
-- Postgres detects this as infinite recursion and refuses the query
-- entirely ("infinite recursion detected in policy for relation
-- chat_participants"). Fixed with a SECURITY DEFINER helper function that
-- bypasses RLS internally, so the policy can check membership without
-- triggering RLS evaluation on itself.
-- ---------------------------------------------------------------------------
create or replace function is_chat_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from chat_participants
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

drop policy if exists "chat_conversations_select_participant" on chat_conversations;
create policy "chat_conversations_select_participant" on chat_conversations
  for select using (is_chat_participant(id, auth.uid()));

drop policy if exists "chat_participants_select_own_conversations" on chat_participants;
create policy "chat_participants_select_own_conversations" on chat_participants
  for select using (is_chat_participant(conversation_id, auth.uid()));

drop policy if exists "chat_messages_select_participant" on chat_messages;
create policy "chat_messages_select_participant" on chat_messages
  for select using (is_chat_participant(chat_messages.conversation_id, auth.uid()));

drop policy if exists "chat_messages_insert_participant" on chat_messages;
create policy "chat_messages_insert_participant" on chat_messages
  for insert with check (
    sender_id = auth.uid() and is_chat_participant(chat_messages.conversation_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Fix 2: DELETE policies were missing entirely for several tables. RLS
-- denies by default when no policy matches an operation, so every delete
-- button added this round would have silently failed without these.
-- ---------------------------------------------------------------------------
create policy "stock_transfers_delete_all" on stock_transfers for delete using (auth.role() = 'authenticated');
create policy "stock_borrows_delete_all" on stock_borrows for delete using (auth.role() = 'authenticated');
create policy "stock_refunds_delete_all" on stock_refunds for delete using (auth.role() = 'authenticated');
create policy "purchase_requests_delete_all" on purchase_requests for delete using (auth.role() = 'authenticated');
create policy "purchase_request_items_delete_all" on purchase_request_items for delete using (auth.role() = 'authenticated');
create policy "pm_requests_delete_all" on pm_requests for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Fix 3: Project delete, with the approval gate requested — deletable
-- freely while still early (New Request / Request Submitted), but once a
-- Project has moved past that, only Manager/Super Admin can delete it.
-- ---------------------------------------------------------------------------
create policy "projects_delete_gated" on projects
  for delete using (
    status in ('New Request', 'Request Submitted')
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager'))
  );

-- =============================================================================
-- 0006 — Reset ALL chat RLS policies to a known-good, complete state
-- =============================================================================
-- Run in Supabase SQL Editor AFTER 0001-0005.
--
-- Why this exists: "new row violates row-level security policy for table
-- chat_conversations" means there's currently NO policy allowing insert on
-- that table at all (RLS denies by default with zero matching policies) —
-- even though 0003_chat.sql should have created one. Rather than guess why
-- (partial run, a "skip on already exists" during an earlier pass, etc.),
-- this migration drops every chat-related policy by name and recreates all
-- of them fresh, so the result is correct regardless of whatever partial
-- state the database is currently in. Safe to re-run any number of times.

drop policy if exists "chat_conversations_select_participant" on chat_conversations;
drop policy if exists "chat_conversations_insert_any_authenticated" on chat_conversations;
drop policy if exists "chat_participants_select_own_conversations" on chat_participants;
drop policy if exists "chat_participants_insert_any_authenticated" on chat_participants;
drop policy if exists "chat_messages_select_participant" on chat_messages;
drop policy if exists "chat_messages_insert_participant" on chat_messages;

-- Make sure the helper function exists (created in 0005; recreated here too
-- in case 0005 was skipped for the same reason as above).
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

create policy "chat_conversations_select_participant" on chat_conversations
  for select using (is_chat_participant(id, auth.uid()));

create policy "chat_conversations_insert_any_authenticated" on chat_conversations
  for insert with check (auth.uid() is not null);

create policy "chat_participants_select_own_conversations" on chat_participants
  for select using (is_chat_participant(conversation_id, auth.uid()));

create policy "chat_participants_insert_any_authenticated" on chat_participants
  for insert with check (auth.uid() is not null);

create policy "chat_messages_select_participant" on chat_messages
  for select using (is_chat_participant(chat_messages.conversation_id, auth.uid()));

create policy "chat_messages_insert_participant" on chat_messages
  for insert with check (
    sender_id = auth.uid() and is_chat_participant(chat_messages.conversation_id, auth.uid())
  );

-- Sanity check: confirm RLS is actually enabled on all three tables (it's
-- possible for policies to exist but RLS itself to be off, which would
-- make this a moot point but is worth ruling out explicitly).
alter table chat_conversations enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

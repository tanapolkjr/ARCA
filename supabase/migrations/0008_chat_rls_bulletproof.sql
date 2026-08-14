-- =============================================================================
-- 0008 — Bulletproof chat RLS fix: drop EVERY policy on the chat tables by
-- querying pg_policies directly (not just the specific names from 0003/0006),
-- then recreate clean ones. Run this in Supabase SQL Editor.
-- =============================================================================
-- Why this version is different: 0006 dropped policies by name, assuming we
-- knew exactly what existed. If chat is still broken after running 0006,
-- something doesn't match that assumption. This version doesn't guess names
-- at all — it looks up whatever actually exists on these 3 tables right now
-- and removes every single one of them, so nothing can be left behind.

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where tablename in ('chat_conversations', 'chat_participants', 'chat_messages')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Confirm RLS is on (policies do nothing if RLS itself is off).
alter table chat_conversations enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

-- Recreate the helper function fresh.
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

-- Simple, permissive policies — any authenticated user can start a
-- conversation and add participants; reads/writes to messages are scoped
-- to actual participants via the helper function above.
create policy "chat_conversations_select" on chat_conversations
  for select using (is_chat_participant(id, auth.uid()));

create policy "chat_conversations_insert" on chat_conversations
  for insert with check (auth.uid() is not null);

create policy "chat_participants_select" on chat_participants
  for select using (is_chat_participant(conversation_id, auth.uid()));

create policy "chat_participants_insert" on chat_participants
  for insert with check (auth.uid() is not null);

create policy "chat_messages_select" on chat_messages
  for select using (is_chat_participant(chat_messages.conversation_id, auth.uid()));

create policy "chat_messages_insert" on chat_messages
  for insert with check (
    sender_id = auth.uid() and is_chat_participant(chat_messages.conversation_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- DIAGNOSTIC — run this separately AFTER the above, and share the result if
-- chat is still broken. This shows exactly what policies exist right now,
-- removing all guesswork.
-- ---------------------------------------------------------------------------
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('chat_conversations', 'chat_participants', 'chat_messages')
-- order by tablename, cmd;

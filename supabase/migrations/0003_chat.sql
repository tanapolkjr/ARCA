-- =============================================================================
-- 0003 — Internal chat between users (1-1 and group)
-- =============================================================================
-- Run this in Supabase SQL Editor AFTER 0001_init.sql and 0002_storage.sql.
-- This is a genuinely new feature (not in the original written spec — the
-- spec only covered per-record Comment & Notification), added per explicit
-- request: "คุยกัน 1-1 หรือสร้างกลุ่มแชทได้".

create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  name text, -- null for 1-1 chats (display name derived from the other participant)
  is_group boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table chat_participants (
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on chat_messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — unlike most other tables in this app, chat privacy matters: a user
-- must only see conversations/messages they are a participant of. This is
-- stricter than the "read-all-authenticated" baseline used elsewhere.
-- ---------------------------------------------------------------------------
alter table chat_conversations enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

create policy "chat_conversations_select_participant" on chat_conversations
  for select using (
    exists (select 1 from chat_participants p where p.conversation_id = id and p.user_id = auth.uid())
  );
create policy "chat_conversations_insert_any_authenticated" on chat_conversations
  for insert with check (auth.role() = 'authenticated');

create policy "chat_participants_select_own_conversations" on chat_participants
  for select using (
    exists (select 1 from chat_participants p2 where p2.conversation_id = conversation_id and p2.user_id = auth.uid())
  );
create policy "chat_participants_insert_any_authenticated" on chat_participants
  for insert with check (auth.role() = 'authenticated');

create policy "chat_messages_select_participant" on chat_messages
  for select using (
    exists (select 1 from chat_participants p where p.conversation_id = chat_messages.conversation_id and p.user_id = auth.uid())
  );
create policy "chat_messages_insert_participant" on chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from chat_participants p where p.conversation_id = chat_messages.conversation_id and p.user_id = auth.uid())
  );

-- Enable Realtime on messages so the chat UI updates live without polling.
-- Wrapped to be safe to re-run (fails harmlessly if already added).
do $$
begin
  alter publication supabase_realtime add table chat_messages;
exception when duplicate_object then
  null;
end $$;

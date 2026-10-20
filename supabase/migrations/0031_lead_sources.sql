-- =============================================================================
-- 0031 — แหล่งที่มาของงาน (Lead source) สำหรับรายงานยอดขายตามแหล่งที่มา
--
--   • lead_sources               รายการแหล่งที่มา แก้ได้ที่ Accounting › Company Settings
--                                (แบบเดียวกับ Target channels ของ Sourcing)
--   • ar_documents.lead_source_id เลือกที่ใบเสนอราคา แล้วไหลตามไปใบที่แปลงต่อ
--
-- เลือกได้ใบละหนึ่งแหล่ง เพื่อให้รายงานรวม % ได้ 100% พอดี
-- ใบเก่าที่ยังไม่ได้ระบุ → รายงานแสดงเป็น "ไม่ระบุ"
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create table if not exists public.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(100) not null unique,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.lead_sources (name, sort_order) values
  ('Developer', 1), ('Designer', 2), ('End-User', 3), ('Construction', 4), ('Hotel', 5)
on conflict (name) do nothing;

alter table public.ar_documents
  add column if not exists lead_source_id uuid references public.lead_sources(id) on delete set null;
create index if not exists ar_documents_lead_source_idx on public.ar_documents (lead_source_id);

-- ใบลูก (ใบแจ้งหนี้/ใบกำกับ) ที่แปลงไปแล้วก่อนมีช่องนี้ → ยังไม่มีค่า ไม่เป็นไร
-- รายงานอ่านแหล่งที่มาจากใบเสนอราคาต้นทางเสมอ

alter table public.lead_sources enable row level security;
drop policy if exists lead_sources_read  on public.lead_sources;
drop policy if exists lead_sources_write on public.lead_sources;
create policy lead_sources_read on public.lead_sources
  for select to authenticated using (true);
create policy lead_sources_write on public.lead_sources
  for all to authenticated
  using (public.is_accounting_user()) with check (public.is_accounting_user());

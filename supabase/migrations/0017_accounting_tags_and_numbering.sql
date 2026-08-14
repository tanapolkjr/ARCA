-- =============================================================================
-- 0017 — Accounting round 2
--   • เปลี่ยนรูปแบบเลขเอกสารเป็นรายเดือน  QT + YYYY + MM + NNN
--   • Tag ประเภทงาน (Smart Lock / Construction Product / …) ใช้ filter และจัดกลุ่ม
--   • ส่วนลดใส่เป็น % ได้
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. เลขเอกสารรายเดือน
--    เดิม: QT202608040006 (prefix + วันที่เต็ม + 4 หลัก รีเซ็ตรายวัน)
--    ใหม่: QT202608001     (prefix + ปี + เดือน + 3 หลัก รีเซ็ตรายเดือน)
--    ยึดตามวันที่ออกจริงของเอกสาร
-- ---------------------------------------------------------------------------
create or replace function public.next_document_no(
  p_company uuid, p_doc_type text, p_prefix text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(p_date, 'YYYYMM');
  v_num    integer;
begin
  insert into public.document_sequences (company_id, doc_type, prefix, period_key, last_number)
  values (p_company, p_doc_type, p_prefix, v_period, 1)
  on conflict (company_id, doc_type, period_key)
    do update set last_number = document_sequences.last_number + 1
  returning last_number into v_num;

  return p_prefix || v_period || lpad(v_num::text, 3, '0');
end $$;

create or replace function public.seed_document_sequence(
  p_company uuid, p_doc_type text, p_prefix text, p_date date, p_last integer)
returns void language sql security definer set search_path = public as $$
  insert into public.document_sequences (company_id, doc_type, prefix, period_key, last_number)
  values (p_company, p_doc_type, p_prefix, to_char(p_date, 'YYYYMM'), p_last)
  on conflict (company_id, doc_type, period_key)
    do update set last_number = greatest(document_sequences.last_number, excluded.last_number);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tag ประเภทงาน
--    ยึดจากใบเสนอราคา แล้วไหลตามไปทุกเอกสารที่แปลงต่อ
--    เพื่อให้ทุกหน้าในโมดูลกรองและรวมยอดตามประเภทงานเดียวกันได้
-- ---------------------------------------------------------------------------
create table if not exists public.document_tags (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(80) not null unique,
  color      varchar(20) not null default 'slate',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.document_tags (name, color, sort_order) values
  ('Smart Lock', 'indigo', 0),
  ('Hotel Lock', 'violet', 1),
  ('Smart Switch', 'sky', 2),
  ('Plug & Socket', 'teal', 3),
  ('Construction Product', 'amber', 4),
  ('Service / งานบริการ', 'emerald', 5),
  ('อื่นๆ', 'slate', 6)
on conflict (name) do nothing;

alter table public.ar_documents add column if not exists tag_id uuid references public.document_tags(id) on delete set null;
alter table public.ap_documents add column if not exists tag_id uuid references public.document_tags(id) on delete set null;
create index if not exists ar_documents_tag_idx on public.ar_documents (tag_id);
create index if not exists ap_documents_tag_idx on public.ap_documents (tag_id);

-- ---------------------------------------------------------------------------
-- 3. ส่วนลดเป็นเปอร์เซ็นต์
--    discount_amount ยังเป็นตัวเลขที่ใช้คำนวณจริงเสมอ
--    discount_percent เก็บไว้เพื่อให้เปิดเอกสารกลับมาแก้แล้วยังเห็นว่ากรอกมาเป็น %
-- ---------------------------------------------------------------------------
alter table public.ar_document_items add column if not exists discount_percent decimal(6,3);
alter table public.ap_document_items add column if not exists discount_percent decimal(6,3);

-- ---------------------------------------------------------------------------
-- 4. RLS ของตารางใหม่ (แบบเดียวกับ 0016)
-- ---------------------------------------------------------------------------
alter table public.document_tags enable row level security;
drop policy if exists "document_tags_acct_read"  on public.document_tags;
drop policy if exists "document_tags_acct_write" on public.document_tags;
create policy "document_tags_acct_read" on public.document_tags
  for select to authenticated using (true);
create policy "document_tags_acct_write" on public.document_tags
  for all to authenticated
  using (public.is_accounting_user()) with check (public.is_accounting_user());

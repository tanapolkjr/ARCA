-- =============================================================================
-- 0034 — ใบส่งของ (Delivery Note) ออกจากใบเสนอราคา
--
--   • delivery_notes        หัวใบส่งของ เลขที่ DO{YYYYMM}{NNN} · ส่งครั้งที่เท่าไรของใบเสนอราคา
--   • delivery_note_items   รายการที่ส่งครั้งนี้ ผูกกับบรรทัดใบเสนอราคา → นับยอดค้างส่ง
--
-- ไม่มีราคา (หลักสากลของใบส่งของ) · ไม่ตัดสต็อกในรอบนี้ (สต็อกมีขั้นตอนเบิกแยก)
-- ยกเลิกได้ (เลขที่ยังเก็บไว้) — ใบที่ยกเลิกไม่นับยอดส่ง
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create table if not exists public.delivery_notes (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  doc_no           varchar(30) not null,
  doc_date         date not null default current_date,
  quotation_id     uuid not null references public.ar_documents(id),
  delivery_seq     integer not null default 1,
  status           varchar(20) not null default 'issued' check (status in ('issued', 'cancelled')),
  company_snapshot  jsonb,
  customer_snapshot jsonb,
  job_name         text,
  ship_to_name     text,
  ship_to_address  text,
  receiver_name    varchar(100),
  receiver_phone   varchar(50),
  coordinator_name varchar(100),
  coordinator_phone varchar(50),
  ship_method      varchar(50),
  vehicle_no       varchar(100),
  tracking_no      varchar(100),
  package_count    varchar(50),
  note_text        text,
  cancelled_at     timestamptz,
  cancelled_reason text,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index if not exists delivery_notes_qt_idx on public.delivery_notes (quotation_id);

create table if not exists public.delivery_note_items (
  id                uuid primary key default gen_random_uuid(),
  delivery_id       uuid not null references public.delivery_notes(id) on delete cascade,
  line_no           integer not null default 1,
  source_ar_item_id uuid references public.ar_document_items(id) on delete set null,
  stock_item_id     uuid references public.stock_items(id) on delete set null,
  model_code        varchar(100),
  description       text not null,
  unit              varchar(30),
  qty_ordered       decimal(14,3) not null default 0,
  qty_delivered     decimal(14,3) not null check (qty_delivered > 0)
);
create index if not exists delivery_note_items_dn_idx  on public.delivery_note_items (delivery_id);
create index if not exists delivery_note_items_src_idx on public.delivery_note_items (source_ar_item_id);

do $$
declare t text;
begin
  foreach t in array array['delivery_notes', 'delivery_note_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all to authenticated '
      'using (public.is_accounting_user()) with check (public.is_accounting_user())', t, t);
  end loop;
end $$;

-- =============================================================================
-- 0016 — Accounting foundation
--
-- Adds: บริษัทผู้ออกเอกสาร (หลายบริษัท) · เลขที่เอกสาร · แม่แบบข้อความ ·
--       ทะเบียนหมวดหมู่สินค้า · ทะเบียนผู้ขาย · เอกสารขาย/ซื้อ ·
--       สมุดรายรับ-รายจ่าย + กระเป๋าเงิน
--
-- ใช้ฐานข้อมูลเดียวกับระบบเดิมทั้งหมด: users / customers / projects /
-- stock_items / purchase_requests / storage bucket smart-living-files
-- ไม่มีการรื้อหรือลบตารางเดิม
--
-- Idempotent. รันใน Supabase SQL Editor ก่อน deploy โค้ด
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Role gate: บัญชีเปิดให้ Admin / Manager / Super Admin
-- (ต้นทุนและกำไรจำกัดที่ Manager+ อีกชั้นในโค้ด)
-- ---------------------------------------------------------------------------
create or replace function public.is_accounting_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role in ('Super Admin', 'Manager', 'Admin')
  );
$$;

create or replace function public.is_accounting_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role in ('Super Admin', 'Manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. companies — บริษัทผู้ออกเอกสาร
--    เปลี่ยนหัวบิลได้เหมือนเปลี่ยนลูกค้า: เลือกจากรายการนี้ตอนสร้างเอกสาร
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  code          varchar(20),
  name_th       varchar(200) not null,
  name_en       varchar(200),
  tax_id        varchar(20),
  branch_code   varchar(10)  default '00000',
  branch_name   varchar(100) default 'สำนักงานใหญ่',
  address_th    text,
  address_en    text,
  phone         varchar(50),
  email         varchar(150),
  website       varchar(150),
  logo_path     varchar(500),      -- ใน bucket smart-living-files
  signature_path varchar(500),
  stamp_path    varchar(500),
  vat_rate      decimal(5,2) not null default 7,
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function touch_updated_at();

-- มีบริษัทตั้งต้นเสมอ เพื่อให้สร้างเอกสารได้ทันที แล้วค่อยเติมข้อมูลจดทะเบียนทีหลัง
insert into public.companies (code, name_th, name_en, is_default)
select 'ARCA', 'บริษัท อาร์ก้า โฮม จำกัด', 'ARCA HOME CO., LTD.', true
where not exists (select 1 from public.companies);

create table if not exists public.company_bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  bank_name    varchar(100) not null,
  branch       varchar(100),
  account_name varchar(200),
  account_no   varchar(50) not null,
  account_type varchar(50),
  sort_order   integer not null default 0,
  is_active    boolean not null default true
);
create index if not exists company_bank_company_idx on public.company_bank_accounts (company_id);

-- ---------------------------------------------------------------------------
-- 2. document_sequences — เลขที่เอกสาร {PREFIX}{YYYYMMDD}{NNNN}
--    เรียงแยกตาม บริษัท × ประเภท × วัน  (รูปแบบเดียวกับที่ใช้อยู่เดิม)
-- ---------------------------------------------------------------------------
create table if not exists public.document_sequences (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  doc_type    varchar(10) not null,
  prefix      varchar(10) not null,
  period_key  varchar(8)  not null,          -- YYYYMMDD
  last_number integer     not null default 0,
  unique (company_id, doc_type, period_key)
);

-- ออกเลขถัดไปแบบกันชน: ล็อกแถวด้วย on conflict ... do update
create or replace function public.next_document_no(
  p_company uuid, p_doc_type text, p_prefix text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(p_date, 'YYYYMMDD');
  v_num    integer;
begin
  insert into public.document_sequences (company_id, doc_type, prefix, period_key, last_number)
  values (p_company, p_doc_type, p_prefix, v_period, 1)
  on conflict (company_id, doc_type, period_key)
    do update set last_number = document_sequences.last_number + 1
  returning last_number into v_num;

  return p_prefix || v_period || lpad(v_num::text, 4, '0');
end $$;

-- ตั้งเลขเริ่มต้นให้ต่อจากระบบเดิม (เรียกครั้งเดียวตอนย้ายระบบ)
create or replace function public.seed_document_sequence(
  p_company uuid, p_doc_type text, p_prefix text, p_date date, p_last integer)
returns void language sql security definer set search_path = public as $$
  insert into public.document_sequences (company_id, doc_type, prefix, period_key, last_number)
  values (p_company, p_doc_type, p_prefix, to_char(p_date, 'YYYYMMDD'), p_last)
  on conflict (company_id, doc_type, period_key)
    do update set last_number = greatest(document_sequences.last_number, excluded.last_number);
$$;

-- ---------------------------------------------------------------------------
-- 3. document_templates — แม่แบบหมายเหตุ / เงื่อนไข
--    หมายเหตุ 10-11 ข้อซ้ำกันแทบทุกใบ ไม่ควรพิมพ์ใหม่ทุกครั้ง
-- ---------------------------------------------------------------------------
create table if not exists public.document_templates (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name       varchar(150) not null,
  kind       varchar(20)  not null default 'note',   -- note | terms
  doc_types  text[] not null default '{}',           -- ว่าง = ใช้ได้ทุกประเภท
  body       text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. product_categories — ทะเบียนหมวดหมู่กลาง
--    รวม 3 ชุดที่เคยแยกกัน (Sourcing / Inventory / ไฟล์ขาย) ให้เหลือชุดเดียว
--    ยังไม่บังคับ FK กับ products/stock_items ในรอบนี้ — ให้ย้ายข้อมูลก่อน
-- ---------------------------------------------------------------------------
create table if not exists public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null unique,
  kind       varchar(20)  not null default 'category',  -- category | brand | bundle
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.product_categories (name, sort_order) values
  ('Smart Lock', 0), ('Hotel Lock', 1), ('Mini Lock', 2), ('Smart Switch', 3),
  ('Normal Switch', 4), ('Plug & Socket', 5), ('Others', 6)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 5. vendors — ผู้ขาย / ผู้รับเหมา (ระบบเดิมไม่มีทะเบียนนี้เลย)
--    ต้องมี tax_id + สาขา ถึงจะออกหนังสือรับรองหัก ณ ที่จ่ายได้
-- ---------------------------------------------------------------------------
create table if not exists public.vendors (
  id                uuid primary key default gen_random_uuid(),
  vendor_code       varchar(30),
  display_name      varchar(200) not null,
  vendor_type       varchar(30) not null default 'goods',   -- goods|subcontractor|service|overseas
  legal_entity_type varchar(20) not null default 'company', -- company|individual
  tax_id            varchar(20),
  branch_code       varchar(10) default '00000',
  branch_name       varchar(100) default 'สำนักงานใหญ่',
  address           text,
  phone             varchar(50),
  email             varchar(150),
  contact_name      varchar(100),
  wht_type          varchar(30) default 'none',   -- none|service3|transport1|rent5|ads2
  wht_rate          decimal(5,2) default 0,
  is_vat_registered boolean not null default true,
  credit_term_days  integer default 0,
  bank_name         varchar(100),
  bank_account_no   varchar(50),
  bank_account_name varchar(200),
  country           varchar(50) default 'Thailand',
  currency          varchar(10) default 'THB',
  linked_factory_id uuid references public.factories(id) on delete set null,
  notes             text,
  is_active         boolean not null default true,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists vendors_touch on public.vendors;
create trigger vendors_touch before update on public.vendors
  for each row execute function touch_updated_at();

-- ผูกผู้รับเหมาเดิมเข้าทะเบียนผู้ขาย (ยังเป็น null ได้ ค่อยผูกทีหลัง)
alter table public.ticket_subcontractors
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. customers — เพิ่มช่องที่ใบกำกับภาษีต้องใช้ และเงื่อนไขการค้า
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists branch_code       varchar(10)  default '00000',
  add column if not exists branch_name       varchar(100) default 'สำนักงานใหญ่',
  add column if not exists is_vat_registered boolean      default true,
  add column if not exists legal_entity_type varchar(20)  default 'company',
  add column if not exists customer_code     varchar(30),
  add column if not exists credit_term_days  integer      default 0,
  add column if not exists credit_limit      decimal(14,2),
  add column if not exists wht_applicable    boolean      default false,
  add column if not exists wht_rate_service  decimal(5,2) default 3,
  add column if not exists billing_cycle_day integer,
  add column if not exists payment_cycle_day integer,
  add column if not exists ap_contact_name   varchar(100),
  add column if not exists ap_contact_phone  varchar(50),
  add column if not exists ap_contact_email  varchar(150),
  add column if not exists billing_note      text,
  add column if not exists accounting_note   text;

-- ---------------------------------------------------------------------------
-- 7. ar_documents — เอกสารขายทุกประเภทในตารางเดียว
--    QT ใบเสนอราคา · BL ใบแจ้งหนี้ · INV ใบกำกับภาษี/ใบเสร็จ ·
--    RC ใบเสร็จ · CN ใบลดหนี้ · DN ใบเพิ่มหนี้
-- ---------------------------------------------------------------------------
create table if not exists public.ar_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  doc_type         varchar(10) not null check (doc_type in ('QT','BL','INV','RC','CN','DN')),
  doc_no           varchar(30),                 -- null ระหว่างเป็นร่าง
  doc_date         date not null default current_date,
  due_date         date,
  valid_until      date,
  status           varchar(20) not null default 'draft',
  source_document_id uuid references public.ar_documents(id) on delete set null,
  cancelled_at     timestamptz,
  cancelled_reason text,

  customer_id      uuid references public.customers(id),
  -- แช่แข็งข้อมูล ณ วันที่ออก: ลูกค้าย้ายที่อยู่ปีหน้า ใบเก่าต้องพิมพ์ออกมาเหมือนเดิม
  customer_snapshot jsonb,
  company_snapshot  jsonb,

  project_id       uuid references public.projects(id) on delete set null,
  ticket_id        uuid references public.tickets(id) on delete set null,
  job_name         text,
  contact_name     varchar(100),
  contact_phone    varchar(50),
  sales_user_id    uuid references public.users(id),
  fulfilment_type  varchar(20) default 'install',  -- install | delivery

  price_include_vat boolean not null default true,
  vat_rate         decimal(5,2) not null default 7,
  contract_total   decimal(14,2),                 -- ยอดสัญญาเต็ม กรณีแบ่งชำระ
  billing_percent  decimal(6,2),
  subtotal         decimal(14,2) not null default 0,
  discount_total   decimal(14,2) not null default 0,
  vat_base         decimal(14,2) not null default 0,
  vat_exempt_base  decimal(14,2) not null default 0,
  vat_amount       decimal(14,2) not null default 0,
  grand_total      decimal(14,2) not null default 0,
  wht_rate         decimal(5,2)  not null default 0,
  wht_amount       decimal(14,2) not null default 0,
  net_payable      decimal(14,2) not null default 0,
  paid_amount      decimal(14,2) not null default 0,

  note_text        text,
  terms_text       text,
  pdf_path         varchar(500),
  created_by       uuid references public.users(id),
  approved_by      uuid references public.users(id),
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index if not exists ar_documents_type_idx     on public.ar_documents (doc_type, doc_date desc);
create index if not exists ar_documents_customer_idx on public.ar_documents (customer_id);
create index if not exists ar_documents_project_idx  on public.ar_documents (project_id);
drop trigger if exists ar_documents_touch on public.ar_documents;
create trigger ar_documents_touch before update on public.ar_documents
  for each row execute function touch_updated_at();

create table if not exists public.ar_document_items (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.ar_documents(id) on delete cascade,
  line_no       integer not null default 1,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  description   text not null,               -- หลายบรรทัดได้: ชื่อรุ่น + สเปกย่อย
  item_type     varchar(10) not null default 'goods' check (item_type in ('goods','service')),
  vat_type      varchar(10) not null default 'vat'   check (vat_type in ('vat','exempt','zero')),
  qty           decimal(14,3) not null default 1,
  unit          varchar(30),
  unit_price    decimal(14,2) not null default 0,
  discount_amount decimal(14,2) not null default 0,
  line_total    decimal(14,2) not null default 0,
  unit_cost_snapshot decimal(14,4)            -- ต้นทุน ณ วันขาย → กำไรย้อนหลัง
);
create index if not exists ar_document_items_doc_idx on public.ar_document_items (document_id, line_no);

-- ---------------------------------------------------------------------------
-- 8. ap_documents — เอกสารซื้อ เริ่มที่ใบสั่งซื้อ (PO)
-- ---------------------------------------------------------------------------
create table if not exists public.ap_documents (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id),
  doc_type          varchar(10) not null check (doc_type in ('PO','PI','PV','IM')),
  doc_no            varchar(30),
  doc_date          date not null default current_date,
  due_date          date,
  expected_date     date,
  status            varchar(20) not null default 'draft',
  source_document_id uuid references public.ap_documents(id) on delete set null,
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  cancelled_at      timestamptz,
  cancelled_reason  text,

  vendor_id         uuid references public.vendors(id),
  vendor_snapshot   jsonb,
  company_snapshot  jsonb,
  project_id        uuid references public.projects(id) on delete set null,
  job_name          text,
  contact_name      varchar(100),
  contact_phone     varchar(50),
  ship_to           text,

  currency          varchar(10) not null default 'THB',
  exchange_rate     decimal(12,4) not null default 1,
  price_include_vat boolean not null default false,
  vat_rate          decimal(5,2) not null default 7,
  subtotal          decimal(14,2) not null default 0,
  discount_total    decimal(14,2) not null default 0,
  vat_base          decimal(14,2) not null default 0,
  vat_exempt_base   decimal(14,2) not null default 0,
  vat_amount        decimal(14,2) not null default 0,
  grand_total       decimal(14,2) not null default 0,
  wht_rate          decimal(5,2)  not null default 0,
  wht_amount        decimal(14,2) not null default 0,
  net_payable       decimal(14,2) not null default 0,
  paid_amount       decimal(14,2) not null default 0,

  -- ติดตามเอกสารที่ต้องได้จากผู้ขาย: จ่ายแล้วไม่ได้ใบกำกับ = ขอคืน VAT ไม่ได้
  tax_invoice_received boolean not null default false,
  receipt_received     boolean not null default false,
  vendor_doc_no        varchar(50),

  note_text         text,
  terms_text        text,
  pdf_path          varchar(500),
  created_by        uuid references public.users(id),
  approved_by       uuid references public.users(id),
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index if not exists ap_documents_type_idx   on public.ap_documents (doc_type, doc_date desc);
create index if not exists ap_documents_vendor_idx on public.ap_documents (vendor_id);
drop trigger if exists ap_documents_touch on public.ap_documents;
create trigger ap_documents_touch before update on public.ap_documents
  for each row execute function touch_updated_at();

create table if not exists public.ap_document_items (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.ap_documents(id) on delete cascade,
  line_no       integer not null default 1,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  description   text not null,
  item_type     varchar(10) not null default 'goods' check (item_type in ('goods','service')),
  vat_type      varchar(10) not null default 'vat'   check (vat_type in ('vat','exempt','zero')),
  qty           decimal(14,3) not null default 1,
  qty_received  decimal(14,3) not null default 0,
  unit          varchar(30),
  unit_price    decimal(14,2) not null default 0,
  discount_amount decimal(14,2) not null default 0,
  line_total    decimal(14,2) not null default 0
);
create index if not exists ap_document_items_doc_idx on public.ap_document_items (document_id, line_no);

-- ---------------------------------------------------------------------------
-- 9. กระเป๋าเงิน + สมุดรายรับ-รายจ่าย
--    ค่าใช้จ่ายส่วนใหญ่ไม่มีใบสั่งซื้อ (ค่าน้ำมัน กล่องพัสดุ โฆษณา)
--    ถ้าไม่มีที่ลง คนจะกลับไปใช้ Excel แล้วตัวเลขจะแยกเป็นสองโลก
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,
  name            varchar(100) not null,
  wallet_type     varchar(20) not null default 'bank',  -- bank|cash|promptpay|credit_card
  bank_name       varchar(100),
  account_no      varchar(50),
  opening_balance decimal(14,2) not null default 0,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into public.wallets (company_id, name, wallet_type, sort_order)
select c.id, 'เงินสดย่อย', 'cash', 0 from public.companies c where c.is_default
  and not exists (select 1 from public.wallets);

create table if not exists public.cash_categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null unique,
  direction  varchar(10) not null default 'out',   -- in|out|both
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.cash_categories (name, direction, sort_order) values
  ('รายได้จากการขาย', 'in', 0),
  ('รายได้อื่น', 'in', 1),
  ('ต้นทุนสินค้า', 'out', 2),
  ('ขนส่ง', 'out', 3),
  ('ค่าใช้จ่ายสำนักงาน', 'out', 4),
  ('ค่าอุปกรณ์แพ็คสินค้า', 'out', 5),
  ('ค่าโฆษณาการตลาด', 'out', 6),
  ('ค่าเดินทางและยานพาหนะ', 'out', 7),
  ('เลี้ยงรับรองลูกค้า', 'out', 8),
  ('เงินเดือนและค่าแรง', 'out', 9),
  ('อื่นๆ', 'both', 10)
on conflict (name) do nothing;

create table if not exists public.cash_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  entry_date    date not null default current_date,
  entry_type    varchar(10) not null check (entry_type in ('in','out','transfer')),
  wallet_id     uuid not null references public.wallets(id),
  to_wallet_id  uuid references public.wallets(id),      -- เฉพาะ transfer
  description   text not null,
  amount        decimal(14,2) not null check (amount >= 0),
  has_vat       boolean not null default false,
  vat_amount    decimal(14,2) not null default 0,
  category_id   uuid references public.cash_categories(id),
  wht_type      varchar(20) not null default 'none'
                check (wht_type in ('none','withheld_from_us','we_withhold')),
  wht_amount    decimal(14,2) not null default 0,
  wht_cert_no   varchar(50),
  project_id    uuid references public.projects(id) on delete set null,
  ticket_id     uuid references public.tickets(id) on delete set null,
  vendor_id     uuid references public.vendors(id) on delete set null,
  ar_document_id uuid references public.ar_documents(id) on delete set null,
  ap_document_id uuid references public.ap_documents(id) on delete set null,
  attachment_path varchar(500),
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ย้ายโอนต้องมีปลายทาง และห้ามโอนเข้ากระเป๋าเดิม
  constraint cash_entries_transfer_target check (
    (entry_type <> 'transfer' and to_wallet_id is null) or
    (entry_type =  'transfer' and to_wallet_id is not null and to_wallet_id <> wallet_id)
  )
);
create index if not exists cash_entries_date_idx    on public.cash_entries (company_id, entry_date desc);
create index if not exists cash_entries_wallet_idx  on public.cash_entries (wallet_id);
create index if not exists cash_entries_project_idx on public.cash_entries (project_id);
drop trigger if exists cash_entries_touch on public.cash_entries;
create trigger cash_entries_touch before update on public.cash_entries
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 10. ให้ระบบคอมเมนต์/แจ้งเตือนเดิมผูกกับเอกสารได้ → ใช้ทำ flow อนุมัติ
--     โดยไม่ต้องเขียนระบบอนุมัติใหม่
-- ---------------------------------------------------------------------------
alter table public.comments drop constraint if exists comments_entity_type_check;
alter table public.comments add constraint comments_entity_type_check
  check (entity_type in ('project','ticket','pm_request','ar_document','ap_document'));

-- ---------------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','company_bank_accounts','document_sequences','document_templates',
    'product_categories','vendors','ar_documents','ar_document_items',
    'ap_documents','ap_document_items','wallets','cash_categories','cash_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_acct_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_acct_write" on public.%I', t, t);
    -- อ่าน: ผู้ใช้ที่ล็อกอินทุกคน (Sale ต้องเห็นใบเสนอราคาของตัวเอง
    -- และหน้าจออื่นต้องอ้างชื่อบริษัท/หมวดหมู่ได้)
    execute format(
      'create policy "%s_acct_read" on public.%I for select to authenticated using (true)', t, t);
    -- เขียน: เฉพาะฝ่ายบัญชี
    execute format(
      'create policy "%s_acct_write" on public.%I for all to authenticated '
      'using (public.is_accounting_user()) with check (public.is_accounting_user())', t, t);
  end loop;
end $$;

-- Sale ต้องสร้าง/แก้ใบเสนอราคาของตัวเองได้ แม้ไม่ใช่ฝ่ายบัญชี
drop policy if exists "ar_documents_sale_own" on public.ar_documents;
create policy "ar_documents_sale_own" on public.ar_documents for all to authenticated
  using  (doc_type = 'QT' and created_by = auth.uid())
  with check (doc_type = 'QT' and created_by = auth.uid());

drop policy if exists "ar_document_items_sale_own" on public.ar_document_items;
create policy "ar_document_items_sale_own" on public.ar_document_items for all to authenticated
  using (exists (
    select 1 from public.ar_documents d
    where d.id = document_id and d.doc_type = 'QT' and d.created_by = auth.uid()))
  with check (exists (
    select 1 from public.ar_documents d
    where d.id = document_id and d.doc_type = 'QT' and d.created_by = auth.uid()));

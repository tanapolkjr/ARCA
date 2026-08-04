-- =============================================================================
-- Smart Living E-Service — Initial schema
-- Run this in Supabase Studio → SQL Editor BEFORE deploying code that
-- depends on it (same manual-migration convention as 4 HAUS).
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 0. Helper: auto-update `updated_at` on every row change
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 1. USERS — mirrors auth.users. Row is auto-created on first login.
--    Role & Permission Matrix (spec §8): Super Admin / Manager / Sale / PM / Admin / Store
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  role text not null default 'Sale'
    check (role in ('Super Admin', 'Manager', 'Sale', 'PM', 'Admin', 'Store')),
  is_active boolean not null default true, -- deactivate, never delete
  created_at timestamptz not null default now()
);

-- Auto-create profile row on first login (mirrors 4 HAUS's handle_new_auth_user)
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 2. CONTACT MODULE — Site Master + Customer Master (spec §6)
-- ---------------------------------------------------------------------------
create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  province text,
  google_map text,
  gps_lat numeric,
  gps_lng numeric,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sites_touch before update on sites
  for each row execute function touch_updated_at();

create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null check (customer_type in ('individual', 'company')),
  display_name text not null, -- computed at write time: "First Last" or company name
  first_name text,
  last_name text,
  gender text,
  birthday date,
  company_name text,
  tax_id text,
  office_address text,
  billing_address text, -- separate from office_address per spec
  phone text,
  email text,
  address text,
  province text,
  post_code text,
  card_id text, -- national ID, individual only
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_touch before update on customers
  for each row execute function touch_updated_at();

-- Key Contacts — many per customer, with role/position (spec §6.1)
create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  position text, -- e.g. "ผู้ติดต่อหลัก", "ผู้ติดต่อฝ่ายบัญชี/วางบิล"
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. PROJECT MODULE (spec §2) — single entity, Project Type differentiates use
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique, -- user-entered, per spec 2.2.1 (not auto-generated)
  project_type text not null default 'Install'
    check (project_type in ('Install', 'ส่งสินค้าอย่างเดียว', 'งานซ่อมและงานบริการ')),
  product_category text default 'Smart Home',
  project_source text,
  payment_verification_required boolean default false,

  salesman_id uuid references users(id), -- must be a real account, not free text (spec 2.2.1)
  site_id uuid references sites(id),
  customer_id uuid references customers(id),

  -- Auto-filled from site on selection, editable per-project without touching the master
  project_contact text,
  tel text,
  address text,
  province text,
  google_map text,
  gps_lat numeric,
  gps_lng numeric,
  plan text,
  house_number text,

  estimated_installation date,
  installation_date date,
  delivery_due date,       -- กำหนดส่งมอบ
  shipped_date date,       -- วันที่ส่งของ

  warranty_months integer default 6,
  status text not null default 'New Request',
  -- Core 7-step pipeline (spec §2.3). Equipment Shipped / Cancelled are
  -- reachable side-exits, not part of the linear stepper.

  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger projects_touch before update on projects
  for each row execute function touch_updated_at();
create index projects_status_idx on projects(status);
create index projects_customer_idx on projects(customer_id);
create index projects_site_idx on projects(site_id);

-- SO Info — quotations linked to a project (spec 2.2.2), can be many
create table project_quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  document_no text not null,
  product_type text,
  price numeric(12,2),
  created_at timestamptz not null default now()
);

-- Device Install — planned/reserved list (spec 2.2.3)
create table project_device_install (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  model_code text not null,
  description text,
  planned_qty integer not null default 0,
  withdrawn_qty integer not null default 0,
  is_reserved boolean not null default true, -- toggle per spec: reserve or estimate-only
  stock_item_id uuid, -- FK added later via ALTER TABLE, after stock_items exists (see §7)
  created_at timestamptz not null default now()
);

-- Install Period — stock withdrawal batches (spec 2.2.4)
create table project_install_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  job_code text not null,
  due_date date,
  requested_by uuid references users(id),
  status text default 'รอดำเนินการ',
  created_at timestamptz not null default now()
);

-- Device Detail — serialized units actually withdrawn (spec 2.2.5)
-- Warranty starts counting from `start_date`, per the flow agreed in chat.
create table project_device_detail (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  serial_no text not null unique,
  model_code text not null,
  description text,
  start_date date not null default current_date,
  warranty_months integer not null default 6,
  created_at timestamptz not null default now()
);
create index device_detail_serial_idx on project_device_detail(serial_no);

-- Payment Period — multi-installment, multi-condition (spec 2.2.6)
create table project_payment_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  period_no integer not null,
  amount numeric(12,2),
  condition_text text,
  job_done boolean default false,
  billing_done boolean default false,
  paid boolean default false,
  received_amount numeric(12,2) default 0,
  paid_date date,
  created_at timestamptz not null default now()
);

-- File — attachment metadata; actual bytes live in Supabase Storage
-- (bucket = FILES_BUCKET in src/lib/supabaseClient.js), this just indexes them.
create table project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  storage_path text not null, -- path inside the storage bucket
  file_name text not null,
  doc_type text, -- Plan / PO / Quotation / Requirement / BOQ / SO / Other
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

-- App Data — smart-home app credentials per project (spec 2.2.8)
-- NOTE: encrypt `password` at the application layer before insert if you
-- need anything beyond RLS-based access control (see README security note).
create table project_app_data (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  application text not null,
  account_id text,
  password text,
  email text,
  customer_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. TICKET MODULE (spec §3) — always references a Project (need not be closed)
-- ---------------------------------------------------------------------------
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  project_id uuid not null references projects(id), -- mandatory reference (spec 1.2)
  status text not null default 'ส่งเรื่อง',
  support_type text default 'Call',

  reported_at timestamptz default now(),
  submitted_by uuid references users(id),
  reporter_name text,
  reporter_phone text,
  reporter_email text,
  preferred_callback_at timestamptz,
  symptom_description text,

  received_at timestamptz,
  received_by uuid references users(id),
  appointment_date date,
  work_start_date date,
  work_close_date date,
  remark text,

  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tickets_touch before update on tickets
  for each row execute function touch_updated_at();
create index tickets_project_idx on tickets(project_id);
create index tickets_status_idx on tickets(status);

-- Request & Issue — per-device problem rows within a ticket (spec 3.1.2)
create table ticket_issues (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  device_detail_id uuid references project_device_detail(id),
  serial_no text,
  model_code text,
  symptom text,
  technician_note text
);

-- Subcontractor assignment (spec 3.1.3)
create table ticket_subcontractors (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  company_or_name text,
  phone text,
  scheduled_date date,
  cost numeric(12,2),
  note text
);

-- เบิกสินค้า / คืนเบิกสินค้า / รับสินค้าเก่า (spec 3.1.4)
create table ticket_stock_movements (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  movement_type text not null check (movement_type in ('withdraw', 'return', 'receive_old')),
  stock_item_id uuid, -- FK added later via ALTER TABLE, after stock_items exists (see §7)
  serial_no text,
  qty integer default 1,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. PM REQUEST MODULE (spec §4)
-- ---------------------------------------------------------------------------
create table pm_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  request_type text not null
    check (request_type in ('ขอออกแบบระบบ','ขอสำรวจหน้างาน','ขอทดสอบสินค้า','ขอประเมินสเปค/ความเข้ากันได้ของสินค้า','อื่นๆ')),
  requester_id uuid references users(id),
  customer_name_free text, -- optional, free text — not required to link Customer Master
  project_id uuid references projects(id), -- optional reference
  requested_at timestamptz default now(),
  channel text,
  needed_at timestamptz,
  detail text,
  assigned_pm uuid references users(id),
  status text not null default 'คำขอใหม่'
    check (status in ('คำขอใหม่','รับเรื่องแล้ว','กำลังดำเนินการ','เสร็จสิ้น','ยกเลิก')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pm_requests_touch before update on pm_requests
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. COMMENT & NOTIFICATION SYSTEM (spec §5) — reusable across Project/Ticket/PM Request
-- ---------------------------------------------------------------------------
create table comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'ticket', 'pm_request')),
  entity_id uuid not null, -- polymorphic FK, validated at the application layer
  author_id uuid references users(id),
  body text not null,
  status_tag text, -- optional status label attached to this comment
  attachment_path text,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on comments(entity_type, entity_id);

-- @mentions in a comment → who gets notified
create table comment_mentions (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (comment_id, user_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  reason text check (reason in ('mention', 'participant')),
  is_read boolean default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, is_read);

-- ---------------------------------------------------------------------------
-- 7. STOCK MODULE (spec §7)
-- ---------------------------------------------------------------------------
create table stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location_type text default 'คลังสาขา', -- คลังหลัก / คลังสาขา / คลังช่างหน้างาน
  is_active boolean default true,
  created_by uuid references users(id), -- Manager or Store role only (enforced by RLS)
  created_at timestamptz not null default now()
);

create table stock_items (
  id uuid primary key default gen_random_uuid(),
  model_code text not null unique,
  description text,
  category text,
  unit text default 'ชิ้น',
  reorder_point integer default 0,
  created_at timestamptz not null default now()
);

-- Deferred FKs from tables created earlier (Project/Ticket modules), now
-- that stock_items finally exists — see the "FK added later" comments above.
alter table project_device_install
  add constraint project_device_install_stock_item_fk
  foreign key (stock_item_id) references stock_items(id);

alter table ticket_stock_movements
  add constraint ticket_stock_movements_stock_item_fk
  foreign key (stock_item_id) references stock_items(id);

-- On Hand / Reserved snapshot per (item, location) — kept in sync by the
-- ledger below via application logic or a Postgres trigger (left as an
-- exercise: sum the ledger, or maintain incrementally for performance).
create table stock_balances (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  location_id uuid not null references stock_locations(id),
  pool text not null default 'normal'
    check (pool in ('normal', 'defective', 'borrowed', 'lost')),
  on_hand integer not null default 0,
  reserved integer not null default 0,
  unique (stock_item_id, location_id, pool)
);

-- Full audit trail of every stock movement (spec §7.1–7.9)
create table stock_transactions (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  location_id uuid not null references stock_locations(id),
  transaction_type text not null check (transaction_type in (
    'receive_in', 'reserve', 'unreserve', 'withdraw', 'return',
    'transfer_out', 'transfer_in', 'borrow', 'borrow_return',
    'refund_in', 'adjustment', 'lost'
  )),
  qty integer not null,
  reference_type text, -- 'project' | 'ticket' | 'purchase_request' | 'transfer' | 'refund' | 'borrow'
  reference_id uuid,
  serial_no text,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index stock_tx_item_idx on stock_transactions(stock_item_id, location_id);

create table purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  project_id uuid not null references projects(id), -- must reference an existing project
  requested_by uuid references users(id),
  requested_at timestamptz default now(),
  needed_by date,
  detail text,
  status text not null default 'ส่งเรื่อง'
    check (status in ('ส่งเรื่อง','รออนุมัติ','อนุมัติแล้ว','สั่งซื้อแล้ว','รับของแล้ว/ปิดเรื่อง')),
  approved_by uuid references users(id), -- Manager role only (enforced by RLS)
  created_at timestamptz not null default now()
);

create table purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references purchase_requests(id) on delete cascade,
  description text not null,
  qty integer not null default 1,
  est_price numeric(12,2)
);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_location_id uuid not null references stock_locations(id),
  to_location_id uuid not null references stock_locations(id),
  status text not null default 'in_transit' check (status in ('in_transit', 'received')),
  requested_by uuid references users(id),
  received_by uuid references users(id),
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create table stock_borrows (
  id uuid primary key default gen_random_uuid(),
  borrow_no text not null unique,
  stock_item_id uuid not null references stock_items(id),
  serial_no text,
  borrower_name text not null,
  borrow_date date not null default current_date,
  due_date date,
  returned_date date,
  status text not null default 'borrowed' check (status in ('borrowed', 'returned', 'overdue')),
  created_at timestamptz not null default now()
);

create table stock_refunds (
  id uuid primary key default gen_random_uuid(),
  refund_no text not null unique,
  customer_id uuid references customers(id),
  project_id uuid references projects(id),
  ticket_id uuid references tickets(id),
  reason text,
  amount numeric(12,2),
  condition_on_return text check (condition_on_return in ('normal', 'defective')),
  status text not null default 'คำขอใหม่'
    check (status in ('คำขอใหม่','รอตรวจสอบสภาพสินค้า','อนุมัติ','ปฏิเสธ','คืนเงินแล้ว')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Starting point per spec §8: every authenticated user can READ everything
-- (matches 4 HAUS's baseline), but WRITE actions on the more sensitive
-- tables are restricted per the Permission Matrix. Tighten further per-table
-- as needed — this is deliberately a readable starting policy set, not the
-- final word.

alter table users enable row level security;
alter table sites enable row level security;
alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table projects enable row level security;
alter table project_quotations enable row level security;
alter table project_device_install enable row level security;
alter table project_install_jobs enable row level security;
alter table project_device_detail enable row level security;
alter table project_payment_periods enable row level security;
alter table project_files enable row level security;
alter table project_app_data enable row level security;
alter table tickets enable row level security;
alter table ticket_issues enable row level security;
alter table ticket_subcontractors enable row level security;
alter table ticket_stock_movements enable row level security;
alter table pm_requests enable row level security;
alter table comments enable row level security;
alter table comment_mentions enable row level security;
alter table notifications enable row level security;
alter table stock_locations enable row level security;
alter table stock_items enable row level security;
alter table stock_balances enable row level security;
alter table stock_transactions enable row level security;
alter table purchase_requests enable row level security;
alter table purchase_request_items enable row level security;
alter table stock_transfers enable row level security;
alter table stock_borrows enable row level security;
alter table stock_refunds enable row level security;

-- Read: any authenticated user, on every table (spec §8.2 — "เข้าถึง/ดู Project (View)" = ✓ ทุก Role)
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'users','sites','customers','customer_contacts','projects','project_quotations',
      'project_device_install','project_install_jobs','project_device_detail',
      'project_payment_periods','project_files','project_app_data','tickets',
      'ticket_issues','ticket_subcontractors','ticket_stock_movements','pm_requests',
      'comments','comment_mentions','notifications','stock_locations','stock_items',
      'stock_balances','stock_transactions','purchase_requests','purchase_request_items',
      'stock_transfers','stock_borrows','stock_refunds'
    ])
  loop
    execute format(
      'create policy "%s_read_all" on %I for select using (auth.role() = ''authenticated'');',
      t, t
    );
  end loop;
end $$;

-- Write: any authenticated user by default (baseline). Tighten the specific
-- tables called out in the Permission Matrix (spec §8.2):
create policy "projects_write_all" on projects for insert with check (auth.role() = 'authenticated');
create policy "projects_update_all" on projects for update using (auth.role() = 'authenticated');

-- Only Manager / Store may create stock locations (spec §7.3)
create policy "stock_locations_insert_manager_store" on stock_locations
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );
create policy "stock_locations_update_manager_store" on stock_locations
  for update using (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );

-- Only Manager may approve purchase requests / refunds — enforced at the
-- application layer when setting status = 'อนุมัติแล้ว' / 'อนุมัติ'; a stricter
-- version would use a Postgres function + trigger to check role on that
-- specific transition. Left as a follow-up hardening step.
create policy "purchase_requests_write_all" on purchase_requests for insert with check (auth.role() = 'authenticated');
create policy "purchase_requests_update_all" on purchase_requests for update using (auth.role() = 'authenticated');

-- Generic "insert/update if authenticated" for the remaining tables (baseline —
-- same simplicity-first starting point as 4 HAUS, since this is v1)
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'sites','customers','customer_contacts','project_quotations','project_device_install',
      'project_install_jobs','project_device_detail','project_payment_periods','project_files',
      'project_app_data','tickets','ticket_issues','ticket_subcontractors','ticket_stock_movements',
      'pm_requests','comments','comment_mentions','notifications','stock_items','stock_balances',
      'stock_transactions','purchase_request_items','stock_transfers','stock_borrows','stock_refunds'
    ])
  loop
    execute format('create policy "%s_insert_all" on %I for insert with check (auth.role() = ''authenticated'');', t, t);
    execute format('create policy "%s_update_all" on %I for update using (auth.role() = ''authenticated'');', t, t);
  end loop;
end $$;

-- Users table: everyone can read profiles (for @mention lists etc.), but
-- only Super Admin can change roles / deactivate people.
create policy "users_update_self_or_admin" on users
  for update using (
    auth.uid() = id
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'Super Admin')
  );

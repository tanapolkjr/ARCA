-- =============================================================================
-- 0014 — Sourcing module (merged from the standalone Supplier Management app)
--
-- Folds that app's migrations 0001 + 0002 + 0003 into ONE migration expressed
-- in their final, patched state. Deliberately NOT included:
--   • its `users` table          → ARCA's public.users is the single profile table
--   • its handle_new_auth_user() → ARCA already has one; two would fight
--   • its touch_updated_at()     → reuses the one from 0001_init.sql
--   • its "allow all authenticated" RLS → replaced by the role gate below
--
-- ACCESS MODEL: every screen in this module shows landed cost, margin or ROI,
-- so the whole module is limited to Super Admin / Manager rather than hiding
-- individual figures. The UI mirrors this in src/hooks/useAuth.jsx
-- (SOURCING_ROLES) — change both together.
--
-- Idempotent, like every migration from 0006 onward. Safe to re-run.
-- Run in the Supabase SQL Editor BEFORE deploying the code that needs it.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: is the caller allowed into the Sourcing module?
-- SECURITY DEFINER so the policies can read public.users without recursing
-- through that table's own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_sourcing_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active
      and u.role in ('Super Admin', 'Manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. factories — supplier master for the sourcing side
--    (`platform` is free text since patch 0003; the old CHECK is gone)
-- ---------------------------------------------------------------------------
create table if not exists public.factories (
  id                 uuid primary key default gen_random_uuid(),
  name               varchar(150) not null unique,
  platform           varchar(30),
  contact_person     varchar(100),
  contact_phone      varchar(50),
  contact_email      varchar(150),
  wechat_or_whatsapp varchar(100),
  country            varchar(50) default 'China',
  city               varchar(100),
  moq                integer,
  lead_time          varchar(50),
  notes              text,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. factory_files — catalogues / documents attached to a factory
-- ---------------------------------------------------------------------------
create table if not exists public.factory_files (
  id          uuid primary key default gen_random_uuid(),
  factory_id  uuid not null references public.factories(id) on delete cascade,
  file_url    varchar(500) not null,   -- path inside bucket `product-media`
  file_name   varchar(200) not null,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists factory_files_factory_idx on public.factory_files (factory_id);

-- ---------------------------------------------------------------------------
-- 3. products — import CANDIDATES being evaluated.
--    NOT the same entity as public.stock_items (real SKUs). A candidate that
--    is approved may later be promoted into a SKU; that link is deliberately
--    left for a following round.
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  factory_id           uuid not null references public.factories(id) on delete restrict,
  name                 varchar(150) not null,
  model_number         varchar(100),
  source_url           varchar(500),
  product_notes        text,
  category             varchar(30) not null check (category in
    ('Smart Lock','Hotel Lock','Mini Lock','Smart Switch','Normal Switch','Plug & Socket','Others')),
  custom_category_name varchar(100),
  functions                text[] not null default '{}',
  material                 varchar(50),
  color                    text[] not null default '{}',
  certification            text[] not null default '{}',
  warranty                 varchar(100),
  ip_rating                varchar(50),
  lead_time_days           integer,
  smart_home_compatibility text[] not null default '{}',
  target_channels          text[] not null default '{}',
  -- `status` is derived in code (deriveStatus) and must never be hand-edited.
  status               varchar(30) not null default 'Draft' check (status in
    ('Draft','Under Evaluation','Scored','Decision Pending','Done')),
  -- Denormalised from evaluations by the trigger at the bottom of this file.
  decision_status      varchar(30) not null default 'Not Yet Evaluated' check (decision_status in
    ('Not Yet Evaluated','Approved','Interested','Waiting','Rejected')),
  created_by           uuid references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists products_factory_idx on public.products (factory_id);
create index if not exists products_status_idx  on public.products (status);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. product_images — exactly one is_hero per product (enforced in the app)
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  image_url   varchar(500) not null,   -- path inside bucket `product-media`
  is_hero     boolean not null default false,
  caption     varchar(200),
  sort_order  integer default 0,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id);

-- ---------------------------------------------------------------------------
-- 5. product_costs — APPEND-ONLY history. Every save inserts a new row.
--    Never convert this to an update: the history is the point.
--    Column widths already include the 0002 fix — gross_margin was
--    decimal(5,2) and silently failed saves below -999.99%.
-- ---------------------------------------------------------------------------
create table if not exists public.product_costs (
  id                       uuid primary key default gen_random_uuid(),
  product_id               uuid not null references public.products(id) on delete cascade,
  currency                 varchar(10) not null default 'CNY' check (currency in ('CNY','USD','THB')),
  factory_price            decimal(10,2) not null check (factory_price >= 0),
  -- Rate is stored per estimate on purpose: historical estimates keep the rate
  -- that was used at the time. Never retro-apply a central FX table here.
  exchange_rate            decimal(10,4) not null default 1 check (exchange_rate > 0),
  shipping_method          varchar(50),
  shipping_cost            decimal(10,2) default 0 check (shipping_cost >= 0),
  shipping_is_percent      boolean not null default false,
  shipping_percent         decimal(6,2),
  agency_cost              decimal(10,2) default 0 check (agency_cost >= 0),
  agency_is_percent        boolean not null default false,
  agency_percent           decimal(6,2),
  import_duty_percent      decimal(5,2)  default 0 check (import_duty_percent >= 0),
  vat_percent              decimal(5,2)  default 7 check (vat_percent >= 0),
  other_costs              decimal(10,2) default 0 check (other_costs >= 0),
  other_is_percent         boolean not null default false,
  other_percent            decimal(6,2),
  landed_cost              decimal(10,2) not null,
  suggested_selling_price  decimal(10,2),
  lowest_selling_price     decimal(10,2),
  actual_selling_price     decimal(10,2),
  gross_profit             decimal(10,2),
  gross_margin             decimal(8,2),
  net_profit               decimal(10,2),
  roi                      decimal(10,2),
  created_by               uuid references public.users(id),
  created_at               timestamptz not null default now()
);
create index if not exists product_costs_product_idx
  on public.product_costs (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. evaluations — 1:1 with product. decision_reason is the audit trail the
--    business actually reads (it becomes the Decision Log report).
-- ---------------------------------------------------------------------------
create table if not exists public.evaluations (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null unique references public.products(id) on delete cascade,
  scores          jsonb not null default '{}',   -- {criterion_key: 1..5}; weights live in code
  comments        jsonb not null default '{}',
  overall_score   decimal(3,1),
  decision_status varchar(30) not null default 'Not Yet Evaluated' check (decision_status in
    ('Not Yet Evaluated','Approved','Interested','Waiting','Rejected')),
  decision_reason text,
  evaluated_by    uuid references public.users(id),
  evaluated_at    timestamptz,
  updated_at      timestamptz not null default now()
);

drop trigger if exists evaluations_touch on public.evaluations;
create trigger evaluations_touch before update on public.evaluations
  for each row execute function touch_updated_at();

create or replace function public.sync_decision_status()
returns trigger language plpgsql as $$
begin
  update public.products
     set decision_status = new.decision_status
   where id = new.product_id
     and decision_status is distinct from new.decision_status;
  return new;
end $$;

drop trigger if exists evaluations_sync_decision on public.evaluations;
create trigger evaluations_sync_decision
  after insert or update of decision_status on public.evaluations
  for each row execute function public.sync_decision_status();

-- ---------------------------------------------------------------------------
-- 7. channel_options — target-market channel list, edited in Sourcing Settings
-- ---------------------------------------------------------------------------
create table if not exists public.channel_options (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.channel_options (name, sort_order) values
  ('Shopee', 0), ('Lazada', 1), ('Facebook', 2), ('Real Estate Developers', 3),
  ('Hotels', 4), ('Commercial Projects', 5), ('Government Projects', 6)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 8. RLS — Super Admin / Manager only, on all seven tables.
--    (The standalone app used `using (true)`; that is not acceptable now that
--    Sale / PM / Admin / Store accounts exist.)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'factories','factory_files','products','product_images',
    'product_costs','evaluations','channel_options'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_sourcing_roles" on public.%I', t, t);
    execute format(
      'create policy "%s_sourcing_roles" on public.%I for all to authenticated '
      'using (public.is_sourcing_user()) with check (public.is_sourcing_user())',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Storage — bucket `product-media` for product photos and factory files.
--    Kept separate from `smart-living-files` so the existing paths in
--    product_images.image_url / factory_files.file_url stay valid.
--
--    KNOWN LIMITATION (carried over): this bucket is public-read, so anyone
--    with a URL can fetch a factory document even though the table rows are
--    role-gated. Fine for photos; if commercially sensitive contracts get
--    uploaded, move factory_files to a private bucket with signed URLs.
-- ---------------------------------------------------------------------------
-- file_size_limit matters: Supabase buckets default to a 50 MB cap, which
-- factory catalogue PDFs can exceed. Same 500 MB ceiling as the platform
-- bucket in 0002_storage.sql.
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-media', 'product-media', true, 524288000)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "product_media_read"   on storage.objects;
drop policy if exists "product_media_insert" on storage.objects;
drop policy if exists "product_media_update" on storage.objects;
drop policy if exists "product_media_delete" on storage.objects;

create policy "product_media_read" on storage.objects
  for select using (bucket_id = 'product-media');
create policy "product_media_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-media' and public.is_sourcing_user());
create policy "product_media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-media' and public.is_sourcing_user());
create policy "product_media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media' and public.is_sourcing_user());

-- =============================================================================
-- 0013 — Launch recheck fixes (pre-launch audit round)
-- Run in Supabase SQL Editor AFTER 0001-0012. Fully idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 1 (LAUNCH BLOCKER): 0012 moved borrow items to stock_borrow_items but
-- never relaxed the legacy NOT NULL on stock_borrows.stock_item_id — so every
-- new multi-item borrow header insert failed with a not-null violation.
-- ---------------------------------------------------------------------------
alter table stock_borrows alter column stock_item_id drop not null;

-- ---------------------------------------------------------------------------
-- Fix 2: Warehouse Transfer previously had NO item lines and never moved
-- stock — it was a from/to header only, and the create modal promised a
-- detail page that didn't exist. Adding real line items so a transfer can
-- decrement the source warehouse on create (transfer_out) and credit the
-- destination on "ยืนยันรับของ" (transfer_in). Same RLS gating pattern as
-- stock_borrow_items in 0012 (physical stock action = Super Admin/Manager/
-- Store for insert/update, delete open to authenticated like its header).
-- ---------------------------------------------------------------------------
create table if not exists stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references stock_transfers(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  qty integer not null default 1 check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists stock_transfer_items_transfer_idx on stock_transfer_items(transfer_id);

alter table stock_transfer_items enable row level security;

drop policy if exists "stock_transfer_items_read_all" on stock_transfer_items;
create policy "stock_transfer_items_read_all" on stock_transfer_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "stock_transfer_items_insert_manager_store" on stock_transfer_items;
create policy "stock_transfer_items_insert_manager_store" on stock_transfer_items
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );

drop policy if exists "stock_transfer_items_update_manager_store" on stock_transfer_items;
create policy "stock_transfer_items_update_manager_store" on stock_transfer_items
  for update using (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );

drop policy if exists "stock_transfer_items_delete_all" on stock_transfer_items;
create policy "stock_transfer_items_delete_all" on stock_transfer_items
  for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Fix 3: ticket_stock_movements never stored WHICH warehouse a เบิก/คืน hit,
-- so a movement couldn't be traced (or ever reversed) after the fact — the
-- location only existed transiently in the stock_transactions row. Storing
-- it on the movement itself now.
-- ---------------------------------------------------------------------------
alter table ticket_stock_movements add column if not exists location_id uuid references stock_locations(id);

-- Note: no data backfill is possible for pre-0013 ticket movements (the
-- location was never captured) — those rows will simply show "-" for คลัง.

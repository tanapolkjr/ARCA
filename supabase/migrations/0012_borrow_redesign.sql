-- =============================================================================
-- 0012 — Redesign ยืมคืนสินค้า (Borrow) to match the Device Install → Install
-- Period pattern: one borrow "job" can contain multiple items, each with
-- captured Serial Numbers, and actually moves stock (on_hand) both ways —
-- previously stock_borrows was single-item only and never touched stock at
-- all in either direction.
-- Run in Supabase SQL Editor AFTER 0001-0011.
-- =============================================================================

alter table stock_borrows add column if not exists location_id uuid references stock_locations(id);

create table stock_borrow_items (
  id uuid primary key default gen_random_uuid(),
  borrow_id uuid not null references stock_borrows(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  serial_no text,
  returned boolean not null default false,
  returned_at timestamptz,
  created_at timestamptz not null default now()
);
create index stock_borrow_items_borrow_idx on stock_borrow_items(borrow_id);

alter table stock_borrow_items enable row level security;

create policy "stock_borrow_items_read_all" on stock_borrow_items
  for select using (auth.role() = 'authenticated');

-- Matches the same Store/Manager/Super Admin gating as other physical
-- stock actions (withdraw, receive, transfer) per the Permission Matrix.
create policy "stock_borrow_items_insert_manager_store" on stock_borrow_items
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );
create policy "stock_borrow_items_update_manager_store" on stock_borrow_items
  for update using (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );
create policy "stock_borrow_items_delete_all" on stock_borrow_items
  for delete using (auth.role() = 'authenticated');

-- Note: existing single-item borrow records (stock_item_id/serial_no on
-- stock_borrows itself) are left as-is for history — the app now reads
-- from stock_borrow_items for anything created after this migration.

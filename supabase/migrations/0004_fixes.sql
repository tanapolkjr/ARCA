-- =============================================================================
-- 0004 — Fixes found in the full spec recheck
-- =============================================================================
-- Run this in Supabase SQL Editor AFTER 0001/0002/0003.
--
-- Fix 1: project_device_install had no location, so the "จองสต็อก" toggle
-- could never actually move stock_balances.reserved (spec §2.2.3/§7.1
-- explicitly require it to). Adding a location so reservations are real.
--
-- Fix 2: Physical stock actions (รับเข้าคลัง/เบิก/ย้ายคลัง/ยืมคืน) were
-- writable by ANY authenticated user via the generic baseline policy. Per
-- the Permission Matrix (spec §8.2), these are Super Admin/Manager/Store
-- only — tightening RLS to match.

alter table project_device_install add column if not exists location_id uuid references stock_locations(id);

-- ---------------------------------------------------------------------------
-- Fix 2: role-gate the physical stock ACTION tables (transfers, borrows,
-- the transaction log). stock_balances itself is left on the general
-- baseline policy on purpose: Device Install's "จองสต็อก" (soft reservation)
-- needs to write stock_balances.reserved for ANY role that's allowed to
-- plan a project (Sale/PM/Admin), not just Store — so it can't be gated the
-- same way as an actual physical stock movement. The *physical* withdrawal
-- flow (fulfilling an Install Period job with real serials, which is what
-- decrements on_hand) is instead gated at the UI layer to Super Admin /
-- Manager / Store — see NewJobModal in ProjectTabs.jsx. This mirrors 4
-- HAUS's own "fine for a small trusted team" baseline rather than pretending
-- to build airtight column-level enforcement that would need a Postgres
-- function to do properly.
-- ---------------------------------------------------------------------------
drop policy if exists "stock_transactions_insert_all" on stock_transactions;
drop policy if exists "stock_transfers_insert_all" on stock_transfers;
drop policy if exists "stock_borrows_insert_all" on stock_borrows;

create policy "stock_transactions_insert_manager_store" on stock_transactions
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );
create policy "stock_transfers_insert_manager_store" on stock_transfers
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );
create policy "stock_borrows_insert_manager_store" on stock_borrows
  for insert with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('Super Admin', 'Manager', 'Store'))
  );

-- NOTE — still an open gap after this migration: purchase_requests /
-- stock_refunds status *transitions* (e.g. "who is allowed to move a PR to
-- อนุมัติแล้ว") are not transition-aware in RLS — any authenticated user can
-- currently advance those statuses. Spec §8.2 says only Manager should
-- approve. Doing this properly needs a Postgres trigger/function that
-- inspects OLD.status vs NEW.status per role, which is a bigger piece of
-- work than a plain USING clause — flagged here rather than silently left
-- unfixed.

-- =============================================================================
-- 0015 — Link approved Sourcing products to Inventory SKUs
--
-- An approved import candidate (public.products) becomes a real SKU
-- (public.stock_items). They stay separate tables on purpose: most evaluated
-- products are never imported — that is the entire point of the evaluation —
-- so most `products` rows should never reach inventory.
--
-- Idempotent. Run in the Supabase SQL Editor BEFORE deploying the code.
-- =============================================================================

-- Which sourcing candidate this SKU came from. Nullable: SKUs created by hand
-- or by the Excel import have no sourcing history, and that is fine.
-- ON DELETE SET NULL, never CASCADE — deleting an evaluation record must not
-- take a live inventory item (and its stock movements) with it.
alter table public.stock_items
  add column if not exists source_product_id uuid references public.products(id) on delete set null;

-- One SKU per sourcing product. Stops a double-click or a repeated approval
-- from creating two SKUs for the same candidate.
create unique index if not exists stock_items_source_product_uidx
  on public.stock_items (source_product_id)
  where source_product_id is not null;

comment on column public.stock_items.source_product_id is
  'The Sourcing candidate (public.products) this SKU was promoted from. '
  'Null for hand-created or Excel-imported items.';

-- Note: no RLS change is needed. stock_items already allows all authenticated
-- users, and only Super Admin / Manager can reach the Sourcing screens that
-- trigger a promotion (see 0014).

-- =============================================================================
-- 0010 — Add sub_category to stock_items (Product Master), per request.
-- Run in Supabase SQL Editor AFTER 0001-0009.
-- =============================================================================

alter table stock_items add column if not exists sub_category text;

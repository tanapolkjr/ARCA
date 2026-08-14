-- =============================================================================
-- RESET (not a numbered migration — a utility script)
-- =============================================================================
-- Run this ONLY if you want to permanently wipe ALL app data (every
-- project, ticket, customer, chat message, etc.) and start completely
-- fresh. This is NOT reversible.
--
-- Deleting rows via Table Editor removes data but leaves the tables
-- themselves in place — that's why 0001 still says "already exists" even
-- after clearing data. This script drops the tables/functions themselves,
-- so 0001 → 0007 can then be re-run cleanly with zero errors.
--
-- Does NOT touch: your Supabase auth users (Authentication → Users stays
-- intact, so you don't have to recreate logins), and does NOT touch the
-- Storage bucket/files (run that separately if you also want those gone —
-- see note at the bottom).

-- Drop the trigger on auth.users first (it depends on a function below).
drop trigger if exists on_auth_user_created on auth.users;

-- Drop every app table. CASCADE handles all the foreign-key dependencies
-- between them automatically, so order doesn't matter here.
drop table if exists
  chat_messages, chat_participants, chat_conversations,
  stock_refunds, stock_borrows, stock_transfers,
  purchase_request_items, purchase_requests,
  stock_transactions, stock_balances, stock_items, stock_locations,
  notifications, comment_mentions, comments,
  pm_requests,
  ticket_stock_movements, ticket_subcontractors, ticket_issues, tickets,
  project_app_data, project_files, project_payment_periods,
  project_device_detail, project_install_jobs, project_device_install,
  project_quotations, projects,
  customer_contacts, customers, sites,
  -- Sourcing module (0014)
  evaluations, product_costs, product_images, products,
  factory_files, factories, channel_options,
  users
cascade;

-- Drop the custom functions.
drop function if exists is_chat_participant(uuid, uuid);
drop function if exists handle_new_auth_user();
drop function if exists sync_decision_status();
drop function if exists is_sourcing_user();
drop function if exists touch_updated_at();

-- ---------------------------------------------------------------------------
-- After running this: go run 0001_init.sql → 0015_sourcing_to_inventory.sql in
-- order, same as a brand-new project. Everyone will need to log in again
-- (their profile row gets recreated by the trigger on first login) — their
-- Supabase Auth account itself still exists, so no need to recreate that.
-- ---------------------------------------------------------------------------

-- OPTIONAL — only if you also want to delete every uploaded file:
-- delete from storage.objects where bucket_id = 'smart-living-files';
-- delete from storage.buckets where id = 'smart-living-files';
-- (then re-run 0002_storage.sql to recreate the bucket)
--
-- Sourcing product photos / factory documents live in a second bucket:
-- delete from storage.objects where bucket_id = 'product-media';
-- delete from storage.buckets where id = 'product-media';
-- (0014_sourcing_module.sql recreates it)

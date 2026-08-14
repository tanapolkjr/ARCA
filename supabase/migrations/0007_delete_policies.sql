-- =============================================================================
-- 0007 — Add DELETE policies to every remaining table that was missing one
-- =============================================================================
-- Run in Supabase SQL Editor AFTER 0001-0006.
--
-- Root cause of "can't delete in Stock Summary / Ticket / Contact": RLS
-- denies any operation with zero matching policies, and DELETE policies
-- were only ever added for a handful of tables (projects, stock_transfers,
-- stock_borrows, stock_refunds, purchase_requests, pm_requests — see
-- 0004/0005). Every other table never got one, so no delete button for
-- those tables could ever have worked, regardless of the UI code. This
-- closes that gap for everything not already covered.

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'customers','customer_contacts','sites','tickets','ticket_issues','ticket_subcontractors',
      'ticket_stock_movements','stock_items','project_quotations','project_device_install',
      'project_install_jobs','project_device_detail','project_payment_periods','project_files',
      'project_app_data','comments','comment_mentions','notifications','stock_balances',
      'stock_transactions'
    ])
  loop
    execute format('drop policy if exists "%s_delete_all" on %I;', t, t);
    execute format('create policy "%s_delete_all" on %I for delete using (auth.role() = ''authenticated'');', t, t);
  end loop;
end $$;

-- users deliberately excluded — accounts should be deactivated (is_active =
-- false), never hard-deleted, matching the 4 HAUS convention noted in
-- README/DEPLOY. chat_* tables deliberately excluded too — no delete UI for
-- those yet, and their membership-based RLS needs a different pattern than
-- the blanket "authenticated" used above.

-- =============================================================================
-- 0011 — Cancel Withdrawal for Install Period jobs
-- =============================================================================
-- Run in Supabase SQL Editor AFTER 0001-0010.
--
-- Why this is needed: stock_transactions and project_device_detail rows
-- created by a withdrawal never recorded *which job* they came from — only
-- the project. With a project having multiple Install Period jobs over
-- time, there was no reliable way to know which specific stock movements
-- belong to which job, so "cancel this withdrawal" couldn't be built
-- correctly. Adding that link now.

alter table stock_transactions add column if not exists install_job_id uuid references project_install_jobs(id);
alter table project_device_detail add column if not exists install_job_id uuid references project_install_jobs(id);
alter table project_install_jobs add column if not exists cancelled_at timestamptz;
alter table project_install_jobs add column if not exists cancelled_by uuid references users(id);

-- Allow a "cancel_withdraw" transaction type for the audit trail (existing
-- types don't cleanly describe "a withdrawal was reversed").
alter table stock_transactions drop constraint if exists stock_transactions_transaction_type_check;
alter table stock_transactions add constraint stock_transactions_transaction_type_check
  check (transaction_type in (
    'receive_in', 'reserve', 'unreserve', 'withdraw', 'return', 'cancel_withdraw',
    'transfer_out', 'transfer_in', 'borrow', 'borrow_return',
    'refund_in', 'adjustment', 'lost'
  ));

-- Note: withdrawals made BEFORE this migration have no install_job_id on
-- their stock_transactions/project_device_detail rows, so they can't be
-- auto-cancelled through this feature — the app will show a clear message
-- for those rather than guessing. Only withdrawals made after this update
-- can be cleanly reversed.

-- =============================================================================
-- 0009 — PM Request attachments (files + external links), same pattern as
-- project_files. Run in Supabase SQL Editor AFTER 0001-0008.
-- =============================================================================

create table pm_request_files (
  id uuid primary key default gen_random_uuid(),
  pm_request_id uuid not null references pm_requests(id) on delete cascade,
  storage_path text not null, -- either a Storage object path, or a full external URL (Google Drive/OneDrive/etc)
  file_name text not null,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

alter table pm_request_files enable row level security;

create policy "pm_request_files_read_all" on pm_request_files
  for select using (auth.role() = 'authenticated');
create policy "pm_request_files_insert_all" on pm_request_files
  for insert with check (auth.role() = 'authenticated');
create policy "pm_request_files_delete_all" on pm_request_files
  for delete using (auth.role() = 'authenticated');

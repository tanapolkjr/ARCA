-- =============================================================================
-- 0002 — Storage bucket for file attachments
-- =============================================================================
-- Run this AFTER 0001_init.sql.
--
-- IMPORTANT — the file_size_limit below is what actually fixes "อัปโหลดไฟล์
-- ใหญ่ไม่ได้": Supabase Storage buckets default to a 50MB cap regardless of
-- whether you use resumable (TUS) upload or not. Raise it here to whatever
-- ceiling you want. 500MB is a reasonable starting point for BOQ/quotation/
-- install-photo attachments; go higher if you expect video walkthroughs etc.
--
-- This part CAN be done in SQL (unlike some storage settings which require
-- the dashboard) via the storage.buckets table.

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'smart-living-files',
  'smart-living-files',
  true,                     -- public-read, same pattern as 4 HAUS's product-media
  524288000                 -- 500 MB, in bytes. Raise further if needed.
)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Storage RLS: any authenticated user can read/upload/update/delete objects
-- in this bucket. Tighten later (e.g. restrict delete to the uploader or
-- Manager) once real usage patterns are clear.
create policy "smart_living_files_read" on storage.objects
  for select using (bucket_id = 'smart-living-files');

create policy "smart_living_files_insert" on storage.objects
  for insert with check (bucket_id = 'smart-living-files' and auth.role() = 'authenticated');

create policy "smart_living_files_update" on storage.objects
  for update using (bucket_id = 'smart-living-files' and auth.role() = 'authenticated');

create policy "smart_living_files_delete" on storage.objects
  for delete using (bucket_id = 'smart-living-files' and auth.role() = 'authenticated');

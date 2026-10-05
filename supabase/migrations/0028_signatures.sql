-- =============================================================================
-- 0027 — ลายเซ็นเซลล์บนเอกสาร
--
--   • users.signature_path       ลายเซ็นปัจจุบันของแต่ละคน (ไฟล์ใน bucket "signatures")
--   • ar_documents.signer_*      ลายเซ็นที่ "ล็อก" ไว้กับเอกสาร ณ ตอนอนุมัติ/ออกเอกสาร
--   • signature_log              ประวัติการเปลี่ยนลายเซ็น ใครเปลี่ยน เมื่อไร
--
-- กติกา
--   - ลายเซ็นผู้อนุมัติ/ผู้รับเงิน = ของเซลล์ที่ระบุในใบ (sales_user_id) ไม่ใช่คนกดปุ่ม
--   - ล็อกตอนสถานะออกจาก "ร่าง" → เปลี่ยนลายเซ็นทีหลังไม่กระทบใบที่ออกไปแล้ว
--   - รีเซ็ตกลับเป็นร่าง → ล้างลายเซ็นที่ล็อกไว้ อนุมัติใหม่จะล็อกใหม่
--   - ล็อกที่ฐานข้อมูล (trigger) ไม่ว่าจะออกเอกสารจากหน้าจอไหนก็ได้ผลเหมือนกัน
--   - ไฟล์ลายเซ็นลบ/เขียนทับไม่ได้ (ไม่มี policy update/delete) เพราะใบเก่ายังอ้างถึง
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.users
  add column if not exists signature_path       varchar(500),
  add column if not exists signature_updated_at timestamptz;

alter table public.ar_documents
  add column if not exists signer_user_id uuid references public.users(id) on delete set null,
  add column if not exists signature_path varchar(500),
  add column if not exists signed_at      timestamptz;

-- ---------------------------------------------------------------------------
-- ล็อก/ล้างลายเซ็นตามการเปลี่ยนสถานะ
-- ---------------------------------------------------------------------------
create or replace function public.ar_document_lock_signature()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_draft boolean := (tg_op = 'INSERT') or old.status = 'draft';
begin
  if new.status = 'draft' then
    new.signer_user_id := null;
    new.signature_path := null;
    new.signed_at      := null;
  elsif was_draft and new.status <> 'cancelled' then
    new.signer_user_id := new.sales_user_id;
    new.signature_path := (select u.signature_path from public.users u where u.id = new.sales_user_id);
    new.signed_at      := now();
    if new.doc_type = 'QT' then
      new.approved_at := coalesce(new.approved_at, now());
      new.approved_by := coalesce(new.approved_by, auth.uid());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ar_documents_lock_signature on public.ar_documents;
create trigger ar_documents_lock_signature
  before insert or update of status on public.ar_documents
  for each row execute function public.ar_document_lock_signature();

-- เอกสารที่ออกไปแล้วก่อนมีระบบนี้: ผูกผู้ลงนามเป็นเซลล์ในใบ
update public.ar_documents
   set signer_user_id = sales_user_id,
       signed_at      = coalesce(approved_at, updated_at)
 where status not in ('draft', 'cancelled')
   and signer_user_id is null
   and sales_user_id is not null;

-- ---------------------------------------------------------------------------
-- ประวัติการเปลี่ยนลายเซ็น
-- ---------------------------------------------------------------------------
create table if not exists public.signature_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  old_path   varchar(500),
  new_path   varchar(500),
  changed_by uuid references public.users(id),
  changed_at timestamptz not null default now()
);
alter table public.signature_log enable row level security;
drop policy if exists signature_log_read on public.signature_log;
create policy signature_log_read on public.signature_log
  for select to authenticated using (true);
-- ไม่มี policy insert/update/delete — เขียนได้จาก trigger เท่านั้น

create or replace function public.user_signature_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.signature_path is distinct from old.signature_path then
    insert into public.signature_log (user_id, old_path, new_path, changed_by)
    values (new.id, old.signature_path, new.signature_path, auth.uid());

    -- ใบที่ออกไปก่อนเซลล์คนนี้จะมีลายเซ็นในระบบ → ใช้ลายเซ็นแรกที่อัปโหลด
    -- ใบที่ล็อกลายเซ็นไว้แล้วไม่ถูกแตะ
    if old.signature_path is null and new.signature_path is not null then
      update public.ar_documents
         set signature_path = new.signature_path
       where signer_user_id = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_signature_changed on public.users;
create trigger users_signature_changed
  after update of signature_path on public.users
  for each row execute function public.user_signature_changed();

-- ---------------------------------------------------------------------------
-- Storage: bucket ส่วนตัว อ่านได้เฉพาะคนที่ล็อกอิน (ผ่าน signed URL)
-- อัปโหลดได้เฉพาะโฟลเดอร์ของตัวเอง หรือ Super Admin อัปให้คนอื่น
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 512000, array['image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 512000, allowed_mime_types = array['image/png'];

drop policy if exists signatures_read   on storage.objects;
drop policy if exists signatures_insert on storage.objects;
create policy signatures_read on storage.objects
  for select to authenticated using (bucket_id = 'signatures');
create policy signatures_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'signatures' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'Super Admin')
    )
  );

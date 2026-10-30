-- =============================================================================
-- 0037 — ผู้อนุมัติเอกสารทางบัญชี (ชื่อ · ตำแหน่ง · ลายเซ็น)
--
-- ใบเสนอราคา       → ลายเซ็นเซลล์ในใบ (เหมือนเดิม 0028)
-- เอกสารอื่นทั้งหมด → ลายเซ็นผู้อนุมัติจากหน้าตั้งค่า
--   ฝั่งขาย: ใบแจ้งหนี้ ใบกำกับภาษี ใบเสร็จ ใบลดหนี้ ใบเพิ่มหนี้
--   ฝั่งซื้อ: ใบสั่งซื้อ และเอกสารซื้ออื่น ๆ
--
--   • document_approvers                 รายชื่อผู้อนุมัติ ตั้งค่าได้เฉพาะ Super Admin
--   • ar/ap_documents.doc_approver_id    ผู้อนุมัติที่เลือกในใบ (ว่าง = ใช้ผู้อนุมัติหลัก)
--   • ar/ap_documents.approver_name/_position  ชื่อ-ตำแหน่งที่ล็อกตอนออกเอกสาร
--
-- กติกาเหมือนลายเซ็นเซลล์ทุกข้อ
--   - ล็อกชื่อ ตำแหน่ง ลายเซ็น ตอนเอกสารออกจากร่าง → แก้ข้อมูลผู้อนุมัติทีหลังไม่กระทบใบเดิม
--   - รีเซ็ตกลับเป็นร่าง → ล้าง แล้วล็อกใหม่ตอนออกอีกครั้ง
--   - ใบที่ออกตอนผู้อนุมัติยังไม่มีลายเซ็น → ได้ลายเซ็นเมื่ออัปโหลด
--   - เอกสารที่ออกไปแล้วก่อน migration นี้ไม่ถูกแตะ (ลายเซ็นล็อกไปแล้ว)
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create table if not exists public.document_approvers (
  id                   uuid primary key default gen_random_uuid(),
  name                 varchar(150) not null,
  position             varchar(150),
  signature_path       varchar(500),
  signature_updated_at timestamptz,
  is_default           boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.document_approvers enable row level security;
drop policy if exists document_approvers_read  on public.document_approvers;
drop policy if exists document_approvers_write on public.document_approvers;
create policy document_approvers_read on public.document_approvers
  for select to authenticated using (true);
create policy document_approvers_write on public.document_approvers
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'Super Admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'Super Admin'));

-- ผู้อนุมัติหลักมีได้คนเดียว · คนที่ปิดใช้งานเป็นผู้อนุมัติหลักไม่ได้
create or replace function public.document_approver_single_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not new.is_active then new.is_default := false; end if;
  if new.is_default then
    update public.document_approvers set is_default = false
     where id <> new.id and is_default;
  end if;
  return new;
end $$;

drop trigger if exists document_approvers_single_default on public.document_approvers;
create trigger document_approvers_single_default
  before insert or update on public.document_approvers
  for each row execute function public.document_approver_single_default();

-- ประวัติการเปลี่ยนลายเซ็น — ใช้ตารางเดิม เพิ่มช่องผู้อนุมัติ
alter table public.signature_log alter column user_id drop not null;
alter table public.signature_log
  add column if not exists approver_id uuid references public.document_approvers(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- ช่องบนเอกสาร
-- ---------------------------------------------------------------------------
alter table public.ar_documents
  add column if not exists doc_approver_id   uuid references public.document_approvers(id) on delete set null,
  add column if not exists approver_name     varchar(150),
  add column if not exists approver_position varchar(150);

alter table public.ap_documents
  add column if not exists doc_approver_id   uuid references public.document_approvers(id) on delete set null,
  add column if not exists approver_name     varchar(150),
  add column if not exists approver_position varchar(150);

-- ---------------------------------------------------------------------------
-- ล็อกลายเซ็น — ฝั่งขาย
-- ---------------------------------------------------------------------------
create or replace function public.ar_document_lock_signature()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_draft boolean := (tg_op = 'INSERT') or old.status = 'draft';
  ap public.document_approvers%rowtype;
begin
  if new.status = 'draft' then
    new.signer_user_id    := null;
    new.signature_path    := null;
    new.signed_at         := null;
    new.approver_name     := null;
    new.approver_position := null;
  elsif was_draft and new.status <> 'cancelled' then
    new.signed_at := now();
    if new.doc_type = 'QT' then
      -- ใบเสนอราคา: เซลล์ในใบเป็นผู้ลงนาม
      new.signer_user_id := new.sales_user_id;
      new.signature_path := (select u.signature_path from public.users u where u.id = new.sales_user_id);
      new.approved_at := coalesce(new.approved_at, now());
      new.approved_by := coalesce(new.approved_by, auth.uid());
    else
      -- เอกสารอื่น: ผู้อนุมัติจากหน้าตั้งค่า (ไม่ได้เลือก = ผู้อนุมัติหลัก)
      if new.doc_approver_id is null then
        new.doc_approver_id := (select a.id from public.document_approvers a
                                 where a.is_default and a.is_active limit 1);
      end if;
      select * into ap from public.document_approvers a where a.id = new.doc_approver_id;
      new.signer_user_id    := null;
      new.signature_path    := ap.signature_path;
      new.approver_name     := ap.name;
      new.approver_position := ap.position;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ar_documents_lock_signature on public.ar_documents;
create trigger ar_documents_lock_signature
  before insert or update of status on public.ar_documents
  for each row execute function public.ar_document_lock_signature();

-- ---------------------------------------------------------------------------
-- ล็อกลายเซ็น — ฝั่งซื้อ
-- ใบเก่าที่เลือกผู้อนุมัติเป็นผู้ใช้ (approver_user_id, 0033) ยังทำงานแบบเดิม
-- ---------------------------------------------------------------------------
create or replace function public.ap_document_lock_signature()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_draft boolean := (tg_op = 'INSERT') or old.status = 'draft';
  ap public.document_approvers%rowtype;
begin
  if new.status = 'draft' then
    new.signer_user_id    := null;
    new.signature_path    := null;
    new.signed_at         := null;
    new.approver_name     := null;
    new.approver_position := null;
  elsif was_draft and new.status <> 'cancelled' then
    new.signed_at   := now();
    new.approved_at := coalesce(new.approved_at, now());
    if new.doc_approver_id is null and new.approver_user_id is null then
      new.doc_approver_id := (select a.id from public.document_approvers a
                               where a.is_default and a.is_active limit 1);
    end if;
    if new.doc_approver_id is not null then
      select * into ap from public.document_approvers a where a.id = new.doc_approver_id;
      new.signer_user_id    := null;
      new.signature_path    := ap.signature_path;
      new.approver_name     := ap.name;
      new.approver_position := ap.position;
      new.approved_by       := coalesce(new.approved_by, auth.uid());
    else
      new.signer_user_id := new.approver_user_id;
      new.signature_path := (select u.signature_path from public.users u where u.id = new.approver_user_id);
      new.approved_by    := coalesce(new.approved_by, new.approver_user_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ap_documents_lock_signature on public.ap_documents;
create trigger ap_documents_lock_signature
  before insert or update of status on public.ap_documents
  for each row execute function public.ap_document_lock_signature();

-- ---------------------------------------------------------------------------
-- ผู้ใช้อัปโหลดลายเซ็น → เติมให้ "ใบเสนอราคา" ที่ยังว่าง (เอกสารอื่นใช้ผู้อนุมัติแล้ว)
-- ฝั่งซื้อเติมเฉพาะใบเก่าที่ผู้อนุมัติเป็นผู้ใช้
-- ---------------------------------------------------------------------------
create or replace function public.user_signature_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.signature_path is distinct from old.signature_path then
    insert into public.signature_log (user_id, old_path, new_path, changed_by)
    values (new.id, old.signature_path, new.signature_path, auth.uid());

    if new.signature_path is not null then
      update public.ar_documents
         set signature_path = new.signature_path,
             signer_user_id = coalesce(signer_user_id, sales_user_id),
             signed_at      = coalesce(signed_at, approved_at, updated_at)
       where doc_type = 'QT'
         and coalesce(signer_user_id, sales_user_id) = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');

      update public.ap_documents
         set signature_path = new.signature_path,
             signer_user_id = coalesce(signer_user_id, approver_user_id),
             signed_at      = coalesce(signed_at, approved_at, updated_at)
       where doc_approver_id is null
         and coalesce(signer_user_id, approver_user_id) = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- ผู้อนุมัติอัปโหลดลายเซ็น → เติมให้เอกสารที่ออกไปแล้วแต่ยังว่าง
-- ---------------------------------------------------------------------------
create or replace function public.approver_signature_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.signature_path is distinct from old.signature_path then
    insert into public.signature_log (approver_id, old_path, new_path, changed_by)
    values (new.id, old.signature_path, new.signature_path, auth.uid());

    if new.signature_path is not null then
      update public.ar_documents
         set signature_path = new.signature_path,
             signed_at      = coalesce(signed_at, updated_at)
       where doc_approver_id = new.id
         and doc_type <> 'QT'
         and signature_path is null
         and status not in ('draft', 'cancelled');

      update public.ap_documents
         set signature_path = new.signature_path,
             signed_at      = coalesce(signed_at, updated_at)
       where doc_approver_id = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists document_approvers_signature_changed on public.document_approvers;
create trigger document_approvers_signature_changed
  after update of signature_path on public.document_approvers
  for each row execute function public.approver_signature_changed();

-- Storage: ไฟล์ลายเซ็นผู้อนุมัติอยู่ใต้ approvers/{id}/ ใน bucket "signatures"
-- อัปโหลดได้เฉพาะ Super Admin — policy signatures_insert (0028) ครอบคลุมแล้ว

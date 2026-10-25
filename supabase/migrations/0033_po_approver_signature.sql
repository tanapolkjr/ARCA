-- =============================================================================
-- 0033 — ผู้อนุมัติ + ลายเซ็น บนเอกสารฝั่งซื้อ (ใบสั่งซื้อ ฯลฯ)
--
-- ใช้รายชื่อผู้ใช้และลายเซ็นชุดเดียวกับผู้ขายในใบเสนอราคา (users.signature_path)
-- กติกาเหมือนฝั่งขายทุกข้อ (0028 / 0030):
--   - ลายเซ็นขึ้นเมื่อเอกสารออกแล้วเท่านั้น (ไม่ใช่ร่าง ไม่ใช่ยกเลิก)
--   - ล็อกลายเซ็นตอนออกเอกสาร — เปลี่ยนลายเซ็นทีหลังไม่กระทบใบเดิม
--   - ใบที่ออกก่อนผู้อนุมัติมีลายเซ็น → ได้ลายเซ็นเมื่อผู้อนุมัติอัปโหลด
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.ap_documents
  add column if not exists approver_user_id uuid references public.users(id) on delete set null,
  add column if not exists signer_user_id   uuid references public.users(id) on delete set null,
  add column if not exists signature_path   varchar(500),
  add column if not exists signed_at        timestamptz;

create or replace function public.ap_document_lock_signature()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_draft boolean := (tg_op = 'INSERT') or old.status = 'draft';
begin
  if new.status = 'draft' then
    new.signer_user_id := null;
    new.signature_path := null;
    new.signed_at      := null;
  elsif was_draft and new.status <> 'cancelled' then
    new.signer_user_id := new.approver_user_id;
    new.signature_path := (select u.signature_path from public.users u where u.id = new.approver_user_id);
    new.signed_at      := now();
    new.approved_by    := coalesce(new.approved_by, new.approver_user_id);
    new.approved_at    := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;

drop trigger if exists ap_documents_lock_signature on public.ap_documents;
create trigger ap_documents_lock_signature
  before insert or update of status on public.ap_documents
  for each row execute function public.ap_document_lock_signature();

-- อัปโหลดลายเซ็นแล้ว เติมให้เอกสารที่ยังว่างทั้งสองฝั่ง (ขาย + ซื้อ)
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
       where coalesce(signer_user_id, sales_user_id) = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');

      update public.ap_documents
         set signature_path = new.signature_path,
             signer_user_id = coalesce(signer_user_id, approver_user_id),
             signed_at      = coalesce(signed_at, approved_at, updated_at)
       where coalesce(signer_user_id, approver_user_id) = new.id
         and signature_path is null
         and status not in ('draft', 'cancelled');
    end if;
  end if;
  return new;
end $$;

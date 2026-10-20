-- =============================================================================
-- 0030 — ลายเซ็นผู้อนุมัติ/ผู้รับเงิน ให้ขึ้นครบทุกเอกสาร (QT · BL · INV · RC)
--
-- 0028 ล็อกลายเซ็นตอนเอกสารออกจากสถานะร่าง และเติมให้ใบเก่า "เฉพาะตอนอัปโหลดครั้งแรก"
-- เอกสารที่หลุดช่องนี้ (ออกก่อนเซลล์มีลายเซ็น แล้วเซลล์เปลี่ยนลายเซ็นไปแล้วรอบหนึ่ง,
-- หรือออกก่อนรัน 0028) จึงไม่มีลายเซ็นค้างอยู่
--
--   1. ซ่อมของเดิม: เอกสารที่ออกแล้วแต่ยังไม่มีลายเซ็น → ใช้ลายเซ็นปัจจุบันของเซลล์ในใบ
--   2. กันไม่ให้หลุดอีก: ทุกครั้งที่เซลล์อัปโหลดลายเซ็น (ไม่ใช่แค่ครั้งแรก)
--      เติมให้เอกสารของคนนั้นที่ยังว่างอยู่
--
-- เอกสารที่ล็อกลายเซ็นไปแล้วไม่ถูกแตะ — เปลี่ยนลายเซ็นทีหลังไม่กระทบใบเดิมเหมือนเดิม
-- Idempotent. รันซ้ำได้
-- =============================================================================

-- 1. ซ่อมเอกสารที่ออกแล้วแต่ไม่มีลายเซ็น
update public.ar_documents d
   set signer_user_id = coalesce(d.signer_user_id, d.sales_user_id),
       signed_at      = coalesce(d.signed_at, d.approved_at, d.updated_at),
       signature_path = u.signature_path
  from public.users u
 where u.id = coalesce(d.signer_user_id, d.sales_user_id)
   and u.signature_path is not null
   and d.signature_path is null
   and d.status not in ('draft', 'cancelled');

-- 2. เติมลายเซ็นให้เอกสารที่ยังว่าง ทุกครั้งที่มีการอัปโหลด
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
    end if;
  end if;
  return new;
end $$;

-- =============================================================================
-- 0020 — ปลดล็อกการลบรายการในสมุดรายรับ-รายจ่าย
--
-- ปัญหา: ar_payments.cash_entry_id อ้าง cash_entries โดยไม่ระบุ ON DELETE
--        Postgres จึงใช้ NO ACTION → ลบรายการเงินเข้าที่มาจากการรับชำระไม่ได้เลย
--        และหน้าจอไม่ได้จับ error ผู้ใช้จึงเห็นแค่ "กดแล้วไม่มีอะไรเกิดขึ้น"
--
-- แก้เป็น SET NULL: ลบรายการในสมุดได้ ส่วนประวัติการรับชำระยังอยู่ครบ
-- (การรับชำระเป็นหลักฐานทางบัญชี ห้ามหายไปพร้อมกับรายการในสมุด)
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.ar_payments
  drop constraint if exists ar_payments_cash_entry_id_fkey;

alter table public.ar_payments
  add constraint ar_payments_cash_entry_id_fkey
  foreign key (cash_entry_id) references public.cash_entries(id) on delete set null;

-- รายการในสมุดที่ผูกกับเอกสารขาย/ซื้อ ก็ควรลบได้เช่นกัน
-- (0016 ตั้ง on delete set null ไว้แล้วสำหรับ ar_document_id / ap_document_id — ยืนยันซ้ำ)
alter table public.cash_entries
  drop constraint if exists cash_entries_ar_document_id_fkey;
alter table public.cash_entries
  add constraint cash_entries_ar_document_id_fkey
  foreign key (ar_document_id) references public.ar_documents(id) on delete set null;

alter table public.cash_entries
  drop constraint if exists cash_entries_ap_document_id_fkey;
alter table public.cash_entries
  add constraint cash_entries_ap_document_id_fkey
  foreign key (ap_document_id) references public.ap_documents(id) on delete set null;

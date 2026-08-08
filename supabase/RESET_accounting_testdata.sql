-- =============================================================================
-- ล้างข้อมูลทดสอบของโมดูลบัญชี แล้วตั้งเลขเอกสารกลับไปเริ่มที่ 001
--
-- ใช้ตอนวางระบบเสร็จ ก่อนเริ่มออกเอกสารจริงใบแรก
-- ⚠️ ลบข้อมูลถาวร รันเฉพาะตอนที่ยังไม่มีเอกสารจริง
--
-- ไม่แตะ: บริษัท · บัญชีธนาคาร · ผู้ขาย · ประเภทงาน · หมวดหมู่ · กระเป๋าเงิน
--         และไม่แตะข้อมูลของโมดูลอื่นเลย (Project / Ticket / Stock / Sourcing)
-- =============================================================================

begin;

-- เอกสารขายและทุกอย่างที่ห้อยอยู่ (items / payments / allocations ลบตาม cascade)
delete from public.ar_payment_allocations;
delete from public.ar_payments;
delete from public.ar_document_items;
delete from public.ar_documents;

-- เอกสารซื้อ
delete from public.ap_document_items;
delete from public.ap_documents;

-- สมุดรายรับ-รายจ่าย (ยอดยกมาของกระเป๋ายังอยู่)
delete from public.cash_entries;

-- ตัวเรียงเลขเอกสารทุกประเภททุกบริษัท → ใบถัดไปเริ่มที่ 001
delete from public.document_sequences;

commit;

-- ตรวจผล: ทุกบรรทัดต้องเป็น 0
select 'ar_documents' as t, count(*) from public.ar_documents
union all select 'ap_documents', count(*) from public.ap_documents
union all select 'ar_payments', count(*) from public.ar_payments
union all select 'cash_entries', count(*) from public.cash_entries
union all select 'document_sequences', count(*) from public.document_sequences;

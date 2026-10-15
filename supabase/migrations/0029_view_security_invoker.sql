-- =============================================================================
-- 0029 — ปิดคำเตือน Security Advisor: "Security Definer View" (stock_incoming_qty)
--
-- view ตั้งต้นของ Postgres ทำงานด้วยสิทธิ์คนสร้าง (ข้าม RLS) → role anon ที่ไม่ได้ล็อกอิน
-- เรียกดูยอดสินค้ากำลังมาผ่าน API ได้ · เปลี่ยนเป็นสิทธิ์คนเรียก ให้ RLS ของตารางล็อตทำงาน
-- คนล็อกอินยังเห็นครบเหมือนเดิม (policy อ่านของ incoming_shipments* = ทุกคนที่ล็อกอิน)
--
-- ต้องใช้ PostgreSQL 15+ (Supabase ปัจจุบันเป็น 15/17 แล้ว) · Idempotent
-- =============================================================================
alter view public.stock_incoming_qty set (security_invoker = true);

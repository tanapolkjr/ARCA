-- =============================================================================
-- 0019 — ราคาขายในคลังสินค้า
--
-- โมดูลบัญชีดึงราคาขายจาก stock_items มาใส่ใบเสนอราคา แต่คอลัมน์นี้ยังไม่มี
-- ทำให้ query ค้นหาสินค้าในหน้าเอกสารล้มทั้งก้อน (ค้นหาแล้วไม่ขึ้นรายการเลย)
--
-- ราคาขายมาได้ 2 ทาง:
--   1. ดึงมาจาก Sourcing ตอนโปรโมตสินค้าที่ Approved (suggested_selling_price)
--   2. คีย์เองในหน้าแก้ไขสินค้า
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.stock_items
  add column if not exists sale_price decimal(14,2);

comment on column public.stock_items.sale_price is
  'ราคาขายตั้งต้นต่อหน่วย — ดึงไปใส่ใบเสนอราคาอัตโนมัติ '
  'มาจาก Sourcing (product_costs.suggested_selling_price) หรือคีย์เอง';

-- เติมราคาขายให้สินค้าที่โปรโมตมาจาก Sourcing แล้วแต่ยังไม่มีราคา
-- ใช้ประมาณการล่าสุดของสินค้านั้น (product_costs เป็น append-only)
update public.stock_items s
   set sale_price = c.suggested_selling_price
  from (
    select distinct on (product_id) product_id, suggested_selling_price
      from public.product_costs
     where suggested_selling_price is not null
     order by product_id, created_at desc
  ) c
 where s.source_product_id = c.product_id
   and s.sale_price is null;

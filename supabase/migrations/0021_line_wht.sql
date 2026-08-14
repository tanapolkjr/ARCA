-- =============================================================================
-- 0021 — หัก ณ ที่จ่ายรายบรรทัด
--
-- เดิมเก็บอัตราไว้ที่หัวเอกสารใบเดียว แล้วหักจากยอดทั้งก้อน
-- แต่บิลจริงของ ARCA ผสมสินค้ากับค่าบริการในใบเดียวกันเป็นปกติ
-- และกฎหมายให้หัก ณ ที่จ่ายเฉพาะค่าบริการ/รับจ้างทำของ ไม่ใช่ค่าสินค้า
--
-- ย้ายอัตรามาอยู่ที่บรรทัด แล้วยอดหักของเอกสาร = ผลรวมของทุกบรรทัด
-- ar_documents.wht_rate ยังอยู่ ใช้เป็นค่าตั้งต้นที่กดใส่ให้ทุกบรรทัดพร้อมกัน
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.ar_document_items
  add column if not exists wht_rate decimal(5,2) not null default 0;

alter table public.ap_document_items
  add column if not exists wht_rate decimal(5,2) not null default 0;

comment on column public.ar_document_items.wht_rate is
  'อัตราหัก ณ ที่จ่ายของบรรทัดนี้ (%) — คิดจากมูลค่าก่อน VAT ของบรรทัด '
  'ปกติ 0 สำหรับสินค้า และ 3 สำหรับค่าบริการ';

-- ย้ายค่าเดิมลงมาที่บรรทัด: เอกสารเก่าที่ตั้งอัตราไว้ที่หัวใบ
-- ให้ลงเฉพาะบรรทัดที่เป็นบริการ ซึ่งตรงกับที่กฎหมายกำหนด
update public.ar_document_items i
   set wht_rate = d.wht_rate
  from public.ar_documents d
 where i.document_id = d.id
   and d.wht_rate > 0
   and i.item_type = 'service'
   and i.wht_rate = 0;

update public.ap_document_items i
   set wht_rate = d.wht_rate
  from public.ap_documents d
 where i.document_id = d.id
   and d.wht_rate > 0
   and i.item_type = 'service'
   and i.wht_rate = 0;

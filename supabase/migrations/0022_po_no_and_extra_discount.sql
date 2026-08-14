-- =============================================================================
-- 0022 — เลขที่ใบสั่งซื้อของลูกค้า + ส่วนลดพิเศษท้ายบิล
--
--   • customer_po_no        เลขที่ PO ที่ลูกค้าออกให้เรา — ใส่ที่ใบเสนอราคา
--                           แล้วไหลตามไปใบแจ้งหนี้และใบกำกับ ลูกค้าใช้จับคู่เอกสาร
--   • extra_discount_*      ส่วนลดพิเศษท้ายบิล คีย์เป็นบาทหรือ % ก็ได้
--                           คนละตัวกับส่วนลดรายบรรทัด
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.ar_documents
  add column if not exists customer_po_no        varchar(60),
  -- 'amount' = คีย์เป็นบาท · 'percent' = คีย์เป็น %
  add column if not exists extra_discount_type   varchar(10) not null default 'amount',
  -- ค่าที่คีย์ (บาทหรือ % ตาม type)
  add column if not exists extra_discount_value  decimal(14,2) not null default 0,
  -- จำนวนเงินที่หักจริง — เก็บไว้ด้วยเพื่อให้เอกสารที่ออกแล้วยอดไม่ขยับ
  add column if not exists extra_discount_amount decimal(14,2) not null default 0;

alter table public.ap_documents
  add column if not exists customer_po_no        varchar(60),
  add column if not exists extra_discount_type   varchar(10) not null default 'amount',
  add column if not exists extra_discount_value  decimal(14,2) not null default 0,
  add column if not exists extra_discount_amount decimal(14,2) not null default 0;

comment on column public.ar_documents.customer_po_no is
  'เลขที่ใบสั่งซื้อที่ลูกค้าออกให้เรา — พิมพ์บนเอกสารเพื่อให้ลูกค้าจับคู่กับ PO ฝั่งเขาได้';

comment on column public.ar_documents.extra_discount_amount is
  'ส่วนลดพิเศษท้ายบิลเป็นจำนวนเงิน หักหลังรวมรายการทั้งหมด '
  'กระจายตามสัดส่วนของฐานที่เสียภาษีและฐานที่ยกเว้น';

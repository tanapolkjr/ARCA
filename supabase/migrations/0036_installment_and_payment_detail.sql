-- =============================================================================
-- 0036 — งวดที่ (ใบแจ้งหนี้ / ใบกำกับ) + รายละเอียดการรับชำระที่พิมพ์บนใบกำกับ/ใบเสร็จ
--
--   • installment_no  งวดที่ 1, 2, 3 … — ใบแจ้งหนี้ตั้งต้นเป็นงวดถัดไปของใบเสนอราคา
--                     ใบกำกับ/ใบเสร็จรับงวดเดียวกับใบแจ้งหนี้ที่อ้างอิง (แก้ได้)
--   • pay_method      cash | cheque | transfer | credit_card — ติ๊กช่องบนใบพิมพ์
--   • pay_bank / pay_ref / pay_date / pay_amount — เติมช่องว่าง ธนาคาร เลขที่ วันที่ จำนวนเงิน
--     ตั้งต้นจากการรับชำระของใบแจ้งหนี้ต้นทาง แก้ได้ก่อนออกเอกสาร
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================
alter table public.ar_documents
  add column if not exists installment_no smallint check (installment_no is null or installment_no between 1 and 99),
  add column if not exists pay_method     varchar(20) check (pay_method is null or pay_method in ('cash','cheque','transfer','credit_card')),
  add column if not exists pay_bank       varchar(100),
  add column if not exists pay_ref        varchar(100),
  add column if not exists pay_date       date,
  add column if not exists pay_amount     decimal(14,2);

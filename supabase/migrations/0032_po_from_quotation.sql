-- =============================================================================
-- 0032 — ใบสั่งซื้อ (PO) อ้างอิงใบเสนอราคา · ต้นทุนและกำไรต่องาน
--
--   • ap_documents.sales_document_id     PO นี้ซื้อของให้ใบเสนอราคาใบไหน
--                                        (source_document_id เดิมเป็น FK ไปฝั่งซื้อด้วยกัน
--                                         จึงแยกคอลัมน์ ไม่ปนกัน)
--   • ap_document_items.ref_sell_price   ราคาขายต่อหน่วย (ก่อน VAT หลังหักส่วนลด) จากใบเสนอราคา
--                                        ไว้ดูกำไรตอนกรอกราคาซื้อ — ไม่พิมพ์ลงใบ PO
--   • ap_document_items.source_ar_item_id บรรทัดนี้มาจากบรรทัดไหนของใบเสนอราคา
--                                        ใช้นับ "สั่งไปแล้วกี่ชิ้นจากที่ขาย"
--
-- ต้นทุนของงาน = ยอดก่อน VAT ของ PO ที่ออกแล้ว (ไม่นับร่าง/ยกเลิก) × อัตราแลกเปลี่ยน
-- ราคาซื้อคือ unit_price เดิม — สูตรคำนวณยอด PO ไม่เปลี่ยนแม้แต่บรรทัดเดียว
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

alter table public.ap_documents
  add column if not exists sales_document_id uuid references public.ar_documents(id) on delete set null;
create index if not exists ap_documents_sales_doc_idx on public.ap_documents (sales_document_id);

alter table public.ap_document_items
  add column if not exists ref_sell_price    decimal(14,4),
  add column if not exists source_ar_item_id uuid references public.ar_document_items(id) on delete set null;
create index if not exists ap_document_items_src_ar_item_idx on public.ap_document_items (source_ar_item_id);

comment on column public.ap_documents.sales_document_id is
  'ใบเสนอราคาที่ PO นี้สั่งซื้อของให้ — ใช้คำนวณต้นทุน/กำไรต่องานในหน้า Report';
comment on column public.ap_document_items.ref_sell_price is
  'ราคาขายต่อหน่วยจากใบเสนอราคา (ก่อน VAT, หลังส่วนลด) — แสดงในหน้าจอเท่านั้น ไม่พิมพ์ลง PO';

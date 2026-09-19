-- =============================================================================
-- 0027 — จัดกลุ่มรายการในเอกสารขาย (Group สินค้าใน QT/BL/INV)
--
-- ปัญหา: งานที่ต้องแบ่งสินค้าเป็นชุด (Type A / Type B / Type C) ตอนนี้ต้อง
-- ยัดทุกชิ้นเป็นข้อความในบรรทัดเดียวกัน ตั้งราคาแยกแต่ละชิ้นไม่ได้ เสนอราคา
-- ได้แค่ยอดรวมทั้งชุด
--
-- แก้ด้วยตารางกลุ่มใหม่ที่ "ครอบ" ar_document_items — เป็นชั้นจัดกลุ่ม/
-- แสดงผลเท่านั้น ไม่แตะสูตรคำนวณใน accounting-lib/calc.ts แม้แต่บรรทัดเดียว:
-- subtotal / vat_base / vat_exempt_base / vat_amount / grand_total / wht_amount
-- ยังรวมจากทุก item ทั้งเอกสารเหมือนเดิมทุกประการ ไม่สนใจว่าใครอยู่กลุ่มไหน
-- (ยอดรวมย่อยต่อกลุ่มที่เห็นบนเอกสารเป็นแค่ SUM(line_total) กรองด้วย group_id
-- คำนวณตอนแสดงผล ไม่ใช่สูตรใหม่ และไม่ถูกเก็บเป็นคอลัมน์ถาวรที่ไหน)
--
-- Optional ต่อเอกสาร: ใบที่ไม่เคยสร้างกลุ่มเลย (group_id ทุกแถวเป็น null)
-- แสดงผลเหมือนก่อนมี migration นี้ทุกประการ ไม่กระทบเอกสารเก่า
--
-- แปลง QT → BL → INV ยังพากลุ่มไปด้วย (โค้ดฝั่ง accounting-api/documents.ts
-- ออก id ใหม่ให้ทุกกลุ่มตอนคัดลอกข้ามเอกสาร เพราะ id เป็น primary key ต่อแถว
-- ไม่ใช่ตัวระบุกลุ่มข้ามเอกสาร)
--
-- ไม่ครอบคลุมฝั่งซื้อ (ap_document_items) ในรอบนี้ — ยังไม่มีความต้องการ
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create table if not exists public.ar_document_item_groups (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ar_documents(id) on delete cascade,
  sort_order  integer not null default 0,
  group_name  varchar(200) not null
);
create index if not exists ar_document_item_groups_doc_idx
  on public.ar_document_item_groups (document_id, sort_order);

alter table public.ar_document_items
  add column if not exists group_id uuid references public.ar_document_item_groups(id) on delete set null;
create index if not exists ar_document_items_group_idx on public.ar_document_items (group_id);

-- ---------------------------------------------------------------------------
-- RLS — เหมือน ar_document_items ทุกประการ: อ่านได้ทุกคนที่ล็อกอิน
-- เขียนได้เฉพาะฝ่ายบัญชี + เจ้าของใบเสนอราคา (Sale เจ้าของ QT ของตัวเอง)
-- ---------------------------------------------------------------------------
alter table public.ar_document_item_groups enable row level security;

drop policy if exists "ar_document_item_groups_acct_read" on public.ar_document_item_groups;
create policy "ar_document_item_groups_acct_read" on public.ar_document_item_groups
  for select to authenticated using (true);

drop policy if exists "ar_document_item_groups_acct_write" on public.ar_document_item_groups;
create policy "ar_document_item_groups_acct_write" on public.ar_document_item_groups
  for all to authenticated
  using (public.is_accounting_user())
  with check (public.is_accounting_user());

drop policy if exists "ar_document_item_groups_sale_own" on public.ar_document_item_groups;
create policy "ar_document_item_groups_sale_own" on public.ar_document_item_groups
  for all to authenticated
  using (exists (
    select 1 from public.ar_documents d
    where d.id = document_id and d.doc_type = 'QT' and d.created_by = auth.uid()))
  with check (exists (
    select 1 from public.ar_documents d
    where d.id = document_id and d.doc_type = 'QT' and d.created_by = auth.uid()));

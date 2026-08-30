-- =============================================================================
-- 0025 — ส่วนลดรายบรรทัด: เลือกได้ว่าลดต่อชิ้น ลดทั้งบรรทัด หรือเป็น %
--
-- ปัญหา: ช่อง "ส่วนลด" อยู่ถัดจาก "ราคา/หน่วย" คนกรอกจึงเข้าใจว่าลดต่อชิ้น
--        แต่ระบบคิดเป็นลดทั้งบรรทัด (ตามที่ FlowAccount ทำ) ยอดจึงเพี้ยนมหาศาล
--        เช่น 1,647 ชิ้น ราคา 990 ลด 630 → ระบบได้ 1,629,900 แต่ควรเป็น 592,920
--
-- แก้โดยเก็บ "โหมด" กับ "ค่าที่กรอก" แยกจากยอดส่วนลดที่คำนวณได้
--   discount_mode  = 'unit' ต่อชิ้น · 'line' ทั้งบรรทัด · 'percent' เปอร์เซ็นต์
--   discount_input = ตัวเลขที่ผู้ใช้กรอก
--   discount_amount = ยอดที่หักจริง (คงไว้เหมือนเดิม รายงานทุกตัวยังใช้ช่องนี้)
--
-- เอกสารเก่าถูก backfill เป็นโหมดเดิมเป๊ะ ยอดจึงไม่ขยับแม้แต่บาทเดียว
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['ar_document_items', 'ap_document_items'] loop
    execute format($f$
      alter table public.%I
        add column if not exists discount_mode  varchar(10) not null default 'line',
        add column if not exists discount_input decimal(14,4) not null default 0
    $f$, t);

    -- backfill: แถวเดิมที่กรอกเป็น % ให้เป็นโหมด percent
    -- ที่เหลือเป็นลดทั้งบรรทัดตามพฤติกรรมเดิม → ยอดคำนวณออกมาเท่าเดิมทุกบาท
    execute format($f$
      update public.%I
         set discount_mode  = 'percent',
             discount_input = discount_percent
       where discount_percent is not null
         and discount_percent <> 0
         and discount_mode = 'line'
         and discount_input = 0
    $f$, t);

    execute format($f$
      update public.%I
         set discount_input = discount_amount
       where (discount_percent is null or discount_percent = 0)
         and discount_input = 0
         and discount_amount <> 0
    $f$, t);

    execute format($f$
      alter table public.%I
        drop constraint if exists %I
    $f$, t, t || '_discount_mode_check');

    execute format($f$
      alter table public.%I
        add constraint %I check (discount_mode in ('unit', 'line', 'percent'))
    $f$, t, t || '_discount_mode_check');
  end loop;
end $$;

comment on column public.ar_document_items.discount_mode is
  'unit = ลดต่อชิ้น (คูณจำนวน) · line = ลดทั้งบรรทัด · percent = % ของยอดบรรทัด';
comment on column public.ar_document_items.discount_input is
  'ตัวเลขที่ผู้ใช้กรอก — discount_amount คือยอดที่หักจริงหลังคำนวณตามโหมด';

-- =============================================================================
-- 0023 — On the way: สินค้าที่กำลังขนส่งเข้ามา
--
-- แยกเป็นล็อตขนส่ง (shipment) แต่ละล็อตมีเลขที่ order ของผู้ขาย รายการสินค้า
-- จำนวน วันที่คาดว่าถึง และหมายเหตุว่าเป็นของงานไหน
--
-- หลักการที่ยึด:
--   1. ของที่ยังไม่ถึง **ไม่นับเป็น on_hand** — ไม่แตะ stock_balances จนกว่าจะรับเข้าจริง
--      ไม่งั้นจะเบิกของที่ยังไม่มีได้ ซึ่งเป็นความพังที่แพงที่สุดของธุรกิจติดตั้ง
--   2. ตอนรับเข้าใช้ทางเดิมทั้งหมด — stock_transactions type 'receive_in'
--      และ stock_balances เหมือนการรับเข้าคลังปกติ ไม่สร้างเส้นทางที่สอง
--   3. สถานะคำนวณจากจำนวนที่รับจริงด้วย trigger ไม่ให้คนกดเปลี่ยนเอง
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

-- ---------------------------------------------------------------------------
-- เลขที่ล็อต INC{YYYYMM}{NNN} — มีตัวเรียงของตัวเอง ไม่ผูกกับเลขเอกสารบัญชี
-- เพราะล็อตขนส่งไม่ใช่เอกสารของนิติบุคคล
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_sequences (
  period_key  varchar(6) primary key,
  last_number integer not null default 0
);

create or replace function public.next_shipment_no(p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(p_date, 'YYYYMM');
  v_num    integer;
begin
  insert into public.shipment_sequences (period_key, last_number)
  values (v_period, 1)
  on conflict (period_key)
    do update set last_number = shipment_sequences.last_number + 1
  returning last_number into v_num;

  return 'INC' || v_period || lpad(v_num::text, 3, '0');
end $$;

-- ---------------------------------------------------------------------------
-- ล็อตขนส่ง
-- ---------------------------------------------------------------------------
create table if not exists public.incoming_shipments (
  id            uuid primary key default gen_random_uuid(),
  shipment_no   varchar(30) unique,
  order_no      varchar(60),                    -- เลขที่ order ที่สั่งกับผู้ขาย
  vendor_id     uuid references public.vendors(id) on delete set null,
  ap_document_id uuid references public.ap_documents(id) on delete set null,
  carrier       varchar(100),                   -- ขนส่งเจ้าไหน / เรือ / เครื่อง
  tracking_no   varchar(100),
  eta_date      date,                           -- คาดว่าถึงวันไหน
  arrived_date  date,
  status        varchar(20) not null default 'in_transit'
                check (status in ('in_transit','partial','received','cancelled')),
  project_id    uuid references public.projects(id) on delete set null,
  note          text,                           -- เช่น "ของงาน Kata Bello"
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists incoming_shipments_status_idx on public.incoming_shipments (status, eta_date);
drop trigger if exists incoming_shipments_touch on public.incoming_shipments;
create trigger incoming_shipments_touch before update on public.incoming_shipments
  for each row execute function touch_updated_at();

create table if not exists public.incoming_shipment_items (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references public.incoming_shipments(id) on delete cascade,
  line_no       integer not null default 1,
  -- ON DELETE RESTRICT: ห้ามลบสินค้าที่ยังมีของกำลังเดินทางมา
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  qty_ordered   decimal(14,3) not null check (qty_ordered > 0),
  qty_received  decimal(14,3) not null default 0 check (qty_received >= 0),
  note          text,
  constraint incoming_items_not_over_received check (qty_received <= qty_ordered)
);
create index if not exists incoming_items_shipment_idx on public.incoming_shipment_items (shipment_id, line_no);
create index if not exists incoming_items_stock_idx on public.incoming_shipment_items (stock_item_id);

-- ---------------------------------------------------------------------------
-- สถานะล็อตคำนวณจากจำนวนที่รับจริง ไม่ให้คนกดเปลี่ยนเอง
-- ---------------------------------------------------------------------------
create or replace function public.recalc_shipment_status(p_shipment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ordered decimal(14,3);
  v_received decimal(14,3);
  v_status varchar(20);
begin
  select coalesce(sum(qty_ordered), 0), coalesce(sum(qty_received), 0)
    into v_ordered, v_received
    from public.incoming_shipment_items where shipment_id = p_shipment;

  select status into v_status from public.incoming_shipments where id = p_shipment;
  if v_status = 'cancelled' then return; end if;   -- ยกเลิกแล้วไม่ต้องขยับ

  update public.incoming_shipments
     set status = case
           when v_ordered > 0 and v_received >= v_ordered then 'received'
           when v_received > 0                            then 'partial'
           else 'in_transit'
         end,
         -- บันทึกวันที่รับครบครั้งแรก และล้างเมื่อถอยกลับ
         arrived_date = case
           when v_ordered > 0 and v_received >= v_ordered
             then coalesce(arrived_date, current_date)
           else null
         end
   where id = p_shipment;
end $$;

create or replace function public.incoming_item_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_shipment_status(old.shipment_id);
    return old;
  end if;
  perform public.recalc_shipment_status(new.shipment_id);
  return new;
end $$;

drop trigger if exists incoming_item_recalc on public.incoming_shipment_items;
create trigger incoming_item_recalc
  after insert or update or delete on public.incoming_shipment_items
  for each row execute function public.incoming_item_changed();

-- ---------------------------------------------------------------------------
-- จำนวนที่ "กำลังมา" ต่อสินค้า — ใช้แสดงในหน้า Inventory
-- นับเฉพาะล็อตที่ยังไม่ยกเลิก และเฉพาะส่วนที่ยังไม่ได้รับเข้า
-- ---------------------------------------------------------------------------
create or replace view public.stock_incoming_qty as
  select i.stock_item_id,
         sum(i.qty_ordered - i.qty_received) as qty_incoming
    from public.incoming_shipment_items i
    join public.incoming_shipments s on s.id = i.shipment_id
   where s.status in ('in_transit', 'partial')
     and i.qty_ordered > i.qty_received
   group by i.stock_item_id;

-- ---------------------------------------------------------------------------
-- RLS — อ่านได้ทุกคนที่ล็อกอิน เขียนได้เฉพาะฝ่ายที่ดูแลสต็อก
-- (ใช้เกณฑ์เดียวกับการรับเข้าคลังเดิม: Super Admin / Manager / Store)
-- ---------------------------------------------------------------------------
create or replace function public.is_stock_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role in ('Super Admin', 'Manager', 'Store')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['incoming_shipments','incoming_shipment_items','shipment_sequences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format(
      'create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all to authenticated '
      'using (public.is_stock_user()) with check (public.is_stock_user())', t, t);
  end loop;
end $$;

-- =============================================================================
-- 0024 — แก้ไขคลังสินค้าได้ + ล็อกรหัสกระเป๋าเงิน
--
-- ส่วนกระเป๋าเงิน: คนที่ถือเงินตั้งรหัสไว้ แล้วต้องใส่รหัสถึงจะแก้หรือลบได้
--
-- ทำให้บังคับได้จริงที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม:
--   • รหัสเก็บเป็น hash (bcrypt) ไม่เคยเก็บตัวเลขจริง
--   • ตารางที่เก็บ hash **ไม่มี policy ให้อ่าน** ดึงออกมาจากฝั่ง client ไม่ได้เลย
--   • ถอด policy update/delete ของ wallets ออก → แก้ตรงๆ ไม่ได้
--     ต้องผ่านฟังก์ชันที่ตรวจรหัสให้ก่อนเท่านั้น
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. คลังสินค้า — เพิ่มรายละเอียดและให้แก้ไขได้
-- ---------------------------------------------------------------------------
alter table public.stock_locations
  add column if not exists note       text,
  add column if not exists address    text,
  add column if not exists phone      varchar(50),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists stock_locations_touch on public.stock_locations;
create trigger stock_locations_touch before update on public.stock_locations
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. รหัสกระเป๋าเงิน — เก็บแยกตาราง และห้ามอ่านจากฝั่ง client
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_pins (
  wallet_id  uuid primary key references public.wallets(id) on delete cascade,
  pin_hash   text not null,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

alter table public.wallet_pins enable row level security;
-- ตั้งใจไม่สร้าง policy ใดๆ: client อ่านหรือเขียนตรงๆ ไม่ได้เลย
-- เข้าถึงได้ทางฟังก์ชัน security definer ข้างล่างเท่านั้น
drop policy if exists "wallet_pins_read"  on public.wallet_pins;
drop policy if exists "wallet_pins_write" on public.wallet_pins;

-- ประวัติการแก้ไขกระเป๋าเงิน — เงินของบริษัท ต้องตอบได้ว่าใครแก้อะไรเมื่อไร
create table if not exists public.wallet_audit (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid references public.wallets(id) on delete cascade,
  action     varchar(30) not null,
  detail     text,
  changed_by uuid references public.users(id),
  changed_at timestamptz not null default now()
);
alter table public.wallet_audit enable row level security;
drop policy if exists "wallet_audit_read" on public.wallet_audit;
create policy "wallet_audit_read" on public.wallet_audit
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3. ฟังก์ชันจัดการรหัส
-- ---------------------------------------------------------------------------

/** กระเป๋านี้ตั้งรหัสไว้หรือยัง — ใช้ตัดสินว่าหน้าจอต้องถามรหัสไหม */
create or replace function public.wallet_has_pin(p_wallet uuid)
returns boolean language sql stable security definer
set search_path = public, extensions as $$
  select exists (select 1 from public.wallet_pins where wallet_id = p_wallet);
$$;

/**
 * ตรวจรหัส — คืน true/false เท่านั้น hash ไม่เคยออกจากฐานข้อมูล
 * กระเป๋าที่ยังไม่ตั้งรหัส ถือว่าผ่าน (ยังไม่ล็อก)
 */
create or replace function public.verify_wallet_pin(p_wallet uuid, p_pin text)
returns boolean language plpgsql stable security definer
set search_path = public, extensions as $$
declare v_hash text;
begin
  select pin_hash into v_hash from public.wallet_pins where wallet_id = p_wallet;
  if v_hash is null then return true; end if;
  return v_hash = crypt(coalesce(p_pin, ''), v_hash);
end $$;

/**
 * ตั้งหรือเปลี่ยนรหัส
 * มีรหัสอยู่แล้วต้องใส่รหัสเดิมให้ถูก ยกเว้น Super Admin ที่รีเซ็ตให้ได้
 * (กันกรณีคนถือเงินลาออกแล้วไม่มีใครเข้าได้เลย)
 */
create or replace function public.set_wallet_pin(
  p_wallet uuid, p_new_pin text, p_old_pin text default null)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_exists boolean;
  v_super  boolean;
begin
  if p_new_pin is null or length(trim(p_new_pin)) < 4 then
    raise exception 'รหัสต้องมีอย่างน้อย 4 ตัว';
  end if;

  select exists (select 1 from public.wallet_pins where wallet_id = p_wallet) into v_exists;
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active and u.role = 'Super Admin'
  ) into v_super;

  if v_exists and not v_super then
    if not public.verify_wallet_pin(p_wallet, p_old_pin) then
      raise exception 'รหัสเดิมไม่ถูกต้อง';
    end if;
  end if;

  insert into public.wallet_pins (wallet_id, pin_hash, updated_by, updated_at)
  values (p_wallet, crypt(trim(p_new_pin), gen_salt('bf')), auth.uid(), now())
  on conflict (wallet_id) do update
    set pin_hash = excluded.pin_hash, updated_by = excluded.updated_by, updated_at = now();

  insert into public.wallet_audit (wallet_id, action, detail, changed_by)
  values (p_wallet, case when v_exists then 'change_pin' else 'set_pin' end,
          case when v_super and v_exists then 'Super Admin รีเซ็ตรหัส' else null end, auth.uid());
end $$;

/** ยกเลิกการล็อก — ต้องใส่รหัสเดิม หรือเป็น Super Admin */
create or replace function public.clear_wallet_pin(p_wallet uuid, p_pin text default null)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare v_super boolean;
begin
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active and u.role = 'Super Admin'
  ) into v_super;

  if not v_super and not public.verify_wallet_pin(p_wallet, p_pin) then
    raise exception 'รหัสไม่ถูกต้อง';
  end if;

  delete from public.wallet_pins where wallet_id = p_wallet;
  insert into public.wallet_audit (wallet_id, action, changed_by)
  values (p_wallet, 'clear_pin', auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- 4. แก้ / ลบกระเป๋าเงิน — ต้องผ่านฟังก์ชันที่ตรวจรหัสเท่านั้น
-- ---------------------------------------------------------------------------
create or replace function public.update_wallet_secure(
  p_wallet uuid, p_pin text,
  p_name text, p_wallet_type text, p_bank_name text, p_account_no text,
  p_opening_balance numeric, p_is_active boolean)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare v_old numeric;
begin
  if not exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role in ('Super Admin', 'Manager', 'Admin')
  ) then
    raise exception 'ไม่มีสิทธิ์แก้ไขกระเป๋าเงิน';
  end if;

  if not public.verify_wallet_pin(p_wallet, p_pin) then
    raise exception 'รหัสกระเป๋าเงินไม่ถูกต้อง';
  end if;

  select opening_balance into v_old from public.wallets where id = p_wallet;

  update public.wallets
     set name            = coalesce(nullif(trim(p_name), ''), name),
         wallet_type     = coalesce(p_wallet_type, wallet_type),
         bank_name       = p_bank_name,
         account_no      = p_account_no,
         opening_balance = coalesce(p_opening_balance, opening_balance),
         is_active       = coalesce(p_is_active, is_active)
   where id = p_wallet;

  insert into public.wallet_audit (wallet_id, action, detail, changed_by)
  values (p_wallet, 'update',
          case when p_opening_balance is not null and p_opening_balance <> v_old
               then format('ยอดยกมา %s → %s', v_old, p_opening_balance) end,
          auth.uid());
end $$;

/** ลบกระเป๋า — ต้องไม่มีรายการเงินผูกอยู่ ไม่งั้นประวัติจะขาด */
create or replace function public.delete_wallet_secure(p_wallet uuid, p_pin text)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare v_count integer;
begin
  if not exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role in ('Super Admin', 'Manager')
  ) then
    raise exception 'ลบกระเป๋าเงินได้เฉพาะ Manager ขึ้นไป';
  end if;

  if not public.verify_wallet_pin(p_wallet, p_pin) then
    raise exception 'รหัสกระเป๋าเงินไม่ถูกต้อง';
  end if;

  select count(*) into v_count from public.cash_entries
   where wallet_id = p_wallet or to_wallet_id = p_wallet;
  if v_count > 0 then
    raise exception 'กระเป๋านี้มีรายการเงินอยู่ % รายการ ลบไม่ได้ — ปิดใช้งานแทน', v_count;
  end if;

  delete from public.wallets where id = p_wallet;
end $$;

-- ---------------------------------------------------------------------------
-- 5. ปิดทางแก้ wallets ตรงๆ — เหลือแค่ดูกับสร้าง
--    0016 เคยให้ FOR ALL ไว้ ต้องถอดออกไม่งั้นข้ามรหัสได้ด้วยการ update ตรง
-- ---------------------------------------------------------------------------
drop policy if exists "wallets_acct_write" on public.wallets;
drop policy if exists "wallets_acct_read"  on public.wallets;
drop policy if exists "wallets_insert"     on public.wallets;

create policy "wallets_acct_read" on public.wallets
  for select to authenticated using (true);

create policy "wallets_insert" on public.wallets
  for insert to authenticated with check (public.is_accounting_user());

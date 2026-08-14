-- =============================================================================
-- 0018 — รับชำระเงิน / ตัดยอดบิล / ยกเลิกเอกสาร
--
--   • ar_payments            การรับเงินหนึ่งครั้ง (เงินเข้าจริง + WHT + ค่าธรรมเนียม)
--   • ar_payment_allocations รับก้อนเดียวตัดได้หลายบิล
--   • trigger คำนวณ paid_amount และสถานะของเอกสารใหม่ทุกครั้งที่ยอดตัดเปลี่ยน
--
-- หลักการกระทบยอด:  ยอดที่ตัดหนี้ = เงินเข้าจริง + หัก ณ ที่จ่าย + ค่าธรรมเนียม
--
-- Idempotent. รันก่อน deploy โค้ด
-- =============================================================================

create table if not exists public.ar_payments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  payment_date   date not null default current_date,
  payment_method varchar(20) not null default 'transfer'
                 check (payment_method in ('cash','transfer','cheque','credit_card','other')),
  -- กระเป๋าที่เงินเข้า — null ได้เมื่อระบบตัดยอดให้อัตโนมัติตอนออกใบเสร็จ
  -- แล้วยังไม่ได้ระบุว่าเงินเข้าบัญชีไหน (หน้าจอจะเตือนให้มาเติม)
  wallet_id      uuid references public.wallets(id) on delete set null,
  customer_id    uuid references public.customers(id) on delete set null,

  amount_received decimal(14,2) not null default 0,   -- เงินเข้าจริง
  wht_amount      decimal(14,2) not null default 0,   -- ลูกค้าหักไว้
  wht_cert_no     varchar(50),
  fee_amount      decimal(14,2) not null default 0,   -- ค่าธรรมเนียมธนาคาร

  reference_no   varchar(50),
  note           text,
  attachment_path varchar(500),
  -- ถ้าเกิดจากการออกใบเสร็จ/ใบกำกับ จะชี้กลับไปที่ใบนั้น
  created_from_document_id uuid references public.ar_documents(id) on delete set null,
  cash_entry_id  uuid references public.cash_entries(id) on delete set null,
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ar_payments_date_idx on public.ar_payments (company_id, payment_date desc);
drop trigger if exists ar_payments_touch on public.ar_payments;
create trigger ar_payments_touch before update on public.ar_payments
  for each row execute function touch_updated_at();

create table if not exists public.ar_payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.ar_payments(id) on delete cascade,
  document_id uuid not null references public.ar_documents(id) on delete cascade,
  amount      decimal(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (payment_id, document_id)
);
create index if not exists ar_alloc_doc_idx on public.ar_payment_allocations (document_id);

-- ---------------------------------------------------------------------------
-- คำนวณยอดชำระและสถานะของเอกสารใหม่จากยอดตัดจริงเสมอ
-- ทำที่ฐานข้อมูลเพื่อให้ยอดไม่เพี้ยนไม่ว่าจะแก้จากหน้าจอไหน
-- ---------------------------------------------------------------------------
create or replace function public.recalc_ar_document_paid(p_document uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paid  decimal(14,2);
  v_total decimal(14,2);
  v_status varchar(20);
begin
  select coalesce(sum(a.amount), 0) into v_paid
    from public.ar_payment_allocations a where a.document_id = p_document;

  select grand_total, status into v_total, v_status
    from public.ar_documents where id = p_document;

  -- เอกสารที่ยกเลิกแล้วไม่ต้องขยับสถานะ
  if v_status = 'cancelled' then
    update public.ar_documents set paid_amount = v_paid where id = p_document;
    return;
  end if;

  update public.ar_documents
     set paid_amount = v_paid,
         status = case
           when v_total > 0 and v_paid >= v_total then 'paid'
           when v_paid > 0                        then 'partial'
           -- ไม่มียอดตัดแล้ว: ถอยกลับเป็น "ออกแล้ว" ถ้าเคยออกเลขที่
           when doc_no is not null                then 'issued'
           else 'draft'
         end
   where id = p_document;
end $$;

create or replace function public.ar_allocation_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_ar_document_paid(old.document_id);
    return old;
  end if;
  perform public.recalc_ar_document_paid(new.document_id);
  if tg_op = 'UPDATE' and new.document_id <> old.document_id then
    perform public.recalc_ar_document_paid(old.document_id);
  end if;
  return new;
end $$;

drop trigger if exists ar_allocation_recalc on public.ar_payment_allocations;
create trigger ar_allocation_recalc
  after insert or update or delete on public.ar_payment_allocations
  for each row execute function public.ar_allocation_changed();

-- ---------------------------------------------------------------------------
-- RLS — แบบเดียวกับตารางบัญชีอื่น
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ar_payments','ar_payment_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_acct_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_acct_write" on public.%I', t, t);
    execute format(
      'create policy "%s_acct_read" on public.%I for select to authenticated using (true)', t, t);
    execute format(
      'create policy "%s_acct_write" on public.%I for all to authenticated '
      'using (public.is_accounting_user()) with check (public.is_accounting_user())', t, t);
  end loop;
end $$;

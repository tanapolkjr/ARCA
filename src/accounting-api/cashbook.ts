import { supabase } from '../lib/supabaseClient.js';
import { round2 } from '@/accounting-lib/calc';
import type { CashCategory, CashEntry, Wallet } from '@/accounting-lib/types';

// ------------------------------------------------------------ กระเป๋าเงิน

export async function listWallets(activeOnly = true): Promise<Wallet[]> {
  let q = supabase.from('wallets').select('*').order('sort_order').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Wallet[];
}

/** สร้างกระเป๋าใหม่ — การแก้ไขต้องไปทาง updateWallet เพราะมีรหัสล็อกอยู่ */
export async function createWallet(payload: Partial<Wallet>) {
  const { data, error } = await supabase.from('wallets').insert(payload).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export interface WalletPatch {
  name: string;
  wallet_type: Wallet['wallet_type'];
  bank_name: string | null;
  account_no: string | null;
  opening_balance: number;
  is_active: boolean;
}

/**
 * แก้ไขกระเป๋าเงิน
 *
 * ผ่านฟังก์ชันฝั่งฐานข้อมูลที่ตรวจรหัสให้ก่อนเสมอ — แก้ตารางตรงๆ ไม่ได้แล้ว
 * (policy update ถูกถอดออกใน migration 0024) รหัสจึงกันได้จริง ไม่ใช่แค่ซ่อนปุ่ม
 */
export async function updateWallet(id: string, pin: string, patch: WalletPatch) {
  const { error } = await supabase.rpc('update_wallet_secure', {
    p_wallet: id,
    p_pin: pin || '',
    p_name: patch.name,
    p_wallet_type: patch.wallet_type,
    p_bank_name: patch.bank_name,
    p_account_no: patch.account_no,
    p_opening_balance: patch.opening_balance,
    p_is_active: patch.is_active,
  });
  if (error) throw new Error(error.message);
}

export async function deleteWallet(id: string, pin: string) {
  const { error } = await supabase.rpc('delete_wallet_secure', { p_wallet: id, p_pin: pin || '' });
  if (error) throw new Error(error.message);
}

/** กระเป๋านี้ล็อกรหัสไว้ไหม — ใช้ตัดสินว่าหน้าจอต้องถามรหัส */
export async function walletHasPin(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('wallet_has_pin', { p_wallet: id });
  if (error) throw error;
  return Boolean(data);
}

export async function setWalletPin(id: string, newPin: string, oldPin?: string) {
  const { error } = await supabase.rpc('set_wallet_pin', {
    p_wallet: id, p_new_pin: newPin, p_old_pin: oldPin ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function clearWalletPin(id: string, pin: string) {
  const { error } = await supabase.rpc('clear_wallet_pin', { p_wallet: id, p_pin: pin });
  if (error) throw new Error(error.message);
}

export interface WalletAudit {
  id: string; action: string; detail: string | null; changed_at: string;
  user?: { name: string } | null;
}

export async function walletAudit(walletId: string): Promise<WalletAudit[]> {
  const { data, error } = await supabase
    .from('wallet_audit')
    .select('id, action, detail, changed_at, user:users(name)')
    .eq('wallet_id', walletId).order('changed_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as WalletAudit[];
}

export async function listCashCategories(): Promise<CashCategory[]> {
  const { data, error } = await supabase
    .from('cash_categories').select('*').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []) as CashCategory[];
}

export async function saveCashCategory(payload: Partial<CashCategory> & { id?: string }) {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('cash_categories').update(rest).eq('id', id)
    : supabase.from('cash_categories').insert(rest);
  const { error } = await q;
  if (error) throw error;
}

// ------------------------------------------------------------- รายการ

const ENTRY_SELECT = `
  *,
  wallet:wallets!cash_entries_wallet_id_fkey(id, name),
  to_wallet:wallets!cash_entries_to_wallet_id_fkey(id, name),
  category:cash_categories(id, name, direction),
  project:projects(id, project_number, product_category),
  vendor:vendors(id, display_name)
`;

export interface CashEntryFull extends CashEntry {
  wallet?: { id: string; name: string } | null;
  to_wallet?: { id: string; name: string } | null;
  category?: { id: string; name: string; direction: string } | null;
  project?: { id: string; project_number: string; product_category: string | null } | null;
  vendor?: { id: string; display_name: string } | null;
}

export interface EntryFilter {
  from?: string;
  to?: string;
  walletId?: string;
  categoryId?: string;
  entryType?: 'in' | 'out' | 'transfer';
  search?: string;
}

export async function listCashEntries(f: EntryFilter = {}): Promise<CashEntryFull[]> {
  let q = supabase.from('cash_entries').select(ENTRY_SELECT)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  if (f.walletId) q = q.or(`wallet_id.eq.${f.walletId},to_wallet_id.eq.${f.walletId}`);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.entryType) q = q.eq('entry_type', f.entryType);
  if (f.search?.trim()) q = q.ilike('description', `%${f.search.trim()}%`);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as CashEntryFull[];
}

/** ช่องที่มาจาก join — ต้องตัดทิ้งก่อน update ไม่งั้น Postgres ปฏิเสธทั้งคำสั่ง */
const JOINED_FIELDS = [
  'wallet', 'to_wallet', 'category', 'project', 'vendor', 'created_at', 'updated_at',
] as const;

export async function saveCashEntry(
  payload: Partial<CashEntry> & { id?: string }, userId: string
) {
  const { id, ...raw } = payload;
  const rest = { ...raw } as Record<string, unknown>;
  for (const f of JOINED_FIELDS) delete rest[f];
  // ย้ายโอนไม่มีหมวดหมู่และไม่มี VAT — เงินไม่ได้ออกจากบริษัท แค่ย้ายกระเป๋า
  if (rest.entry_type === 'transfer') {
    rest.category_id = null;
    rest.has_vat = false;
    rest.vat_amount = 0;
    rest.wht_type = 'none';
    rest.wht_amount = 0;
    rest.wht_cert_no = null;
  } else {
    rest.to_wallet_id = null;
    if (!rest.has_vat) rest.vat_amount = 0;
    if (rest.wht_type === 'none') { rest.wht_amount = 0; rest.wht_cert_no = null; }
  }
  const q = id
    ? supabase.from('cash_entries').update(rest).eq('id', id)
    : supabase.from('cash_entries').insert({ ...rest, created_by: userId });
  const { error } = await q;
  if (error) throw error;
}

export interface EntryLinks {
  /** มาจากการรับชำระเงินของเอกสารขาย */
  paymentDocNo: string | null;
}

/** รายการนี้ผูกกับอะไรอยู่ — ใช้เตือนก่อนลบ */
export async function cashEntryLinks(id: string): Promise<EntryLinks> {
  const { data, error } = await supabase
    .from('cash_entries')
    .select('ar_document:ar_documents(doc_no)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  const doc = (data as unknown as { ar_document?: { doc_no: string | null } } | null)?.ar_document;
  return { paymentDocNo: doc?.doc_no ?? null };
}

export async function deleteCashEntry(id: string) {
  const { error } = await supabase.from('cash_entries').delete().eq('id', id);
  if (error) throw error;
}

/** ทำซ้ำรายการเดิม สำหรับค่าใช้จ่ายประจำที่คีย์ทุกเดือน */
export async function duplicateCashEntry(entry: CashEntry, userId: string) {
  const { error } = await supabase.from('cash_entries').insert({
    company_id: entry.company_id,
    entry_date: new Date().toISOString().slice(0, 10),
    entry_type: entry.entry_type,
    wallet_id: entry.wallet_id,
    to_wallet_id: entry.to_wallet_id,
    description: entry.description,
    amount: entry.amount,
    has_vat: entry.has_vat,
    vat_amount: entry.vat_amount,
    category_id: entry.category_id,
    wht_type: entry.wht_type,
    wht_amount: entry.wht_amount,
    project_id: entry.project_id,
    vendor_id: entry.vendor_id,
    created_by: userId,
  });
  if (error) throw error;
}

// ------------------------------------------------------------- สรุปยอด

export interface WalletBalance {
  wallet: Wallet;
  balance: number;
}

/**
 * ยอดคงเหลือแต่ละกระเป๋า = ยอดยกมา + รับ − จ่าย + โอนเข้า − โอนออก
 * คิดจากรายการทั้งหมด ไม่ตัดตามช่วงวันที่ เพราะยอดคงเหลือคือยอดสะสม
 */
export async function walletBalances(): Promise<WalletBalance[]> {
  const wallets = await listWallets();
  const { data, error } = await supabase
    .from('cash_entries').select('entry_type, wallet_id, to_wallet_id, amount');
  if (error) throw error;

  const byId = new Map(wallets.map((w) => [w.id, Number(w.opening_balance) || 0]));
  for (const e of data ?? []) {
    const amt = Number(e.amount) || 0;
    if (e.entry_type === 'in') {
      byId.set(e.wallet_id, (byId.get(e.wallet_id) ?? 0) + amt);
    } else if (e.entry_type === 'out') {
      byId.set(e.wallet_id, (byId.get(e.wallet_id) ?? 0) - amt);
    } else {
      byId.set(e.wallet_id, (byId.get(e.wallet_id) ?? 0) - amt);
      if (e.to_wallet_id) byId.set(e.to_wallet_id, (byId.get(e.to_wallet_id) ?? 0) + amt);
    }
  }
  return wallets.map((w) => ({ wallet: w, balance: round2(byId.get(w.id) ?? 0) }));
}

export interface MonthSummary {
  month: string;          // YYYY-MM
  income: number;
  expense: number;
  net: number;
  byCategory: { name: string; direction: string; amount: number }[];
}

/**
 * สรุปรายเดือนสำหรับประเมินรายได้
 * ย้ายโอนไม่นับเป็นรายรับหรือรายจ่าย — เงินยังอยู่ในบริษัท
 */
export async function monthlySummary(from: string, to: string): Promise<MonthSummary[]> {
  const { data, error } = await supabase
    .from('cash_entries')
    .select('entry_date, entry_type, amount, category:cash_categories(name, direction)')
    .gte('entry_date', from).lte('entry_date', to)
    .neq('entry_type', 'transfer');
  if (error) throw error;

  const months = new Map<string, MonthSummary>();
  for (const row of (data ?? []) as unknown as {
    entry_date: string; entry_type: 'in' | 'out'; amount: number;
    category: { name: string; direction: string } | null;
  }[]) {
    const key = row.entry_date.slice(0, 7);
    if (!months.has(key)) {
      months.set(key, { month: key, income: 0, expense: 0, net: 0, byCategory: [] });
    }
    const m = months.get(key)!;
    const amt = Number(row.amount) || 0;
    if (row.entry_type === 'in') m.income += amt;
    else m.expense += amt;

    const label = row.category?.name ?? 'ไม่ระบุหมวดหมู่';
    const found = m.byCategory.find((c) => c.name === label);
    if (found) found.amount += amt;
    else m.byCategory.push({ name: label, direction: row.category?.direction ?? row.entry_type, amount: amt });
  }

  return [...months.values()]
    .map((m) => ({
      ...m,
      income: round2(m.income),
      expense: round2(m.expense),
      net: round2(m.income - m.expense),
      byCategory: m.byCategory
        .map((c) => ({ ...c, amount: round2(c.amount) }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

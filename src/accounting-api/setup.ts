import { supabase } from '../lib/supabaseClient.js';
import type { BankAccount, Company, Vendor } from '@/accounting-lib/types';

// --------------------------------------------------------------------- บริษัท

export async function listCompanies(activeOnly = false): Promise<Company[]> {
  let q = supabase.from('companies').select('*').order('is_default', { ascending: false }).order('name_th');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Company[];
}

export async function getDefaultCompany(): Promise<Company | null> {
  const list = await listCompanies(true);
  return list.find((c) => c.is_default) ?? list[0] ?? null;
}

export async function saveCompany(payload: Partial<Company> & { id?: string }): Promise<Company> {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('companies').update(rest).eq('id', id)
    : supabase.from('companies').insert(rest);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as Company;
}

/** มีบริษัทตั้งต้นได้ตัวเดียว — ปลดของเดิมก่อนตั้งตัวใหม่ */
export async function setDefaultCompany(id: string): Promise<void> {
  const { error: clear } = await supabase
    .from('companies').update({ is_default: false }).neq('id', id);
  if (clear) throw clear;
  const { error } = await supabase.from('companies').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------ บัญชีธนาคาร

export async function listBankAccounts(companyId: string): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('company_bank_accounts').select('*')
    .eq('company_id', companyId).order('sort_order');
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

export async function saveBankAccount(payload: Partial<BankAccount> & { id?: string }) {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('company_bank_accounts').update(rest).eq('id', id)
    : supabase.from('company_bank_accounts').insert(rest);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteBankAccount(id: string) {
  const { error } = await supabase.from('company_bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------- แม่แบบข้อความ

export interface DocTemplate {
  id: string;
  company_id: string | null;
  name: string;
  kind: 'note' | 'terms';
  doc_types: string[];
  body: string;
  is_default: boolean;
  sort_order: number;
}

export async function listTemplates(kind?: 'note' | 'terms'): Promise<DocTemplate[]> {
  let q = supabase.from('document_templates').select('*').order('sort_order');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocTemplate[];
}

export async function saveTemplate(payload: Partial<DocTemplate> & { id?: string }) {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('document_templates').update(rest).eq('id', id)
    : supabase.from('document_templates').insert(rest);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('document_templates').delete().eq('id', id);
  if (error) throw error;
}

// -------------------------------------------------- หมวดหมู่สินค้ากลาง

export interface ProductCategory {
  id: string; name: string; kind: string; sort_order: number; is_active: boolean;
}

export async function listProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('product_categories').select('*').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []) as ProductCategory[];
}

// ------------------------------------------------------------- ผู้ขาย

export async function listVendors(search = ''): Promise<Vendor[]> {
  let q = supabase.from('vendors').select('*').order('display_name');
  if (search.trim()) q = q.ilike('display_name', `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Vendor[];
}

export async function saveVendor(payload: Partial<Vendor> & { id?: string }): Promise<Vendor> {
  const { id, ...rest } = payload;
  const q = id
    ? supabase.from('vendors').update(rest).eq('id', id)
    : supabase.from('vendors').insert(rest);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as Vendor;
}

export async function deleteVendor(id: string) {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

/**
 * ตั้งเลขเอกสารเริ่มต้นให้ต่อจากระบบเดิม (เรียกครั้งเดียวตอนย้ายจาก FlowAccount)
 * ถ้าใบล่าสุดคือ QT202608040006 → seed(companyId, 'QT', 'QT', '2026-08-04', 6)
 */
export async function seedDocumentSequence(
  companyId: string, docType: string, prefix: string, date: string, lastNumber: number
) {
  const { error } = await supabase.rpc('seed_document_sequence', {
    p_company: companyId, p_doc_type: docType, p_prefix: prefix,
    p_date: date, p_last: lastNumber,
  });
  if (error) throw error;
}

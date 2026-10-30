/**
 * ผู้อนุมัติเอกสารทางบัญชี (0037)
 *
 * ใบเสนอราคาใช้ลายเซ็นเซลล์ในใบ · เอกสารอื่นทั้งหมด (ใบแจ้งหนี้ ใบกำกับ ใบเสร็จ
 * ใบสั่งซื้อ ฯลฯ) ใช้ลายเซ็นผู้อนุมัติจากรายชื่อนี้
 * ชื่อ ตำแหน่ง และลายเซ็นถูกล็อกกับเอกสารตอนออก (trigger ฝั่งฐานข้อมูล)
 */
import { supabase } from '../lib/supabaseClient.js';

export interface DocumentApprover {
  id: string;
  name: string;
  position: string | null;
  signature_path: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export async function listApprovers(activeOnly = false): Promise<DocumentApprover[]> {
  let q = supabase.from('document_approvers').select('*')
    .order('is_default', { ascending: false }).order('sort_order').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocumentApprover[];
}

export async function saveApprover(input: {
  id?: string; name: string; position?: string | null; is_default?: boolean; is_active?: boolean;
}, userId?: string): Promise<string> {
  const row = {
    name: input.name.trim(),
    position: input.position?.trim() || null,
    is_default: Boolean(input.is_default),
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { error } = await supabase.from('document_approvers').update(row).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('document_approvers')
    .insert({ ...row, created_by: userId ?? null }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** ไฟล์ใหม่ทุกครั้ง ไม่เขียนทับ — ใบที่ออกไปแล้วยังอ้างไฟล์เดิม */
export async function uploadApproverSignature(approverId: string, png: Blob): Promise<string> {
  const path = `approvers/${approverId}/${Date.now()}.png`;
  const { error } = await supabase.storage.from('signatures')
    .upload(path, png, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  const { error: uErr } = await supabase.from('document_approvers')
    .update({ signature_path: path, signature_updated_at: new Date().toISOString() })
    .eq('id', approverId);
  if (uErr) throw uErr;
  return path;
}

export async function clearApproverSignature(approverId: string) {
  const { error } = await supabase.from('document_approvers')
    .update({ signature_path: null, signature_updated_at: new Date().toISOString() })
    .eq('id', approverId);
  if (error) throw error;
}

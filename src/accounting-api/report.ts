/**
 * ดึงข้อมูลสำหรับ Module Report แล้วส่งให้ accounting-lib/report.ts คำนวณ
 *
 * บริษัทเล็ก เอกสารหลักร้อย–พันใบ → ดึงทั้งหมดครั้งเดียวแล้วคำนวณฝั่งหน้าจอ
 * เปลี่ยนช่วงเวลาได้ทันทีโดยไม่ต้องยิงฐานข้อมูลใหม่
 */
import { supabase } from '../lib/supabaseClient.js';
import type { RAlloc, RDoc, RItem, RSource } from '@/accounting-lib/report';

export interface ReportData { docs: RDoc[]; items: RItem[]; allocs: RAlloc[]; sources: RSource[] }

/** ดึงเป็นหน้า ๆ — Supabase ส่งกลับสูงสุด 1,000 แถวต่อครั้ง */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadReportData(): Promise<ReportData> {
  type DocRow = Omit<RDoc, 'customer_name'> & {
    customer_snapshot: { name?: string } | null;
    customer: { display_name: string | null } | null;
  };
  const docRows = await all<DocRow>((f, t) => supabase.from('ar_documents')
    .select(`id, doc_type, doc_no, doc_date, due_date, status, source_document_id, customer_id,
             job_name, grand_total, vat_amount, paid_amount, approved_at, lead_source_id,
             customer_snapshot, customer:customers(display_name)`)
    .not('status', 'in', '(draft,cancelled)')
    .order('doc_date').range(f, t) as unknown as PromiseLike<{ data: DocRow[] | null; error: unknown }>);

  const docs: RDoc[] = docRows.map((d) => ({
    ...d,
    grand_total: Number(d.grand_total) || 0,
    vat_amount: Number(d.vat_amount) || 0,
    paid_amount: Number(d.paid_amount) || 0,
    customer_name: d.customer?.display_name || d.customer_snapshot?.name || 'ไม่ระบุลูกค้า',
  }));

  const qtIds = docs.filter((d) => d.doc_type === 'QT').map((d) => d.id);
  type ItemRow = { document_id: string; line_total: number; description: string;
                   stock: { model_code: string | null; category: string | null } | null };
  const items: RItem[] = [];
  for (let i = 0; i < qtIds.length; i += 200) {
    const chunk = qtIds.slice(i, i + 200);
    const rows = await all<ItemRow>((f, t) => supabase.from('ar_document_items')
      .select('document_id, line_total, description, stock:stock_items(model_code, category)')
      .in('document_id', chunk).range(f, t) as unknown as PromiseLike<{ data: ItemRow[] | null; error: unknown }>);
    for (const r of rows) {
      items.push({
        document_id: r.document_id,
        line_total: Number(r.line_total) || 0,
        category: r.stock?.category ?? null,
        model: r.stock?.model_code || (r.description ?? '').split('\n')[0].trim() || 'ไม่ระบุ',
      });
    }
  }

  type AllocRow = { document_id: string; amount: number; payment: { payment_date: string } | null };
  const allocRows = await all<AllocRow>((f, t) => supabase.from('ar_payment_allocations')
    .select('document_id, amount, payment:ar_payments(payment_date)')
    .range(f, t) as unknown as PromiseLike<{ data: AllocRow[] | null; error: unknown }>);
  const allocs: RAlloc[] = allocRows
    .filter((a) => a.payment?.payment_date)
    .map((a) => ({ document_id: a.document_id, amount: Number(a.amount) || 0, payment_date: a.payment!.payment_date }));

  const { data: src, error: sErr } = await supabase.from('lead_sources').select('id, name');
  if (sErr) throw sErr;

  return { docs, items, allocs, sources: (src ?? []) as RSource[] };
}

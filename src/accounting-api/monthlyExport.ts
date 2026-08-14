import { supabase } from '../lib/supabaseClient.js';
import { docDate, round2 } from '@/accounting-lib/calc';

/**
 * ไฟล์ส่งสำนักงานบัญชีรายเดือน
 *
 * สำนักงานบัญชีคีย์มือ ไฟล์จึงทำเป็น Excel เล่มเดียวหลายชีต หัวคอลัมน์ภาษาไทย
 * อ่านแล้วคีย์ต่อได้ทันที ไม่ต้องแปลงรูปแบบ ไม่ผูกกับโปรแกรมบัญชียี่ห้อไหน
 */

export interface ExportWarning {
  kind: 'error' | 'warn';
  message: string;
}

export interface MonthlyExport {
  sheets: { name: string; rows: Record<string, unknown>[] }[];
  warnings: ExportWarning[];
  summary: { salesVat: number; purchaseVat: number; docCount: number };
}

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${month}-${String(last).padStart(2, '0')}` };
};

export async function buildMonthlyExport(
  companyId: string, month: string
): Promise<MonthlyExport> {
  const { from, to } = monthRange(month);
  const warnings: ExportWarning[] = [];

  // ---------------------------------------------------------------- ภาษีขาย
  const { data: sales, error: sErr } = await supabase
    .from('ar_documents')
    .select(`doc_no, doc_date, doc_type, status, job_name, customer_snapshot,
             vat_base, vat_exempt_base, vat_amount, grand_total, wht_amount,
             customer:customers(company_name, display_name, tax_id, branch_code)`)
    .eq('company_id', companyId)
    .in('doc_type', ['INV', 'RC', 'CN', 'DN'])
    .gte('doc_date', from).lte('doc_date', to)
    .order('doc_no');
  if (sErr) throw sErr;

  type SalesRow = {
    doc_no: string | null; doc_date: string; doc_type: string; status: string;
    job_name: string | null;
    customer_snapshot: { name?: string; tax_id?: string; branch_label?: string } | null;
    vat_base: number; vat_exempt_base: number; vat_amount: number;
    grand_total: number; wht_amount: number;
    customer: { company_name: string | null; display_name: string;
                tax_id: string | null; branch_code: string | null } | null;
  };

  const salesRows = ((sales ?? []) as unknown as SalesRow[]).map((d, i) => {
    const snap = d.customer_snapshot;
    const name = snap?.name || d.customer?.company_name || d.customer?.display_name || '';
    const taxId = snap?.tax_id || d.customer?.tax_id || '';
    if (d.status !== 'cancelled' && !taxId) {
      warnings.push({
        kind: 'error',
        message: `${d.doc_no}: ลูกค้าไม่มีเลขประจำตัวผู้เสียภาษี — ใบกำกับใช้ขอคืนภาษีซื้อไม่ได้`,
      });
    }
    return {
      'ลำดับ': i + 1,
      'วันที่': docDate(d.doc_date),
      'เลขที่เอกสาร': d.doc_no ?? '',
      'ประเภท': d.doc_type,
      'ชื่อผู้ซื้อ': name,
      'เลขประจำตัวผู้เสียภาษี': taxId,
      'สาขา': snap?.branch_label || d.customer?.branch_code || '',
      'ชื่องาน': d.job_name ?? '',
      'มูลค่าที่คำนวณภาษี': round2(Number(d.vat_base) || 0),
      'มูลค่ายกเว้นภาษี': round2(Number(d.vat_exempt_base) || 0),
      'ภาษีมูลค่าเพิ่ม': round2(Number(d.vat_amount) || 0),
      'รวมทั้งสิ้น': round2(Number(d.grand_total) || 0),
      'สถานะ': d.status === 'cancelled' ? 'ยกเลิก' : '',
    };
  });

  // ตรวจเลขเอกสารขาดหาย — เลขที่ต้องเรียงต่อเนื่องตามกฎหมาย
  const issued = ((sales ?? []) as unknown as SalesRow[])
    .filter((d) => d.doc_no && d.doc_type === 'INV')
    .map((d) => Number(d.doc_no!.slice(-3)))
    .sort((a, b) => a - b);
  for (let i = 1; i < issued.length; i++) {
    if (issued[i] - issued[i - 1] > 1) {
      warnings.push({
        kind: 'warn',
        message: `เลขใบกำกับขาดช่วงระหว่างลำดับ ${issued[i - 1]} กับ ${issued[i]}`,
      });
    }
  }

  // ---------------------------------------------------------------- ภาษีซื้อ
  const { data: purchases, error: pErr } = await supabase
    .from('ap_documents')
    .select(`doc_no, doc_date, doc_type, status, vendor_doc_no, tax_invoice_received,
             vat_base, vat_amount, grand_total, wht_amount,
             vendor:vendors(display_name, tax_id, branch_code)`)
    .eq('company_id', companyId)
    .gte('doc_date', from).lte('doc_date', to)
    .order('doc_no');
  if (pErr) throw pErr;

  type PurchaseRow = {
    doc_no: string | null; doc_date: string; doc_type: string; status: string;
    vendor_doc_no: string | null; tax_invoice_received: boolean;
    vat_base: number; vat_amount: number; grand_total: number; wht_amount: number;
    vendor: { display_name: string; tax_id: string | null; branch_code: string | null } | null;
  };

  const purchaseRows = ((purchases ?? []) as unknown as PurchaseRow[]).map((d, i) => {
    if (!d.tax_invoice_received && Number(d.vat_amount) > 0) {
      warnings.push({
        kind: 'warn',
        message: `${d.doc_no}: ยังไม่ได้รับใบกำกับจากผู้ขาย — ขอคืน VAT ไม่ได้`,
      });
    }
    return {
      'ลำดับ': i + 1,
      'วันที่': docDate(d.doc_date),
      'เลขที่เอกสารเรา': d.doc_no ?? '',
      'เลขที่ใบกำกับผู้ขาย': d.vendor_doc_no ?? '',
      'ชื่อผู้ขาย': d.vendor?.display_name ?? '',
      'เลขประจำตัวผู้เสียภาษี': d.vendor?.tax_id ?? '',
      'สาขา': d.vendor?.branch_code ?? '',
      'มูลค่าที่คำนวณภาษี': round2(Number(d.vat_base) || 0),
      'ภาษีมูลค่าเพิ่ม': round2(Number(d.vat_amount) || 0),
      'รวมทั้งสิ้น': round2(Number(d.grand_total) || 0),
      'ได้รับใบกำกับแล้ว': d.tax_invoice_received ? 'ได้รับ' : 'ยังไม่ได้รับ',
      'สถานะ': d.status === 'cancelled' ? 'ยกเลิก' : '',
    };
  });

  // ------------------------------------------------- หัก ณ ที่จ่ายที่ถูกหัก
  const { data: whtIn, error: wErr } = await supabase
    .from('ar_payments')
    .select(`payment_date, wht_amount, wht_cert_no, amount_received,
             customer:customers(company_name, display_name, tax_id)`)
    .eq('company_id', companyId)
    .gt('wht_amount', 0)
    .gte('payment_date', from).lte('payment_date', to)
    .order('payment_date');
  if (wErr) throw wErr;

  const whtRows = ((whtIn ?? []) as unknown as {
    payment_date: string; wht_amount: number; wht_cert_no: string | null;
    amount_received: number;
    customer: { company_name: string | null; display_name: string; tax_id: string | null } | null;
  }[]).map((r, i) => {
    if (!r.wht_cert_no) {
      warnings.push({
        kind: 'warn',
        message: `รับเงินวันที่ ${docDate(r.payment_date)} มีหัก ณ ที่จ่ายแต่ไม่ได้คีย์เลขหนังสือรับรอง`,
      });
    }
    return {
      'ลำดับ': i + 1,
      'วันที่': docDate(r.payment_date),
      'ผู้หัก (ลูกค้า)': r.customer?.company_name || r.customer?.display_name || '',
      'เลขประจำตัวผู้เสียภาษี': r.customer?.tax_id ?? '',
      'เลขที่หนังสือรับรอง': r.wht_cert_no ?? '',
      'ยอดถูกหัก': round2(Number(r.wht_amount) || 0),
      'เงินเข้าจริง': round2(Number(r.amount_received) || 0),
    };
  });

  // --------------------------------------------------------- ลูกหนี้คงเหลือ
  const { data: ar, error: arErr } = await supabase
    .from('ar_documents')
    .select(`doc_no, doc_date, due_date, job_name, grand_total, paid_amount,
             customer:customers(company_name, display_name)`)
    .eq('company_id', companyId)
    .in('doc_type', ['BL', 'INV'])
    .neq('status', 'cancelled')
    .lte('doc_date', to)
    .order('doc_date');
  if (arErr) throw arErr;

  const asOf = new Date(to);
  const arRows = ((ar ?? []) as unknown as {
    doc_no: string | null; doc_date: string; due_date: string | null; job_name: string | null;
    grand_total: number; paid_amount: number;
    customer: { company_name: string | null; display_name: string } | null;
  }[])
    .map((d) => ({ ...d, outstanding: round2((Number(d.grand_total) || 0) - (Number(d.paid_amount) || 0)) }))
    .filter((d) => d.outstanding > 0.01)
    .map((d, i) => {
      const base = d.due_date ? new Date(d.due_date) : new Date(d.doc_date);
      const days = Math.max(0, Math.floor((asOf.getTime() - base.getTime()) / 86400000));
      const bucket = days <= 0 ? 'ยังไม่ถึงกำหนด'
        : days <= 30 ? '1-30 วัน' : days <= 60 ? '31-60 วัน'
        : days <= 90 ? '61-90 วัน' : 'เกิน 90 วัน';
      return {
        'ลำดับ': i + 1,
        'วันที่': docDate(d.doc_date),
        'เลขที่เอกสาร': d.doc_no ?? '',
        'ลูกค้า': d.customer?.company_name || d.customer?.display_name || '',
        'ชื่องาน': d.job_name ?? '',
        'ยอดเต็ม': round2(Number(d.grand_total) || 0),
        'ชำระแล้ว': round2(Number(d.paid_amount) || 0),
        'คงค้าง': d.outstanding,
        'ครบกำหนด': d.due_date ? docDate(d.due_date) : '',
        'อายุหนี้': bucket,
      };
    });

  // ------------------------------------------------------- รายรับ-รายจ่าย
  const { data: cash, error: cErr } = await supabase
    .from('cash_entries')
    .select(`entry_date, entry_type, description, amount, has_vat, vat_amount,
             wht_type, wht_amount, wht_cert_no,
             wallet:wallets!cash_entries_wallet_id_fkey(name),
             to_wallet:wallets!cash_entries_to_wallet_id_fkey(name),
             category:cash_categories(name)`)
    .eq('company_id', companyId)
    .gte('entry_date', from).lte('entry_date', to)
    .order('entry_date');
  if (cErr) throw cErr;

  const TYPE_TH: Record<string, string> = { in: 'รับ', out: 'จ่าย', transfer: 'ย้ายโอน' };
  const cashRows = ((cash ?? []) as unknown as {
    entry_date: string; entry_type: string; description: string; amount: number;
    has_vat: boolean; vat_amount: number; wht_type: string; wht_amount: number;
    wht_cert_no: string | null;
    wallet: { name: string } | null; to_wallet: { name: string } | null;
    category: { name: string } | null;
  }[]).map((e, i) => ({
    'ลำดับ': i + 1,
    'วันที่': docDate(e.entry_date),
    'ประเภท': TYPE_TH[e.entry_type] ?? e.entry_type,
    'รายละเอียด': e.description,
    'หมวดหมู่': e.category?.name ?? '',
    'กระเป๋าเงิน': e.wallet?.name ?? '',
    'โอนไปที่': e.to_wallet?.name ?? '',
    'จำนวนเงิน': round2(Number(e.amount) || 0),
    'มี VAT': e.has_vat ? 'มี' : '',
    'ยอด VAT': round2(Number(e.vat_amount) || 0),
    'หัก ณ ที่จ่าย': round2(Number(e.wht_amount) || 0),
    'เลขหนังสือรับรอง': e.wht_cert_no ?? '',
  }));

  const salesVat = salesRows.reduce((a, r) => a + (r['ภาษีมูลค่าเพิ่ม'] as number), 0);
  const purchaseVat = purchaseRows.reduce((a, r) => a + (r['ภาษีมูลค่าเพิ่ม'] as number), 0);

  return {
    sheets: [
      { name: 'รายงานภาษีขาย', rows: salesRows },
      { name: 'รายงานภาษีซื้อ', rows: purchaseRows },
      { name: 'หัก ณ ที่จ่าย-ถูกหัก', rows: whtRows },
      { name: 'ลูกหนี้คงเหลือ', rows: arRows },
      { name: 'รายรับ-รายจ่าย', rows: cashRows },
    ],
    warnings,
    summary: {
      salesVat: round2(salesVat),
      purchaseVat: round2(purchaseVat),
      docCount: salesRows.length,
    },
  };
}

/** สร้างไฟล์ .xlsx แล้วสั่งดาวน์โหลด — โหลด xlsx แบบ dynamic เพราะไฟล์ใหญ่ */
export async function downloadWorkbook(data: MonthlyExport, filename: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of data.sheets) {
    const ws = XLSX.utils.json_to_sheet(
      sheet.rows.length ? sheet.rows : [{ 'ไม่มีข้อมูลในเดือนนี้': '' }]
    );
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export type ArDocType = 'QT' | 'BL' | 'INV' | 'RC' | 'CN' | 'DN';
export type ApDocType = 'PO' | 'PI' | 'PV' | 'IM';
export type DocType = ArDocType | ApDocType;

export type ItemType = 'goods' | 'service';
export type VatType = 'vat' | 'exempt' | 'zero';

export interface Company {
  id: string;
  code: string | null;
  name_th: string;
  name_en: string | null;
  tax_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  address_th: string | null;
  address_en: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_path: string | null;
  signature_path: string | null;
  stamp_path: string | null;
  vat_rate: number;
  is_default: boolean;
  is_active: boolean;
}

export interface BankAccount {
  id: string;
  company_id: string;
  bank_name: string;
  branch: string | null;
  account_name: string | null;
  account_no: string;
  account_type: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Vendor {
  id: string;
  vendor_code: string | null;
  display_name: string;
  vendor_type: 'goods' | 'subcontractor' | 'service' | 'overseas';
  legal_entity_type: 'company' | 'individual';
  tax_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  wht_type: string;
  wht_rate: number;
  is_vat_registered: boolean;
  credit_term_days: number | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  notes: string | null;
  is_active: boolean;
}

/** ข้อมูลคู่ค้าที่แช่แข็งไว้ในเอกสาร ณ วันที่ออก */
export interface PartySnapshot {
  name: string;
  branch_label: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
}

export interface DocumentItem {
  id?: string;
  line_no: number;
  stock_item_id: string | null;
  description: string;
  item_type: ItemType;
  vat_type: VatType;
  qty: number;
  unit: string | null;
  unit_price: number;
  /** จำนวนเงินที่ลดจริง — ใช้คำนวณเสมอ */
  discount_amount: number;
  /** เก็บไว้ว่ากรอกมาเป็น % เท่าไร (null = กรอกเป็นบาท) */
  discount_percent?: number | null;
  /** อัตราหัก ณ ที่จ่ายของบรรทัดนี้ (%) — สินค้าปกติ 0 · ค่าบริการ 3 */
  wht_rate?: number;
  line_total: number;
}

export interface DocumentTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface ArDocument {
  id: string;
  company_id: string;
  doc_type: ArDocType;
  doc_no: string | null;
  doc_date: string;
  due_date: string | null;
  valid_until: string | null;
  status: string;
  source_document_id: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  customer_id: string | null;
  customer_snapshot: PartySnapshot | null;
  company_snapshot: PartySnapshot | null;
  project_id: string | null;
  ticket_id: string | null;
  job_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  sales_user_id: string | null;
  fulfilment_type: 'install' | 'delivery';
  tag_id: string | null;
  price_include_vat: boolean;
  vat_rate: number;
  contract_total: number | null;
  billing_percent: number | null;
  subtotal: number;
  discount_total: number;
  vat_base: number;
  vat_exempt_base: number;
  vat_amount: number;
  grand_total: number;
  wht_rate: number;
  wht_amount: number;
  net_payable: number;
  paid_amount: number;
  note_text: string | null;
  terms_text: string | null;
  pdf_path: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface CashEntry {
  id: string;
  company_id: string;
  entry_date: string;
  entry_type: 'in' | 'out' | 'transfer';
  wallet_id: string;
  to_wallet_id: string | null;
  description: string;
  amount: number;
  has_vat: boolean;
  vat_amount: number;
  category_id: string | null;
  wht_type: 'none' | 'withheld_from_us' | 'we_withhold';
  wht_amount: number;
  wht_cert_no: string | null;
  project_id: string | null;
  vendor_id: string | null;
  ar_document_id: string | null;
  ap_document_id: string | null;
  attachment_path: string | null;
  created_at: string;
}

export interface Wallet {
  id: string;
  company_id: string | null;
  name: string;
  wallet_type: 'bank' | 'cash' | 'promptpay' | 'credit_card';
  bank_name: string | null;
  account_no: string | null;
  opening_balance: number;
  sort_order: number;
  is_active: boolean;
}

export interface CashCategory {
  id: string;
  name: string;
  direction: 'in' | 'out' | 'both';
  sort_order: number;
  is_active: boolean;
}

export const AR_DOC_LABEL: Record<ArDocType, string> = {
  QT: 'ใบเสนอราคา',
  BL: 'ใบแจ้งหนี้',
  INV: 'ใบกำกับภาษี/ใบเสร็จรับเงิน',
  RC: 'ใบเสร็จรับเงิน',
  CN: 'ใบลดหนี้',
  DN: 'ใบเพิ่มหนี้',
};

export const AR_DOC_LABEL_EN: Record<ArDocType, string> = {
  QT: 'QUOTATION',
  BL: 'INVOICE',
  INV: 'TAX INVOICE / RECEIPT',
  RC: 'RECEIPT',
  CN: 'CREDIT NOTE',
  DN: 'DEBIT NOTE',
};

export const AP_DOC_LABEL: Record<ApDocType, string> = {
  PO: 'ใบสั่งซื้อ',
  PI: 'บันทึกซื้อ/ตั้งเจ้าหนี้',
  PV: 'ใบสำคัญจ่าย',
  IM: 'ใบขนสินค้าขาเข้า',
};

export const AP_DOC_LABEL_EN: Record<ApDocType, string> = {
  PO: 'PURCHASE ORDER',
  PI: 'PURCHASE INVOICE',
  PV: 'PAYMENT VOUCHER',
  IM: 'IMPORT ENTRY',
};

/** สีประจำประเภทเอกสาร — แถบมุมขวาบนและหัวข้อ */
export const DOC_COLOR: Record<string, string> = {
  QT: '#E8842B', BL: '#7C4DBE', INV: '#2F7FBF', RC: '#5C6B7A',
  CN: '#D2413A', DN: '#C2621C', PO: '#2E8A6B', PI: '#7C4DBE',
  PV: '#5C6B7A', IM: '#2F7FBF',
};

export const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  sent: 'ส่งลูกค้าแล้ว',
  accepted: 'ลูกค้าตอบรับ',
  rejected: 'ลูกค้าปฏิเสธ',
  expired: 'หมดอายุ',
  issued: 'ออกแล้ว',
  partial: 'ชำระบางส่วน',
  paid: 'ชำระครบ',
  ordered: 'สั่งแล้ว',
  received: 'รับของครบ',
  closed: 'ปิด',
  cancelled: 'ยกเลิก',
};

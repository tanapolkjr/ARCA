import { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate, money, round2 } from '@/accounting-lib/calc';
import { listWallets } from '@/accounting-api/cashbook';
import {
  deletePayment, listPaymentsForDocument, receivePayment,
} from '@/accounting-api/documents';
import type { ArPayment } from '@/accounting-api/documents';
import {
  Field, GhostButton, Modal, NumberInput, PrimaryButton, Select, TextArea, TextInput,
} from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * บันทึกรับชำระเงิน
 *
 * สมการที่ต้องลงเสมอ: ยอดที่ตัดหนี้ = เงินเข้าจริง + หัก ณ ที่จ่าย + ค่าธรรมเนียม
 * หน้าจอจึงให้กรอกยอดที่ตัด แล้วคำนวณเงินเข้าจริงให้ ไม่ให้กรอกทั้งคู่จนขัดกันเอง
 */
export function ReceivePaymentModal({
  documentId, companyId, customerId, docNo, outstanding, onClose, onSaved,
}: {
  documentId: string;
  companyId: string;
  customerId: string | null;
  docNo: string | null;
  outstanding: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const userId = useUserId();
  const walletsQ = useQuery(() => listWallets(), []);

  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<ArPayment['payment_method']>('transfer');
  const [walletId, setWalletId] = useState('');
  const [allocate, setAllocate] = useState(String(round2(outstanding)));
  const [wht, setWht] = useState('0');
  const [whtCert, setWhtCert] = useState('');
  const [fee, setFee] = useState('0');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [postCash, setPostCash] = useState(true);
  const [busy, setBusy] = useState(false);

  const alloc = Number(allocate) || 0;
  const whtN = Number(wht) || 0;
  const feeN = Number(fee) || 0;
  const cash = round2(Math.max(0, alloc - whtN - feeN));
  const remaining = round2(outstanding - alloc);

  return (
    <Modal title={`รับชำระเงิน — ${docNo ?? 'เอกสาร'}`} onClose={onClose} wide>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm flex justify-between">
        <span className="text-slate-500">ยอดค้างชำระ</span>
        <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
          {money(outstanding)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="วันที่รับเงิน" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="วิธีรับเงิน">
          <Select value={method} onChange={(e) => setMethod(e.target.value as ArPayment['payment_method'])}>
            <option value="transfer">โอนเงิน</option>
            <option value="cash">เงินสด</option>
            <option value="cheque">เช็ค</option>
            <option value="credit_card">บัตรเครดิต</option>
            <option value="other">อื่นๆ</option>
          </Select>
        </Field>
        <Field label="เข้ากระเป๋า" hint="ว่างไว้ได้ แล้วมาเติมทีหลัง">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">— ยังไม่ระบุ —</option>
            {walletsQ.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        <Field label="ยอดที่ตัดกับบิลนี้" required>
          <NumberInput value={allocate} step="0.01" onChange={(e) => setAllocate(e.target.value)} />
        </Field>
        <Field label="หัก ณ ที่จ่าย" hint="ลูกค้าหักไว้ ไม่ได้เข้าบัญชีเรา">
          <NumberInput value={wht} step="0.01" onChange={(e) => setWht(e.target.value)} />
        </Field>
        <Field label="ค่าธรรมเนียมธนาคาร">
          <NumberInput value={fee} step="0.01" onChange={(e) => setFee(e.target.value)} />
        </Field>

        {whtN > 0 && (
          <Field label="เลขที่หนังสือรับรองหัก ณ ที่จ่าย" className="md:col-span-2"
                 hint="ไม่คีย์ไว้ ปลายปีเอาไปเครดิตภาษีไม่ได้">
            <TextInput value={whtCert} onChange={(e) => setWhtCert(e.target.value)} />
          </Field>
        )}
        <Field label="เลขที่อ้างอิง / เลขที่เช็ค">
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" className="md:col-span-3">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 text-sm space-y-1">
        <Row k="เงินเข้าบัญชีจริง" v={cash} strong />
        <Row k="หัก ณ ที่จ่าย" v={whtN} />
        <Row k="ค่าธรรมเนียม" v={feeN} />
        <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
          <Row k="รวมยอดที่ตัดหนี้" v={alloc} strong />
        </div>
        <Row k="คงเหลือค้างชำระ" v={remaining} tone={remaining > 0 ? 'text-amber-600' : 'text-emerald-600'} />
      </div>

      {walletId && cash > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={postCash} onChange={(e) => setPostCash(e.target.checked)} />
          <WalletIcon className="w-4 h-4" /> บันทึกเงินเข้าในสมุดรายรับ-รายจ่ายด้วย
        </label>
      )}

      <div className="flex justify-end gap-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            if (alloc <= 0) { toast('ใส่ยอดที่ตัดกับบิลก่อน', 'error'); return; }
            if (alloc > outstanding + 0.01) {
              toast('ยอดที่ตัดมากกว่ายอดค้างชำระ', 'error'); return;
            }
            setBusy(true);
            try {
              await receivePayment({
                companyId, documentId, customerId, paymentDate: date, method,
                walletId: walletId || null, allocate: alloc, whtAmount: whtN,
                whtCertNo: whtCert || null, feeAmount: feeN,
                referenceNo: ref || null, note: note || null,
                postToCashBook: postCash,
              }, userId);
              toast('บันทึกรับชำระแล้ว');
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
            } finally { setBusy(false); }
          }}
        >
          บันทึกรับชำระ
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: number; strong?: boolean; tone?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{k}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${tone ?? 'text-slate-800 dark:text-slate-100'}`}>
        {money(v)}
      </span>
    </div>
  );
}

/** ประวัติการรับชำระของเอกสารหนึ่งใบ */
export function PaymentHistory({
  documentId, grandTotal, onChanged,
}: { documentId: string; grandTotal: number; onChanged: () => void }) {
  const { toast } = useToast();
  const q = useQuery(() => listPaymentsForDocument(documentId), [documentId]);

  const paid = useMemo(
    () => round2((q.data ?? []).reduce((a, p) => a + (p.allocations?.[0]?.amount ?? 0), 0)),
    [q.data]
  );
  if ((q.data?.length ?? 0) === 0) return null;

  return (
    <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
      dark:border-slate-800 p-4">
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">ประวัติการรับชำระ</h3>
        <span className="text-sm font-bold tabular-nums text-emerald-600">{money(paid)}</span>
        <span className="text-xs text-slate-400">
          จาก {money(grandTotal)} · คงเหลือ {money(Math.max(0, grandTotal - paid))}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {q.data?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 text-xs">
            <span className="w-20 text-slate-400 tabular-nums">{docDate(p.payment_date)}</span>
            <span className="tabular-nums font-medium">{money(p.allocations?.[0]?.amount ?? 0)}</span>
            {Number(p.wht_amount) > 0 && (
              <span className="text-slate-400">หัก ณ ที่จ่าย {money(p.wht_amount)}</span>
            )}
            <span className="text-slate-400">
              {p.wallet?.name ?? (
                <span className="text-amber-600 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> ยังไม่ระบุกระเป๋าเงิน
                </span>
              )}
            </span>
            {p.note && <span className="text-slate-400 truncate">{p.note}</span>}
            <button
              className="ml-auto text-slate-300 hover:text-rose-500"
              title="ลบรายการรับชำระนี้"
              onClick={async () => {
                try {
                  await deletePayment(p.id);
                  toast('ลบรายการรับชำระแล้ว');
                  void q.refetch();
                  onChanged();
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ยกเลิกเอกสาร — บังคับให้ระบุเหตุผล เพราะเป็นหลักฐานที่ต้องอธิบายได้ */
export function CancelDialog({
  docNo, onCancel, onConfirm,
}: { docNo: string | null; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  return (
    <Modal title={`ยกเลิกเอกสาร ${docNo ?? ''}`} onClose={onCancel}>
      <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
        dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
        เลขที่เอกสารจะยังอยู่ในระบบและนำกลับมาใช้ใหม่ไม่ได้ ตามที่กฎหมายกำหนด
        ถ้าเป็นใบเสร็จ/ใบกำกับ ยอดที่เคยตัดกับใบแจ้งหนี้จะถูกถอนคืน
        ทำให้ใบแจ้งหนี้กลับไปเป็นค้างชำระ
      </div>
      <Field label="เหตุผลที่ยกเลิก" required>
        <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น ออกผิดลูกค้า / ลูกค้าขอแก้รายการ" />
      </Field>
      <div className="flex justify-end gap-2">
        <GhostButton onClick={onCancel}>ไม่ยกเลิก</GhostButton>
        <button
          onClick={() => {
            if (!reason.trim()) { toast('ใส่เหตุผลก่อน', 'error'); return; }
            onConfirm(reason.trim());
          }}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700"
        >
          ยืนยันยกเลิกเอกสาร
        </button>
      </div>
    </Modal>
  );
}

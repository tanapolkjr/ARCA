/**
 * หน้าใบส่งของหนึ่งใบ — ดูตัวอย่าง พิมพ์ (ต้นฉบับ/สำเนา) และยกเลิก
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { cancelDelivery, deliveredUpTo, getDelivery } from '@/accounting-api/delivery';
import { DeliveryNotePrint } from './DeliveryNotePrint';
import { GhostButton, PrimaryButton } from './ui';

type Mode = 'original' | 'copy' | 'both';
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'original', label: 'ต้นฉบับ', hint: 'ให้ลูกค้าเซ็นรับ แล้วเก็บไว้กับลูกค้า' },
  { value: 'copy', label: 'สำเนา', hint: 'ให้ลูกค้าเซ็นแล้วเก็บกลับมาเป็นหลักฐานของบริษัท' },
  { value: 'both', label: 'ต้นฉบับ + สำเนา', hint: 'พิมพ์ชุดเดียว เซ็นทั้งสองใบตอนส่งของ' },
];
const LABEL: Record<Mode, string[]> = {
  original: ['ต้นฉบับ (ลูกค้า)'], copy: ['สำเนา (บริษัท)'], both: ['ต้นฉบับ (ลูกค้า)', 'สำเนา (บริษัท)'],
};

export function DeliveryNotePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('both');
  const q = useQuery(async () => {
    const dn = await getDelivery(id!);
    return { dn, delivered: await deliveredUpTo(dn) };
  }, [id]);

  if (q.error) return <div className="text-rose-600 text-sm">{String(q.error)}</div>;
  if (!q.data) return <div className="py-20 text-center text-stone-400">กำลังโหลด…</div>;
  const { dn, delivered } = q.data;

  function print() {
    const prev = document.title;
    document.title = `${dn.doc_no}${dn.job_name ? ` - ${dn.job_name.replace(/[\\/:*?"<>|]/g, ' ')}` : ''}`.slice(0, 90);
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  async function cancel() {
    const reason = window.prompt(`ยกเลิกใบส่งของ ${dn.doc_no}? ใส่เหตุผล (ยอดที่ส่งในใบนี้จะกลับไปเป็นค้างส่ง)`);
    if (reason == null) return;
    try { await cancelDelivery(dn.id, reason); toast('ยกเลิกใบส่งของแล้ว'); void q.refetch(); }
    catch (e) { toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error'); }
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="no-print flex items-center gap-3 flex-wrap">
        <Link to={`/accounting/QT/${dn.quotation_id}`} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="กลับไปใบเสนอราคา">
          <ArrowLeft className="w-4 h-4 text-stone-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">ใบส่งของ {dn.doc_no}</h1>
          <p className="text-xs text-stone-500">
            ส่งครั้งที่ {dn.delivery_seq} · อ้างอิง{' '}
            <Link to={`/accounting/QT/${dn.quotation_id}`} className="text-stone-900 dark:text-stone-100 hover:underline">{dn.quotation?.doc_no ?? 'ใบเสนอราคา'}</Link>
            {dn.status === 'cancelled' && <span className="ml-2 text-rose-600 font-medium">ยกเลิกแล้ว</span>}
          </p>
        </div>
        {dn.status === 'issued' && (
          <GhostButton onClick={() => void cancel()} className="ml-auto !text-rose-600 !border-rose-200">
            <Ban className="w-4 h-4" /> ยกเลิกใบส่งของ
          </GhostButton>
        )}
      </div>
      <div className="print-root flex flex-col items-center gap-6">
        {LABEL[mode].map((l) => <DeliveryNotePrint key={l} dn={dn} copyLabel={l} deliveredTotal={delivered} />)}
        <div className="no-print flex flex-col items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800">
            {MODES.map((m) => (
              <button key={m.value} onClick={() => setMode(m.value)} title={m.hint}
                      className={`px-3 py-1.5 rounded-lg text-sm ${mode === m.value
                        ? 'bg-white dark:bg-stone-900 font-medium shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-stone-400">{MODES.find((m) => m.value === mode)?.hint}</div>
          <PrimaryButton onClick={print}><Printer className="w-4 h-4" /> พิมพ์ / บันทึกเป็น PDF</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

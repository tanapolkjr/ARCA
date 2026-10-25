/**
 * ใบส่งของจากหน้าใบเสนอราคา — ดูใบที่ออกไปแล้ว + ออกใบใหม่
 * จำนวนตั้งต้น = ค้างส่ง · ห้ามส่งเกินที่ค้าง (ตรวจซ้ำที่ API ตอนบันทึก)
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Truck } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate } from '@/accounting-lib/calc';
import { validateDelivery } from '@/accounting-lib/delivery';
import { createDelivery, listDeliveries, loadDeliveryDraft } from '@/accounting-api/delivery';
import { Field, Modal, NumberInput, PrimaryButton, Select, TextArea, TextInput } from './ui';

const METHODS = ['รถบริษัท', 'ขนส่งเอกชน', 'ไปรษณีย์ / พัสดุ', 'ลูกค้ารับเอง'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function DeliveryPanel({
  qtId, userId, coordinator, onClose,
}: {
  qtId: string; userId: string;
  coordinator: { name: string | null; phone: string | null };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const nav = useNavigate();
  const listQ = useQuery(() => listDeliveries(qtId), [qtId]);
  const draftQ = useQuery(() => loadDeliveryDraft(qtId), [qtId]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [f, setF] = useState({
    docDate: today(), shipToName: '', shipToAddress: '', receiverName: '', receiverPhone: '',
    shipMethod: METHODS[0], vehicleNo: '', trackingNo: '', packageCount: '', note: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const plan = draftQ.data?.plan ?? [];
  const anyRemaining = plan.some((p) => p.remaining > 0);

  function startCreate() {
    const d = draftQ.data;
    if (!d) return;
    setQty(new Map(d.plan.map((p) => [p.id, p.remaining])));
    setF((p) => ({
      ...p,
      shipToName: d.qt.job_name ?? '',
      receiverName: d.qt.contact_name ?? '', receiverPhone: d.qt.contact_phone ?? '',
    }));
    setCreating(true);
  }

  const totalNow = useMemo(() => [...qty.values()].reduce((s, v) => s + (v || 0), 0), [qty]);

  async function save() {
    const err = validateDelivery(plan, qty);
    if (err) { toast(err, 'error'); return; }
    if (!f.shipToAddress.trim()) { toast('ใส่ที่อยู่จัดส่งก่อน', 'error'); return; }
    if (!f.receiverName.trim()) { toast('ใส่ชื่อผู้รับหน้างานก่อน', 'error'); return; }
    setBusy(true);
    try {
      const id = await createDelivery({
        qtId, ...f, coordinatorName: coordinator.name, coordinatorPhone: coordinator.phone,
        lines: plan.map((p) => ({ plan: p, qty: qty.get(p.id) ?? 0 })).filter((l) => l.qty > 0),
      }, userId);
      toast('ออกใบส่งของแล้ว');
      nav(`/accounting/delivery/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ออกใบส่งของไม่สำเร็จ', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal title="ใบส่งของ" onClose={onClose} wide>
      {(listQ.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-stone-500">ออกไปแล้ว</div>
          {listQ.data!.map((d) => (
            <button key={d.id} onClick={() => nav(`/accounting/delivery/${d.id}`)}
                    className="flex items-center gap-3 text-left text-sm px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-100 dark:border-stone-800">
              <span className="font-semibold tabular-nums">{d.doc_no}</span>
              <span className="text-stone-500">ครั้งที่ {d.delivery_seq} · {docDate(d.doc_date)}</span>
              {d.status === 'cancelled' && <span className="text-rose-600 text-xs">ยกเลิกแล้ว</span>}
              <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 ml-auto" />
            </button>
          ))}
        </div>
      )}

      {!creating && (
        <div className="flex flex-col items-start gap-2">
          {draftQ.loading && <p className="text-sm text-stone-400">กำลังโหลด…</p>}
          {draftQ.error && <p className="text-sm text-rose-600">{String(draftQ.error)}</p>}
          {draftQ.data && (anyRemaining ? (
            <PrimaryButton onClick={startCreate}><Truck className="w-4 h-4" /> ออกใบส่งของใหม่ (ครั้งที่ {draftQ.data.nextSeq})</PrimaryButton>
          ) : <p className="text-sm text-stone-500">ส่งครบทุกรายการแล้ว</p>)}
        </div>
      )}

      {creating && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs text-stone-500 text-left">
                  <th className="font-normal pb-2">รายการ</th>
                  <th className="font-normal pb-2 text-right w-20">สั่งซื้อ</th>
                  <th className="font-normal pb-2 text-right w-20">ส่งแล้ว</th>
                  <th className="font-normal pb-2 text-right w-20">ค้างส่ง</th>
                  <th className="font-normal pb-2 text-right w-28">ส่งครั้งนี้</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100 dark:border-stone-800">
                    <td className="py-2 pr-3">
                      <div className="font-medium truncate max-w-[340px]">{p.model_code ?? p.description.split('\n')[0]}</div>
                      {p.model_code && <div className="text-xs text-stone-500 truncate max-w-[340px]">{p.description.split('\n')[0]}</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.qty} {p.unit}</td>
                    <td className="py-2 text-right tabular-nums text-stone-500">{p.delivered}</td>
                    <td className="py-2 text-right tabular-nums">{p.remaining}</td>
                    <td className="py-2 pl-2">
                      <NumberInput value={qty.get(p.id) ?? 0} min={0} max={p.remaining} step="0.001"
                                   disabled={p.remaining <= 0} className="!text-right"
                                   onChange={(e) => setQty((m) => new Map(m).set(p.id, Math.max(0, Number(e.target.value) || 0)))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-xs text-stone-500 mt-1">รวมส่งครั้งนี้ {totalNow}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="วันที่ส่ง" required>
              <TextInput type="date" value={f.docDate} onChange={(e) => set('docDate', e.target.value)} />
            </Field>
            <Field label="ชื่อสถานที่จัดส่ง" hint="เช่น โครงการ / อาคาร / หน้างาน">
              <TextInput value={f.shipToName} onChange={(e) => set('shipToName', e.target.value)} />
            </Field>
            <Field label="ที่อยู่จัดส่ง" required className="md:col-span-2">
              <TextArea rows={2} value={f.shipToAddress} onChange={(e) => set('shipToAddress', e.target.value)} />
            </Field>
            <Field label="ผู้รับหน้างาน" required>
              <TextInput value={f.receiverName} onChange={(e) => set('receiverName', e.target.value)} />
            </Field>
            <Field label="เบอร์ผู้รับหน้างาน">
              <TextInput value={f.receiverPhone} onChange={(e) => set('receiverPhone', e.target.value)} />
            </Field>
            <Field label="วิธีจัดส่ง">
              <Select value={f.shipMethod} onChange={(e) => set('shipMethod', e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="ทะเบียนรถ / บริษัทขนส่ง">
              <TextInput value={f.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} />
            </Field>
            <Field label="เลขพัสดุ">
              <TextInput value={f.trackingNo} onChange={(e) => set('trackingNo', e.target.value)} />
            </Field>
            <Field label="จำนวนหีบห่อ" hint="เช่น 6 กล่อง">
              <TextInput value={f.packageCount} onChange={(e) => set('packageCount', e.target.value)} />
            </Field>
            <Field label="หมายเหตุเพิ่มเติม" className="md:col-span-2">
              <TextArea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-50">ยกเลิก</button>
            <PrimaryButton onClick={() => void save()} disabled={busy}>
              <Truck className="w-4 h-4" /> {busy ? 'กำลังบันทึก…' : 'ออกใบส่งของ'}
            </PrimaryButton>
          </div>
        </>
      )}
    </Modal>
  );
}

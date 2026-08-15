import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Boxes, PackageCheck, Plus, Search, Ship, Trash2, Truck,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate } from '@/accounting-lib/calc';
import { listVendors } from '@/accounting-api/setup';
import {
  cancelShipment, deleteShipment, getShipment, listShipments, receiveShipmentLine,
  saveShipment, SHIPMENT_STATUS_LABEL,
} from '@/stock-api/incoming';
import type { Shipment, ShipmentStatus } from '@/stock-api/incoming';
import { supabase } from '../../lib/supabaseClient.js';
import {
  Field, GhostButton, Modal, NumberInput, PrimaryButton, Select, TextArea, TextInput,
} from '../accounting/ui';

const STATUS_TONE: Record<ShipmentStatus, string> = {
  in_transit: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  received: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const today = () => new Date().toISOString().slice(0, 10);
const qtyText = (n: number) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 3 });

interface StockOption { id: string; model_code: string; description: string | null }

/**
 * On the way — สินค้าที่กำลังขนส่งเข้ามา
 *
 * ของที่ยังไม่ถึงไม่นับเป็น on_hand จนกว่าจะรับเข้าจริง
 * ตอนรับเข้าใช้ `receiveStock()` ตัวเดิม ไม่มีเส้นทางการรับเข้าที่สอง
 */
export function IncomingPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Shipment> | null>(null);
  const [receiving, setReceiving] = useState<Shipment | null>(null);
  const [cancelling, setCancelling] = useState<Shipment | null>(null);

  const q = useQuery(() => listShipments({ status, search }), [status, search]);

  const summary = useMemo(() => {
    let lots = 0, pieces = 0, late = 0;
    for (const s of q.data ?? []) {
      if (s.status === 'cancelled' || s.status === 'received') continue;
      lots += 1;
      pieces += (s.items ?? []).reduce(
        (a, i) => a + Math.max(0, Number(i.qty_ordered) - Number(i.qty_received)), 0);
      if (s.eta_date && s.eta_date < today()) late += 1;
    }
    return { lots, pieces, late };
  }, [q.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            On the way — สินค้ากำลังมา
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ของที่ยังไม่ถึงไม่นับเป็นยอดคงคลัง จนกว่าจะรับเข้าจริง
          </p>
        </div>
        <PrimaryButton className="ml-auto" onClick={() => setEditing({ items: [] })}>
          <Plus className="w-4 h-4" /> สร้างล็อตขนส่ง
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Ship className="w-4 h-4" />} label="ล็อตที่ยังไม่ถึง" value={`${summary.lots} ล็อต`} />
        <Stat icon={<Boxes className="w-4 h-4" />} label="จำนวนที่กำลังมา"
              value={`${qtyText(summary.pieces)} ชิ้น`} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="เลยกำหนดถึง"
              value={`${summary.late} ล็อต`}
              tone={summary.late > 0 ? 'text-rose-500' : undefined} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 p-4 flex flex-wrap items-end gap-3">
        <Field label="ค้นหา" className="flex-1 min-w-[220px]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput className="pl-9" placeholder="เลขล็อต / เลข order / เลขพัสดุ / หมายเหตุ…"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="สถานะ" className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}>
            <option value="">ทั้งหมด</option>
            <option value="in_transit">กำลังขนส่ง</option>
            <option value="partial">รับเข้าบางส่วน</option>
            <option value="received">รับเข้าครบแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        {q.loading && <p className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</p>}
        {!q.loading && (q.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-400 py-12 text-center">
            ยังไม่มีล็อตขนส่ง — กด “สร้างล็อตขนส่ง” เพื่อเริ่ม
          </p>
        )}
        {q.data?.map((s) => {
          const outstanding = (s.items ?? []).reduce(
            (a, i) => a + Math.max(0, Number(i.qty_ordered) - Number(i.qty_received)), 0);
          const overdue = Boolean(s.eta_date && s.eta_date < today()
            && (s.status === 'in_transit' || s.status === 'partial'));
          return (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border
              border-slate-100 dark:border-slate-800 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-900/30
                  flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4 text-sky-600 dark:text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {s.shipment_no}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium
                      ${STATUS_TONE[s.status]}`}>
                      {SHIPMENT_STATUS_LABEL[s.status]}
                    </span>
                    {overdue && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium
                        bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        เลยกำหนดถึงแล้ว
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {s.order_no && <span>Order: {s.order_no}</span>}
                    {s.vendor && <span>{s.vendor.display_name}</span>}
                    {s.carrier && <span>{s.carrier}</span>}
                    {s.tracking_no && <span>พัสดุ {s.tracking_no}</span>}
                    {s.eta_date && (
                      <span className={overdue ? 'text-rose-500 font-medium' : ''}>
                        คาดถึง {docDate(s.eta_date)}
                      </span>
                    )}
                    {s.arrived_date && <span>ถึงแล้ว {docDate(s.arrived_date)}</span>}
                    {s.project && <span>งาน {s.project.project_number}</span>}
                  </div>
                  {s.note && <p className="text-xs text-slate-400 mt-1">{s.note}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {outstanding > 0 && (
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">ยังไม่ได้รับ</div>
                      <div className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {qtyText(outstanding)}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    {(s.status === 'in_transit' || s.status === 'partial') && (
                      <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => setReceiving(s)}>
                        <PackageCheck className="w-3.5 h-3.5" /> รับเข้าคลัง
                      </GhostButton>
                    )}
                    {s.status === 'in_transit' && (
                      <>
                        <GhostButton className="!px-3 !py-1.5 text-xs"
                                     onClick={() => void getShipment(s.id).then(setEditing)}>
                          แก้ไข
                        </GhostButton>
                        <button title="ยกเลิกล็อต" onClick={() => setCancelling(s)}
                                className="p-1.5 text-slate-400 hover:text-rose-500">
                          <Ban className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {s.status === 'cancelled' && (
                      <button
                        title="ลบล็อตที่ยกเลิกแล้ว"
                        onClick={async () => {
                          try {
                            await deleteShipment(s.id);
                            toast('ลบล็อตแล้ว');
                            void q.refetch();
                          } catch (e) {
                            toast(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full text-xs mt-3">
                <thead className="text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left font-medium py-1.5">สินค้า</th>
                    <th className="text-right font-medium py-1.5 w-24">สั่ง</th>
                    <th className="text-right font-medium py-1.5 w-24">รับแล้ว</th>
                    <th className="text-right font-medium py-1.5 w-24">คงเหลือ</th>
                    <th className="text-left font-medium py-1.5 w-48 pl-4">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.items ?? []).map((i) => {
                    const left = Math.max(0, Number(i.qty_ordered) - Number(i.qty_received));
                    return (
                      <tr key={i.id} className="border-b border-slate-50 dark:border-slate-800/60">
                        <td className="py-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {i.stock_item?.model_code}
                          </span>
                          <span className="text-slate-400"> · {i.stock_item?.description}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{qtyText(i.qty_ordered)}</td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-600">
                          {qtyText(i.qty_received)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">
                          {left > 0 ? qtyText(left) : '—'}
                        </td>
                        <td className="py-1.5 pl-4 text-slate-400">{i.note ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {editing && (
        <ShipmentModal shipment={editing} onClose={() => setEditing(null)}
                       onSaved={() => { setEditing(null); void q.refetch(); }} />
      )}
      {receiving && (
        <ReceiveModal shipment={receiving} onClose={() => setReceiving(null)}
                      onReceived={() => { void q.refetch(); }} />
      )}
      {cancelling && (
        <Modal title={`ยกเลิกล็อต ${cancelling.shipment_no}`} onClose={() => setCancelling(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ยกเลิกได้เฉพาะล็อตที่ยังไม่มีของเข้าคลัง จำนวนที่ “กำลังมา” จะหายออกจากหน้า Inventory
          </p>
          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => setCancelling(null)}>ไม่ยกเลิก</GhostButton>
            <button
              onClick={async () => {
                try {
                  await cancelShipment(cancelling.id, '');
                  toast('ยกเลิกล็อตแล้ว');
                  setCancelling(null);
                  void q.refetch();
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700"
            >
              ยืนยันยกเลิก
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
      dark:border-slate-800 p-4">
      <div className="text-xs text-slate-500 flex items-center gap-1.5">{icon} {label}</div>
      <div className={`text-lg font-bold mt-1 ${tone ?? 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- สร้าง/แก้ล็อต

function ShipmentModal({ shipment, onClose, onSaved }: {
  shipment: Partial<Shipment>; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const userId = useUserId();
  const [f, setF] = useState({
    order_no: shipment.order_no ?? '',
    vendor_id: shipment.vendor_id ?? '',
    carrier: shipment.carrier ?? '',
    tracking_no: shipment.tracking_no ?? '',
    eta_date: shipment.eta_date ?? '',
    project_id: shipment.project_id ?? '',
    note: shipment.note ?? '',
  });
  const [lines, setLines] = useState<{ stock_item_id: string; qty_ordered: string; note: string }[]>(
    shipment.items?.length
      ? shipment.items.map((i) => ({
          stock_item_id: i.stock_item_id, qty_ordered: String(i.qty_ordered), note: i.note ?? '',
        }))
      : [{ stock_item_id: '', qty_ordered: '', note: '' }]
  );
  const [busy, setBusy] = useState(false);

  const vendorsQ = useQuery(() => listVendors(), []);
  const stockQ = useQuery<StockOption[]>(
    async () => ((await supabase.from('stock_items')
      .select('id, model_code, description').order('model_code').limit(1000)).data ?? []) as StockOption[],
    []);
  const projectsQ = useQuery(
    async () => (await supabase.from('projects')
      .select('id, project_number').order('project_number', { ascending: false }).limit(300)).data ?? [],
    []);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const patchLine = (i: number, patch: Partial<(typeof lines)[number]>) =>
    setLines((p) => p.map((l, x) => (x === i ? { ...l, ...patch } : l)));

  return (
    <Modal title={shipment.id ? `แก้ไขล็อต ${shipment.shipment_no}` : 'สร้างล็อตขนส่ง'}
           onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="เลขที่ order สั่งซื้อ" required hint="เลขที่สั่งกับผู้ขาย แยกตามล็อต">
          <TextInput value={f.order_no} onChange={(e) => set('order_no', e.target.value)} />
        </Field>
        <Field label="ผู้ขาย">
          <Select value={f.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {vendorsQ.data?.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </Select>
        </Field>
        <Field label="คาดว่าถึงวันที่" required>
          <TextInput type="date" value={f.eta_date} onChange={(e) => set('eta_date', e.target.value)} />
        </Field>

        <Field label="ขนส่งเจ้าไหน">
          <TextInput value={f.carrier} placeholder="เช่น เรือ / Kerry / ส่งเอง"
                     onChange={(e) => set('carrier', e.target.value)} />
        </Field>
        <Field label="เลขพัสดุ / เลขตู้">
          <TextInput value={f.tracking_no} onChange={(e) => set('tracking_no', e.target.value)} />
        </Field>
        <Field label="ของงานไหน (โปรเจกต์)">
          <Select value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {projectsQ.data?.map((p) => (
              <option key={p.id as string} value={p.id as string}>{p.project_number as string}</option>
            ))}
          </Select>
        </Field>

        <Field label="หมายเหตุ" className="md:col-span-3"
               hint="เช่น ของงาน Kata Bello รอบสำรอง 8 ตัว">
          <TextArea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
          รายการสินค้าในล็อต
        </h3>
        <div className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="สินค้า" className="flex-1 min-w-[240px]">
                <Select value={l.stock_item_id}
                        onChange={(e) => patchLine(i, { stock_item_id: e.target.value })}>
                  <option value="">— เลือกสินค้า —</option>
                  {stockQ.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.model_code}{s.description ? ` · ${s.description}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="จำนวน" className="w-28">
                <NumberInput value={l.qty_ordered} step="1"
                             onChange={(e) => patchLine(i, { qty_ordered: e.target.value })} />
              </Field>
              <Field label="หมายเหตุบรรทัด" className="w-48">
                <TextInput value={l.note} onChange={(e) => patchLine(i, { note: e.target.value })} />
              </Field>
              {lines.length > 1 && (
                <button onClick={() => setLines((p) => p.filter((_, x) => x !== i))}
                        className="p-2 text-slate-300 hover:text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <GhostButton className="mt-2"
          onClick={() => setLines((p) => [...p, { stock_item_id: '', qty_ordered: '', note: '' }])}>
          <Plus className="w-4 h-4" /> เพิ่มสินค้า
        </GhostButton>
      </div>

      <div className="flex justify-end gap-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            if (!f.order_no.trim()) { toast('ใส่เลขที่ order ก่อน', 'error'); return; }
            if (!f.eta_date) { toast('ใส่วันที่คาดว่าถึงก่อน', 'error'); return; }
            setBusy(true);
            try {
              await saveShipment({
                id: shipment.id,
                order_no: f.order_no, vendor_id: f.vendor_id || null,
                carrier: f.carrier || null, tracking_no: f.tracking_no || null,
                eta_date: f.eta_date, project_id: f.project_id || null, note: f.note || null,
                items: lines.map((l) => ({
                  stock_item_id: l.stock_item_id,
                  qty_ordered: Number(l.qty_ordered),
                  note: l.note || null,
                })),
              }, userId);
              toast('บันทึกล็อตแล้ว');
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
            } finally { setBusy(false); }
          }}
        >
          บันทึก
        </PrimaryButton>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- รับเข้าคลัง

function ReceiveModal({ shipment, onClose, onReceived }: {
  shipment: Shipment; onClose: () => void; onReceived: () => void;
}) {
  const { toast } = useToast();
  const userId = useUserId();
  const [current, setCurrent] = useState<Shipment>(shipment);
  const [lineId, setLineId] = useState(
    (shipment.items ?? []).find((i) => Number(i.qty_received) < Number(i.qty_ordered))?.id ?? '');
  const [locationId, setLocationId] = useState('');
  const [scans, setScans] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [busy, setBusy] = useState(false);

  const locationsQ = useQuery(
    async () => (await supabase.from('stock_locations').select('id, name').order('name')).data ?? [],
    []);

  const line = (current.items ?? []).find((i) => i.id === lineId);
  const outstanding = line ? Math.max(0, Number(line.qty_ordered) - Number(line.qty_received)) : 0;
  const willReceive = scans.length || Number(manualQty) || 0;

  const addScan = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    // ยิงซ้ำทำให้ยอดสต็อกเกินของจริง จึงกันตั้งแต่หน้าจอ (API กันอีกชั้น)
    if (scans.includes(v)) { toast(`ยิงซ้ำในรอบนี้: ${v}`, 'error'); return; }
    if (scans.length >= outstanding) {
      toast(`ยิงครบจำนวนที่เหลือแล้ว (${qtyText(outstanding)})`, 'error'); return;
    }
    setScans((p) => [...p, v]);
  };

  return (
    <Modal title={`รับเข้าคลัง — ${shipment.shipment_no}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="รายการที่จะรับ" required>
          <Select value={lineId}
                  onChange={(e) => { setLineId(e.target.value); setScans([]); setManualQty(''); }}>
            <option value="">— เลือกสินค้า —</option>
            {(current.items ?? []).map((i) => {
              const left = Math.max(0, Number(i.qty_ordered) - Number(i.qty_received));
              return (
                <option key={i.id} value={i.id} disabled={left <= 0}>
                  {i.stock_item?.model_code} — เหลือ {qtyText(left)}
                  {left <= 0 ? ' (รับครบแล้ว)' : ''}
                </option>
              );
            })}
          </Select>
        </Field>
        <Field label="รับเข้าคลังไหน" required>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— เลือกคลัง —</option>
            {locationsQ.data?.map((l) => (
              <option key={l.id as string} value={l.id as string}>{l.name as string}</option>
            ))}
          </Select>
        </Field>
      </div>

      {line && (
        <>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm flex justify-between">
            <span className="text-slate-500">{line.stock_item?.model_code} · ยังไม่ได้รับ</span>
            <span className="font-bold tabular-nums">{qtyText(outstanding)}</span>
          </div>

          <Field label="ยิงบาร์โค้ด / สแกน serial"
                 hint="ยิงทีละชิ้น ระบบนับให้เอง · สินค้าที่ไม่ต้องยิงให้ข้ามไปใส่จำนวนข้างล่าง">
            <TextInput
              autoFocus value={scanInput}
              placeholder="ยิงบาร์โค้ดที่นี่ แล้วกด Enter"
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addScan(scanInput);
                setScanInput('');
              }}
            />
          </Field>

          {scans.length > 0 && (
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  ยิงแล้ว {scans.length} / {qtyText(outstanding)}
                </span>
                <button onClick={() => setScans([])}
                        className="ml-auto text-xs text-rose-500 hover:underline">
                  ล้างทั้งหมด
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {scans.map((sn) => (
                  <span key={sn} className="px-2 py-0.5 rounded-lg text-[11px]
                    bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
                    inline-flex items-center gap-1">
                    {sn}
                    <button onClick={() => setScans((p) => p.filter((x) => x !== sn))}
                            className="text-slate-400 hover:text-rose-500">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {scans.length === 0 && (
            <Field label="หรือใส่จำนวนที่รับ (สินค้าที่ไม่ต้องยิงบาร์โค้ด)" className="w-64">
              <NumberInput value={manualQty} step="1" placeholder={String(outstanding)}
                           onChange={(e) => setManualQty(e.target.value)} />
            </Field>
          )}
        </>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-slate-500 mr-auto">
          จะรับเข้าคลัง{' '}
          <strong className="tabular-nums text-slate-800 dark:text-slate-100">
            {qtyText(willReceive)}
          </strong>{' '}ชิ้น
        </span>
        <GhostButton onClick={onClose}>ปิด</GhostButton>
        <PrimaryButton
          disabled={busy || !line || !locationId || willReceive <= 0}
          onClick={async () => {
            if (!line?.id) return;
            setBusy(true);
            try {
              await receiveShipmentLine({
                shipmentId: current.id, lineId: line.id, locationId,
                serials: scans, qty: Number(manualQty) || 0,
              }, userId);
              toast(`รับเข้าคลัง ${qtyText(willReceive)} ชิ้นแล้ว`);
              setScans([]); setManualQty('');
              const fresh = await getShipment(current.id);
              setCurrent(fresh);
              setLineId((fresh.items ?? []).find(
                (i) => Number(i.qty_received) < Number(i.qty_ordered))?.id ?? '');
              onReceived();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'รับเข้าไม่สำเร็จ', 'error');
            } finally { setBusy(false); }
          }}
        >
          <PackageCheck className="w-4 h-4" /> รับเข้าคลัง
        </PrimaryButton>
      </div>
    </Modal>
  );
}

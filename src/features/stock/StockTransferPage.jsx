import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, Pill, Modal, Field, Select, TextInput, SearchSelect } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listTransfers, createTransfer, receiveTransfer, deleteTransfer, listLocations, listStockItems } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STOCK_ACTION_ROLES = ["Super Admin", "Manager", "Store"];

function NewTransferModal({ onClose, onCreated, locations, items }) {
  const { session } = useAuth();
  const toast = useToast();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState([{ stockItemId: "", label: "", qty: 1 }]);
  const [saving, setSaving] = useState(false);

  function updateLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    if (!fromId || !toId || fromId === toId) {
      toast.error("เลือกคลังต้นทาง/ปลายทางให้ครบและต้องไม่ใช่คลังเดียวกัน");
      return;
    }
    const cleanLines = lines
      .filter((l) => l.stockItemId)
      .map((l) => ({ stockItemId: l.stockItemId, qty: Math.max(1, Number(l.qty) || 1) }));
    if (cleanLines.length === 0) {
      toast.error("เลือกสินค้าที่จะย้ายอย่างน้อย 1 รายการ");
      return;
    }
    setSaving(true);
    try {
      const created = await createTransfer({
        fromLocationId: fromId,
        toLocationId: toId,
        items: cleanLines,
        requestedBy: session?.user?.id,
      });
      toast.success(`สร้างใบย้ายคลัง ${created.transfer_no} แล้ว — ตัดสต็อกออกจากคลังต้นทางเรียบร้อย`);
      onCreated();
    } catch (err) {
      toast.error("สร้างไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="สร้างใบย้ายคลังสินค้า" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="จากคลัง (From)" required>
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">— เลือกคลัง —</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="ไปคลัง (To)" required>
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">— เลือกคลัง —</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
      </div>

      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">รายการสินค้าที่ย้าย</p>
      <div className="space-y-2 mb-2">
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              <SearchSelect
                asyncSearch={(q) => {
                  const ql = q.toLowerCase();
                  return Promise.resolve(
                    (items || [])
                      .filter((i) => !ql || i.model_code?.toLowerCase().includes(ql) || i.description?.toLowerCase().includes(ql))
                      .slice(0, 50)
                      .map((i) => ({ label: `${i.model_code} — ${i.description || ""}`, id: i.id, raw: i }))
                  );
                }}
                value={line.label}
                onChange={(label, id) => updateLine(idx, { label, stockItemId: id || "" })}
                placeholder="พิมพ์ค้นหาสินค้า..."
              />
            </div>
            <div className="w-24">
              <TextInput type="number" min="1" value={line.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} placeholder="จำนวน" />
            </div>
            {lines.length > 1 && (
              <button onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => setLines((ls) => [...ls, { stockItemId: "", label: "", qty: 1 }])} className="text-sm font-medium text-slate-900 hover:text-slate-900 mb-4">+ เพิ่มสินค้าอีกรายการ</button>

      <p className="text-xs text-slate-400 mb-2">ระบบจะตัด On Hand ออกจากคลังต้นทางทันทีที่สร้างใบย้าย และเพิ่มเข้าคลังปลายทางเมื่อกด "ยืนยันรับของ"</p>
      <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
          {saving ? "กำลังสร้าง..." : "สร้างใบย้ายคลัง"}
        </button>
      </div>
    </Modal>
  );
}

export default function StockTransferPage() {
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const { data: transfers, loading, refetch } = useQuery(() => listTransfers(), []);
  const { data: locations } = useQuery(() => listLocations(), []);
  const { data: items } = useQuery(() => listStockItems(), []);
  const { session, profile } = useAuth();
  const toast = useToast();
  const canManage = STOCK_ACTION_ROLES.includes(profile?.role);

  async function handleReceive(id) {
    try {
      await receiveTransfer(id, session?.user?.id);
      toast.success("ยืนยันรับของแล้ว — เพิ่มสต็อกเข้าคลังปลายทางเรียบร้อย");
      refetch();
    } catch (err) {
      toast.error("ยืนยันไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(t) {
    const msg = t.status === "received"
      ? "ลบใบย้ายคลังนี้หรือไม่? (ยืนยันรับของไปแล้ว — จะลบเฉพาะประวัติ ไม่กระทบยอดสต็อก)"
      : "ลบใบย้ายคลังนี้หรือไม่? ระบบจะคืนสินค้าที่ตัดออกไปกลับเข้าคลังต้นทางให้อัตโนมัติ";
    if (!window.confirm(msg)) return;
    try {
      const { restoredToSource } = await deleteTransfer(t.id, session?.user?.id);
      toast.success(restoredToSource ? "ลบแล้ว — คืนสต็อกกลับคลังต้นทางเรียบร้อย" : "ลบแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5"><span>Stock</span><span>/</span><span className="text-slate-900 font-medium">ย้ายคลังสินค้า</span></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">ย้ายคลังสินค้า</h1>
        </div>
        <button onClick={() => setShowModal(true)} disabled={!canManage} title={!canManage ? "เฉพาะ Super Admin/Manager/Store" : ""} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> สร้างใบย้ายคลัง
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3"></th>
              <th className="text-left font-medium px-4 py-3">เลขที่</th>
              <th className="text-left font-medium px-4 py-3">จาก</th>
              <th className="text-left font-medium px-4 py-3">ไป</th>
              <th className="text-right font-medium px-4 py-3">รายการ</th>
              <th className="text-right font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={7} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && transfers?.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-10">ยังไม่มีใบย้ายคลัง</td></tr>}
            {transfers?.map((t) => (
              <React.Fragment key={t.id}>
                <tr className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-700/30" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  <td className="px-4 py-3 text-slate-400">
                    {expanded === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.transfer_no}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t.from_location?.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t.to_location?.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{t.items?.length ?? 0} รายการ</td>
                  <td className="px-4 py-3 text-right">
                    {t.status === "received" ? <Pill tone="green">ยืนยันรับแล้ว</Pill> : <Pill tone="amber">รอรับปลายทาง</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {t.status !== "received" && canManage && (
                        <button onClick={(e) => { e.stopPropagation(); handleReceive(t.id); }} className="text-xs font-medium text-slate-900 hover:underline">ยืนยันรับของ</button>
                      )}
                      {canManage && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(t); }} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/40">
                      {(t.items || []).length === 0 ? (
                        <p className="text-xs text-slate-400">ใบย้ายรุ่นเก่า (ก่อนอัปเดต) — ไม่มีรายการสินค้าบันทึกไว้ และไม่มีผลกับยอดสต็อก</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="text-slate-400">
                            <tr>
                              <th className="text-left font-medium py-1.5">Model</th>
                              <th className="text-left font-medium py-1.5">รายละเอียด</th>
                              <th className="text-right font-medium py-1.5">จำนวน</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {(t.items || []).map((it) => (
                              <tr key={it.id}>
                                <td className="py-2 text-slate-700 dark:text-slate-200">{it.item?.model_code}</td>
                                <td className="py-2 text-slate-500">{it.item?.description || "-"}</td>
                                <td className="py-2 text-right text-slate-600 dark:text-slate-300">{it.qty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <NewTransferModal
          locations={locations}
          items={items}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); refetch(); }}
        />
      )}
    </div>
  );
}

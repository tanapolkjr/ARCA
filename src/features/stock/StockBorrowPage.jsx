import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, Pill, Modal, Field, Select, TextInput, SearchSelect } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listBorrows, createBorrowJob, returnBorrowItem, deleteBorrow, listStockItems, listLocations } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STOCK_ACTION_ROLES = ["Super Admin", "Manager", "Store"];

function NewBorrowModal({ onClose, onCreated, items, locations }) {
  const toast = useToast();
  const { session } = useAuth();
  const [borrower, setBorrower] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState([{ stockItemId: "", label: "", qty: 1, serials: [""] }]);
  const [saving, setSaving] = useState(false);

  function updateLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      if ("qty" in patch) {
        const n = Math.max(1, Number(patch.qty) || 1);
        next.qty = n;
        next.serials = Array.from({ length: n }, (_, si) => l.serials[si] || "");
      }
      return next;
    }));
  }

  function addLine() {
    setLines((ls) => [...ls, { stockItemId: "", label: "", qty: 1, serials: [""] }]);
  }
  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!borrower.trim()) {
      toast.error("กรอกชื่อผู้ยืมก่อน");
      return;
    }
    if (!locationId) {
      toast.error("เลือกคลังที่จะเบิกยืมก่อน");
      return;
    }
    const cleanLines = lines
      .filter((l) => l.stockItemId)
      .map((l) => ({ stockItemId: l.stockItemId, serials: l.serials.map((s) => s.trim()).filter(Boolean) }))
      .filter((l) => l.serials.length > 0);

    if (cleanLines.length === 0) {
      toast.error("เลือกสินค้าและกรอก Serial อย่างน้อย 1 ชิ้น");
      return;
    }
    const allSerials = cleanLines.flatMap((l) => l.serials);
    const dupes = allSerials.filter((s, i) => allSerials.indexOf(s) !== i);
    if (dupes.length > 0) {
      toast.error(`มี Serial ซ้ำกันในรายการ: ${[...new Set(dupes)].join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      const created = await createBorrowJob({
        borrowerName: borrower, dueDate: dueDate || null, locationId, items: cleanLines, createdBy: session?.user?.id,
      });
      toast.success(`สร้างใบยืม ${created.borrow_no} แล้ว — ตัดสต็อกเรียบร้อย`);
      onCreated();
    } catch (err) {
      toast.error("สร้างไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="สร้างใบยืมสินค้า" onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="ผู้ยืม" required><TextInput value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="ชื่อลูกค้า/พนักงาน/ดีลเลอร์" /></Field>
        <Field label="คลังที่จะเบิก" required>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— เลือกคลัง —</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="กำหนดคืน"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>

      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">รายการสินค้าที่ยืม</p>
      <div className="space-y-3 mb-3">
        {lines.map((line, idx) => (
          <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
            <div className="flex items-start gap-2 mb-2">
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
              <div className="w-20">
                <TextInput type="number" min="1" value={line.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} />
              </div>
              {lines.length > 1 && (
                <button onClick={() => removeLine(idx)} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            {line.stockItemId && (
              <div className="grid grid-cols-2 gap-2">
                {line.serials.map((s, si) => (
                  <input
                    key={si}
                    value={s}
                    onChange={(e) => {
                      const next = [...line.serials];
                      next[si] = e.target.value;
                      updateLine(idx, { serials: next });
                    }}
                    placeholder={`Serial #${si + 1}`}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={addLine} className="text-sm font-medium text-slate-900 hover:text-slate-900 mb-4">+ เพิ่มสินค้าอีกรายการ</button>

      <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : "สร้างใบยืม"}
        </button>
      </div>
    </Modal>
  );
}

export default function StockBorrowPage() {
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const { data: borrows, loading, refetch } = useQuery(() => listBorrows(), []);
  const { data: items } = useQuery(() => listStockItems(), []);
  const { data: locations } = useQuery(() => listLocations(), []);
  const { profile, session } = useAuth();
  const toast = useToast();
  const canManage = STOCK_ACTION_ROLES.includes(profile?.role);

  async function handleReturnItem(borrowItemId) {
    try {
      await returnBorrowItem(borrowItemId, session?.user?.id);
      toast.success("บันทึกการคืนแล้ว — คืนสต็อกเรียบร้อย");
      refetch();
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("ลบใบยืมนี้หรือไม่? (ไม่ปรับสต็อกคืนอัตโนมัติ — ใช้สำหรับลบรายการที่สร้างผิดเท่านั้น)")) return;
    try {
      await deleteBorrow(id);
      toast.success("ลบแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5"><span>Stock</span><span>/</span><span className="text-slate-900 font-medium">ยืมคืนสินค้า</span></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">ยืมคืนสินค้า</h1>
        </div>
        <button onClick={() => setShowModal(true)} disabled={!canManage} title={!canManage ? "เฉพาะ Super Admin/Manager/Store" : ""} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> สร้างใบยืม
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3"></th>
              <th className="text-left font-medium px-4 py-3">เลขที่</th>
              <th className="text-left font-medium px-4 py-3">คลัง</th>
              <th className="text-left font-medium px-4 py-3">ผู้ยืม</th>
              <th className="text-left font-medium px-4 py-3">กำหนดคืน</th>
              <th className="text-right font-medium px-4 py-3">จำนวน</th>
              <th className="text-right font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && borrows?.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-10">ยังไม่มีรายการยืม</td></tr>}
            {borrows?.map((b) => (
              <React.Fragment key={b.id}>
                <tr className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-700/30" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                  <td className="px-4 py-3 text-slate-400">
                    {expanded === b.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{b.borrow_no}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.location?.name || "-"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.borrower_name}</td>
                  <td className="px-4 py-3 text-slate-500">{b.due_date || "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{b.items?.length ?? 0} ชิ้น</td>
                  <td className="px-4 py-3 text-right">
                    {b.status === "returned" ? <Pill tone="green">คืนแล้ว</Pill> : <Pill tone="amber">ยืมอยู่</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
                {expanded === b.id && (
                  <tr>
                    <td colSpan={8} className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/40">
                      <table className="w-full text-xs">
                        <thead className="text-slate-400">
                          <tr>
                            <th className="text-left font-medium py-1.5">Model</th>
                            <th className="text-left font-medium py-1.5">Serial No.</th>
                            <th className="text-right font-medium py-1.5">สถานะ</th>
                            <th className="text-right font-medium py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {(b.items || []).map((it) => (
                            <tr key={it.id}>
                              <td className="py-2 text-slate-700 dark:text-slate-200">{it.item?.model_code}</td>
                              <td className="py-2 font-mono text-slate-600 dark:text-slate-300">{it.serial_no}</td>
                              <td className="py-2 text-right">
                                {it.returned ? <Pill tone="green">คืนแล้ว</Pill> : <Pill tone="amber">ยืมอยู่</Pill>}
                              </td>
                              <td className="py-2 text-right">
                                {!it.returned && canManage && (
                                  <button onClick={() => handleReturnItem(it.id)} className="text-slate-900 hover:underline font-medium">บันทึกคืนชิ้นนี้</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <NewBorrowModal
          items={items}
          locations={locations}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); refetch(); }}
        />
      )}
    </div>
  );
}

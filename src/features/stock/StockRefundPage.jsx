import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Pill, Modal, Field, Select, TextInput, TextArea } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listRefunds, createRefund, updateRefundStatus, deleteRefund } from "../../api/stock.js";
import { listContacts } from "../../api/contacts.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STATUS_FLOW = ["คำขอใหม่", "รอตรวจสอบสภาพสินค้า", "อนุมัติ", "คืนเงินแล้ว"];
const STATUS_TONE = { "คำขอใหม่": "slate", "รอตรวจสอบสภาพสินค้า": "amber", "อนุมัติ": "indigo", "คืนเงินแล้ว": "green", "ปฏิเสธ": "rose" };

function NewRefundModal({ onClose, onCreated }) {
  const toast = useToast();
  const { data: customers } = useQuery(() => listContacts({}), []);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const created = await createRefund({
        refund_no: `RF-${Date.now()}`,
        customer_id: customerId || null,
        amount: amount ? Number(amount) : null,
        reason: reason || null,
      });
      toast.success(`สร้างคำขอคืนเงิน ${created.refund_no} แล้ว`);
      onCreated();
    } catch (err) {
      toast.error("สร้างไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="สร้างคำขอคืนสินค้า/เงิน" onClose={onClose}>
      <Field label="ลูกค้า">
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— เลือกลูกค้า —</option>
          {customers?.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </Select>
      </Field>
      <Field label="จำนวนเงิน"><TextInput type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
      <Field label="เหตุผลการคืน"><TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : "สร้างคำขอ"}
        </button>
      </div>
    </Modal>
  );
}

export default function StockRefundPage() {
  const [showModal, setShowModal] = useState(false);
  const { data: refunds, loading, refetch } = useQuery(() => listRefunds(), []);
  const { profile } = useAuth();
  const toast = useToast();
  const canApprove = ["Super Admin", "Manager"].includes(profile?.role);

  async function advance(id, current) {
    const idx = STATUS_FLOW.indexOf(current);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    // Permission Matrix (spec §8.2): only Manager approves refunds.
    if (next === "อนุมัติ" && !canApprove) {
      toast.error("การอนุมัติคืนเงินทำได้เฉพาะ Manager / Super Admin เท่านั้น");
      return;
    }
    try {
      await updateRefundStatus(id, next);
      toast.success(`เปลี่ยนสถานะเป็น "${next}" แล้ว`);
      refetch();
    } catch (err) {
      toast.error("เปลี่ยนสถานะไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("ลบคำขอคืนเงินนี้หรือไม่?")) return;
    try {
      await deleteRefund(id);
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
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5"><span>Stock</span><span>/</span><span className="text-slate-900 font-medium">Refund</span></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Refund — ลูกค้าคืนสินค้า/ขอเงินคืน</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm">
          <Plus className="w-4 h-4" /> สร้างคำขอ
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">เลขที่</th>
              <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
              <th className="text-right font-medium px-4 py-3">จำนวนเงิน</th>
              <th className="text-right font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={5} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && refunds?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">ยังไม่มีคำขอคืนเงิน</td></tr>}
            {refunds?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.refund_no}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.customer?.display_name || "-"}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{r.amount ? `฿${Number(r.amount).toLocaleString()}` : "-"}</td>
                <td className="px-4 py-3 text-right"><Pill tone={STATUS_TONE[r.status] || "slate"}>{r.status}</Pill></td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    {STATUS_FLOW.indexOf(r.status) < STATUS_FLOW.length - 1 && (() => {
                      const next = STATUS_FLOW[STATUS_FLOW.indexOf(r.status) + 1];
                      const blocked = next === "อนุมัติ" && !canApprove;
                      return (
                        <button
                          onClick={() => advance(r.id, r.status)}
                          disabled={blocked}
                          title={blocked ? "อนุมัติได้เฉพาะ Manager / Super Admin" : ""}
                          className="text-xs font-medium text-slate-900 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {blocked ? "รออนุมัติ (Manager)" : "ขั้นถัดไป"}
                        </button>
                      );
                    })()}
                    <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showModal && <NewRefundModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); refetch(); }} />}
    </div>
  );
}

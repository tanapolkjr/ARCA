import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Pill, Modal, Field, Select, TextInput, TextArea } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listPurchaseRequests, createPurchaseRequest, updatePurchaseRequestStatus, deletePurchaseRequest } from "../../api/stock.js";
import { listProjects } from "../../api/projects.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STATUS_FLOW = ["ส่งเรื่อง", "รออนุมัติ", "อนุมัติแล้ว", "สั่งซื้อแล้ว", "รับของแล้ว/ปิดเรื่อง"];
const STATUS_TONE = { "ส่งเรื่อง": "slate", "รออนุมัติ": "amber", "อนุมัติแล้ว": "indigo", "สั่งซื้อแล้ว": "blue", "รับของแล้ว/ปิดเรื่อง": "green" };

function NewPurchaseRequestModal({ onClose, onCreated }) {
  const toast = useToast();
  const { session } = useAuth();
  const { data: projects } = useQuery(() => listProjects({}), []);
  const [projectId, setProjectId] = useState("");
  const [detail, setDetail] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [items, setItems] = useState([{ description: "", qty: 1, est_price: "" }]);
  const [saving, setSaving] = useState(false);

  function updateItem(i, field, val) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  }

  async function handleSave() {
    if (!projectId) {
      toast.error("ต้องเลือก Project ต้นทางก่อน (ใบขอซื้อต้องอ้างอิง Project เสมอ)");
      return;
    }
    setSaving(true);
    try {
      const created = await createPurchaseRequest(
        { request_no: `PR-${Date.now()}`, project_id: projectId, requested_by: session?.user?.id, detail, needed_by: neededBy || null },
        items.filter((it) => it.description.trim()).map((it) => ({ description: it.description, qty: Number(it.qty) || 1, est_price: it.est_price ? Number(it.est_price) : null }))
      );
      toast.success(`สร้างใบขอซื้อ ${created.request_no} แล้ว`);
      onCreated();
    } catch (err) {
      toast.error("สร้างไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="สร้างใบขอซื้อ" onClose={onClose}>
      <Field label="Project ต้นทาง" required>
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— ต้องเลือก Project —</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.project_number} — {p.site?.name}</option>)}
        </Select>
      </Field>
      <Field label="วันที่ต้องการใช้"><TextInput type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></Field>
      <Field label="รายละเอียดคำขอ"><TextArea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>

      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">รายการสินค้า</p>
      <div className="space-y-2 mb-2">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="col-span-6 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" placeholder="รายการ" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
            <input className="col-span-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" type="number" placeholder="จำนวน" value={it.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} />
            <input className="col-span-3 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" type="number" placeholder="ราคาประมาณ" value={it.est_price} onChange={(e) => updateItem(i, "est_price", e.target.value)} />
            <button onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => setItems((rows) => [...rows, { description: "", qty: 1, est_price: "" }])} className="text-sm font-medium text-slate-900 hover:text-slate-900 mb-4">+ เพิ่มรายการ</button>

      <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : "ส่งใบขอซื้อ"}
        </button>
      </div>
    </Modal>
  );
}

export default function PurchaseRequestPage() {
  const [showModal, setShowModal] = useState(false);
  const { data: requests, loading, refetch } = useQuery(() => listPurchaseRequests(), []);
  const { profile } = useAuth();
  const toast = useToast();
  const canApprove = ["Super Admin", "Manager"].includes(profile?.role);

  async function advance(id, current) {
    const idx = STATUS_FLOW.indexOf(current);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    // Permission Matrix (spec §8.2): only Manager approves purchase requests.
    if (next === "อนุมัติแล้ว" && !canApprove) {
      toast.error("การอนุมัติใบขอซื้อทำได้เฉพาะ Manager / Super Admin เท่านั้น");
      return;
    }
    try {
      await updatePurchaseRequestStatus(id, next);
      toast.success(`เปลี่ยนสถานะเป็น "${next}" แล้ว`);
      refetch();
    } catch (err) {
      toast.error("เปลี่ยนสถานะไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("ลบใบขอซื้อนี้หรือไม่?")) return;
    try {
      await deletePurchaseRequest(id);
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
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5"><span>Stock</span><span>/</span><span className="text-slate-900 font-medium">ใบขอซื้อ</span></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">ใบขอซื้อ (Purchase Request)</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm">
          <Plus className="w-4 h-4" /> สร้างใบขอซื้อ
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">เลขที่</th>
              <th className="text-left font-medium px-4 py-3">Project</th>
              <th className="text-right font-medium px-4 py-3">รายการ</th>
              <th className="text-right font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={5} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && requests?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">ยังไม่มีใบขอซื้อ</td></tr>}
            {requests?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.request_no}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.project?.project_number || "-"}</td>
                <td className="px-4 py-3 text-right text-slate-500">{r.items?.length || 0} รายการ</td>
                <td className="px-4 py-3 text-right"><Pill tone={STATUS_TONE[r.status] || "slate"}>{r.status}</Pill></td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    {STATUS_FLOW.indexOf(r.status) < STATUS_FLOW.length - 1 && (() => {
                      const next = STATUS_FLOW[STATUS_FLOW.indexOf(r.status) + 1];
                      const blocked = next === "อนุมัติแล้ว" && !canApprove;
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

      {showModal && <NewPurchaseRequestModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); refetch(); }} />}
    </div>
  );
}

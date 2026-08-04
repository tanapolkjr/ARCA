import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Select, Pill, Card } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listPMRequests, deletePMRequest } from "../../api/pmRequests.js";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STATUS_TONE = {
  "คำขอใหม่": "slate",
  "รับเรื่องแล้ว": "indigo",
  "กำลังดำเนินการ": "blue",
  "เสร็จสิ้น": "green",
  "ยกเลิก": "rose",
};

const REQUEST_TYPES = ["ขอออกแบบระบบ", "ขอสำรวจหน้างาน", "ขอทดสอบสินค้า", "ขอประเมินสเปค/ความเข้ากันได้ของสินค้า", "อื่นๆ"];

export default function PMRequestList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: rows, error, loading, refetch } = useQuery(() => listPMRequests({ type: typeFilter }), [typeFilter]);

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm("ลบคำขอนี้หรือไม่?")) return;
    try {
      await deletePMRequest(id);
      toast.success("ลบแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            <span>E-Service</span><span>/</span><span className="text-indigo-600 font-medium">PM Request</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">PM Request — คำขอสนับสนุนจากทีม PM</h1>
        </div>
        <button onClick={() => navigate("/pm-request/new")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างคำขอใหม่
        </button>
      </div>

      <Card className="p-4 mb-5">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">ทุกประเภทคำขอ</option>
          {REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Card>

      {error && <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(error)}</div>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">Code</th>
              <th className="text-left font-medium px-4 py-3">ประเภท</th>
              <th className="text-left font-medium px-4 py-3">ผู้ขอ</th>
              <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
              <th className="text-left font-medium px-4 py-3">วันที่</th>
              <th className="text-left font-medium px-4 py-3">วันที่ต้องการใช้</th>
              <th className="text-right font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-10">ยังไม่มีคำขอ</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/pm-request/${r.id}`)} className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-colors">
                <td className="px-4 py-3 font-medium text-indigo-600">{r.request_code}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.request_type}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.requester?.name || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.customer_name_free || r.project?.project_number || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.requested_at ? new Date(r.requested_at).toLocaleDateString("th-TH") : "-"}</td>
                <td className={`px-4 py-3 ${r.needed_at && new Date(r.needed_at) < new Date() && r.status !== "เสร็จสิ้น" && r.status !== "ยกเลิก" ? "text-rose-500 font-medium" : "text-slate-500"}`}>
                  {r.needed_at ? new Date(r.needed_at).toLocaleDateString("th-TH") : "-"}
                </td>
                <td className="px-4 py-3 text-right"><Pill tone={STATUS_TONE[r.status] || "slate"}>{r.status}</Pill></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={(e) => handleDelete(e, r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

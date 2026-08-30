import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2 } from "lucide-react";
import { TextInput, Select, StatusCounterCard, Pill } from "../../components/ui/primitives.jsx";
import { PROJECT_STATUS_STEPS, projectStatusTone } from "../../lib/mockData";
import { useQuery } from "../../hooks/useQuery.js";
import { listProjects, countProjectsByStatus, deleteProject } from "../../api/projects.js";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

export default function ProjectList() {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [projectNameQuery, setProjectNameQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [projectNumberQuery, setProjectNumberQuery] = useState("");

  const { data: rows, error, loading, refetch } = useQuery(
    () => listProjects({ status: statusFilter, projectName: projectNameQuery, customerName: customerQuery, projectNumber: projectNumberQuery }),
    [statusFilter, projectNameQuery, customerQuery, projectNumberQuery]
  );
  const { data: statusCounts } = useQuery(() => countProjectsByStatus(), [rows]);
  const totalCount = statusCounts ? Object.values(statusCounts).reduce((s, n) => s + n, 0) : null;

  const statusCards = [
    { key: "all", label: "ทั้งหมด", chip: "bg-slate-400" },
    { key: "New Request", label: "New Request", chip: "bg-slate-400" },
    { key: "Request Accepted", label: "Request Accepted", chip: "bg-slate-800" },
    { key: "Pending Scheduling", label: "Pending Scheduling", chip: "bg-amber-500" },
    { key: "Installation Completed", label: "Installation Completed", chip: "bg-emerald-500" },
    { key: "Equipment Shipped", label: "Equipment Shipped", chip: "bg-slate-500" },
  ];

  function resetFilters() {
    setStartDate(today);
    setEndDate(today);
    setProjectNameQuery("");
    setCustomerQuery("");
    setProjectNumberQuery("");
    setStatusFilter("all");
  }

  async function handleDelete(e, project) {
    e.stopPropagation();
    if (!window.confirm(`ลบโปรเจค ${project.project_number} ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteProject(project.id);
      toast.success(`ลบโปรเจค ${project.project_number} แล้ว`);
      refetch();
    } catch (err) {
      const msg = errMsg(err);
      if (/row-level security|permission denied|policy/i.test(msg)) {
        toast.error("ลบไม่ได้ — โปรเจคนี้เลยสถานะ Request Submitted แล้ว ต้องให้ Manager หรือ Super Admin เป็นผู้ลบเท่านั้น");
      } else {
        toast.error("ลบไม่สำเร็จ: " + msg);
      }
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            <span>E-Service</span><span>/</span><span>Service</span><span>/</span><span className="text-slate-900 font-medium">Install</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Install — รายการ Project</h1>
        </div>
        <button
          onClick={() => navigate("/project/new")}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm"
        >
          <Plus className="w-4 h-4" /> สร้าง Project ใหม่
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {statusCards.map((c) => (
          <StatusCounterCard
            key={c.key}
            label={c.label}
            count={c.key === "all" ? (totalCount ?? "…") : (statusCounts?.[c.key] ?? 0)}
            chip={c.chip}
            active={statusFilter === c.key}
            onClick={() => setStatusFilter(c.key)}
          />
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">ช่วงวันที่ (ค่าเริ่มต้น: วันนี้)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            {PROJECT_STATUS_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select defaultValue="All Company">
            <option>All Company</option>
          </Select>
        </div>

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">ค้นหาแยกตามฟิลด์</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <TextInput placeholder="ค้นหาชื่อโปรเจค..." value={projectNameQuery} onChange={(e) => setProjectNameQuery(e.target.value)} />
          <TextInput placeholder="ค้นหาชื่อลูกค้า..." value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} />
          <div className="relative">
            <TextInput placeholder="Project number..." value={projectNumberQuery} onChange={(e) => setProjectNumberQuery(e.target.value)} />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-3">
          <button className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm">ค้นหา</button>
          <button onClick={resetFilters} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">ล้างตัวกรอง</button>
          <button className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Export</button>
        </div>
      </div>

      {error && <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(error)}</div>}

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Project Number</th>
              <th className="text-left font-medium px-4 py-3">Project Name</th>
              <th className="text-left font-medium px-4 py-3">Customer</th>
              <th className="text-left font-medium px-4 py-3">Plan</th>
              <th className="text-left font-medium px-4 py-3">Salesman</th>
              <th className="text-right font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && (!rows || rows.length === 0) && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-10">No data available in table</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/project/${r.id}`)} className="cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/5 transition-colors">
                <td className="px-4 py-3 text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.project_number}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.site?.name || "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.customer?.display_name || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.plan || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.salesman?.name || "-"}</td>
                <td className="px-4 py-3 text-right"><Pill tone={projectStatusTone(r.status)}>{r.status}</Pill></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={(e) => handleDelete(e, r)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700">
          <span>Showing {rows?.length ?? 0} entries</span>
        </div>
      </div>
    </div>
  );
}

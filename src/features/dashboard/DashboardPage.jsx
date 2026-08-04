import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { StatusCounterCard, Pill, Card } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { countProjectsByStatus } from "../../api/projects.js";
import { countTicketsByStatus } from "../../api/tickets.js";
import { getOverdueItems, getWarrantyStats, getPendingPMRequestsByType, PM_DASHBOARD_MAIN_TYPES } from "../../api/dashboard.js";

const PROJECT_KEY_STATUSES = [
  { key: "New Request", chip: "bg-slate-400" },
  { key: "Request Accepted", chip: "bg-indigo-500" },
  { key: "Pending Scheduling", chip: "bg-amber-500" },
  { key: "Installation Completed", chip: "bg-emerald-500" },
];
const TICKET_KEY_STATUSES = [
  { key: "ส่งเรื่อง", chip: "bg-slate-400" },
  { key: "รับเรื่อง", chip: "bg-indigo-500" },
  { key: "นัดหมายแล้ว", chip: "bg-amber-500" },
  { key: "ปิดงานแล้ว", chip: "bg-emerald-500" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: projectCounts, loading: loadingProjects } = useQuery(() => countProjectsByStatus(), []);
  const { data: ticketCounts, loading: loadingTickets } = useQuery(() => countTicketsByStatus(), []);
  const { data: overdue, loading: loadingOverdue } = useQuery(() => getOverdueItems(), []);
  const { data: warranty } = useQuery(() => getWarrantyStats(), []);
  const { data: pmPending, loading: loadingPM } = useQuery(() => getPendingPMRequestsByType(), []);

  function overdueLink(item) {
    if (item.type === "Ticket") return `/ticket/${item.id}`;
    if (item.type === "Project") return `/project/${item.id}`;
    if (item.type === "PM Request") return `/pm-request/${item.id}`;
    if (item.type === "ใบขอซื้อ") return "/stock/purchase-request";
    return "/";
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">ภาพรวมงานทั้งหมด — เรียงตามความสำคัญ: จุดที่ต้องรีบดูก่อน</p>
      </div>

      {/* Overdue / Action Required — top priority zone */}
      <Card className="border-rose-200 dark:border-rose-500/30 mb-6 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-rose-600 dark:text-rose-300">Overdue / จุดที่ต้องรีบดำเนินการ</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {loadingOverdue && <p className="text-sm text-slate-400 text-center py-6">กำลังตรวจสอบ...</p>}
          {!loadingOverdue && (!overdue || overdue.length === 0) && (
            <p className="text-sm text-slate-400 text-center py-6">ไม่มีรายการค้าง — เยี่ยมมาก 🎉</p>
          )}
          {overdue?.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => navigate(overdueLink(item))}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Pill tone={item.severity}>{item.type}</Pill>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.code}</span>
                <span className="text-sm text-slate-400">{item.label}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      </Card>

      {/* Pipeline overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Project Pipeline</h3>
          <div className="grid grid-cols-2 gap-3">
            {PROJECT_KEY_STATUSES.map((c) => (
              <StatusCounterCard
                key={c.key}
                label={c.key}
                count={loadingProjects ? "…" : (projectCounts?.[c.key] || 0)}
                chip={c.chip}
                onClick={() => navigate("/project")}
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Ticket Pipeline</h3>
          <div className="grid grid-cols-2 gap-3">
            {TICKET_KEY_STATUSES.map((c) => (
              <StatusCounterCard
                key={c.key}
                label={c.key}
                count={loadingTickets ? "…" : (ticketCounts?.[c.key] || 0)}
                chip={c.chip}
                onClick={() => navigate("/ticket")}
              />
            ))}
          </div>
        </div>
      </div>

      {/* PM Request — pending workload by type, ordered by due date */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">PM Request ค้างดำเนินการ (แบ่งตามประเภทงาน)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[...PM_DASHBOARD_MAIN_TYPES, "อื่นๆ"].map((t, i) => (
            <StatusCounterCard
              key={t}
              label={t}
              count={loadingPM ? "…" : (pmPending?.counts?.[t] || 0)}
              chip={["bg-indigo-500", "bg-blue-500", "bg-amber-500", "bg-slate-400"][i]}
              onClick={() => navigate("/pm-request")}
            />
          ))}
        </div>
        {!loadingPM && (pmPending?.items?.length || 0) > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {pmPending.items.slice(0, 8).map((r) => {
                const overdueDays = r.needed_at ? Math.floor((Date.now() - new Date(r.needed_at).getTime()) / 86400000) : null;
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/pm-request/${r.id}`)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-indigo-600 whitespace-nowrap">{r.request_code}</span>
                      <span className="text-xs text-slate-500 truncate">{PM_DASHBOARD_MAIN_TYPES.includes(r.request_type) ? r.request_type : `อื่นๆ — ${r.request_type}`}</span>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className={`text-xs ${overdueDays !== null && overdueDays > 0 ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                        {r.needed_at
                          ? (overdueDays > 0
                              ? `เลยกำหนดมา ${overdueDays} วัน (${new Date(r.needed_at).toLocaleDateString("th-TH")})`
                              : `ต้องการใช้ ${new Date(r.needed_at).toLocaleDateString("th-TH")}`)
                          : "ไม่ระบุวันที่ต้องการใช้"}
                      </span>
                      <Pill tone={r.status === "คำขอใหม่" ? "slate" : r.status === "กำลังดำเนินการ" ? "blue" : "indigo"}>{r.status}</Pill>
                    </div>
                  </button>
                );
              })}
            </div>
            {pmPending.items.length > 8 && (
              <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-700 text-right">
                <button onClick={() => navigate("/pm-request")} className="text-xs font-medium text-indigo-600 hover:underline">
                  ดูทั้งหมด {pmPending.total} รายการ <ArrowRight className="w-3 h-3 inline" />
                </button>
              </div>
            )}
          </Card>
        )}
        {!loadingPM && (pmPending?.items?.length || 0) === 0 && (
          <Card className="p-4"><p className="text-sm text-slate-400 text-center">ไม่มี PM Request ค้างดำเนินการ 🎉</p></Card>
        )}
      </div>

      {/* Supplementary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">ประกันสินค้า (จาก Device Detail ทั้งหมด)</h3>
          {warranty?.total === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีข้อมูลสินค้าที่เบิกจริง</p>
          ) : (
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-500">{warranty?.inWarrantyPct ?? "-"}%</div>
                <div className="text-xs text-slate-400 mt-1">ในประกัน</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-500">{warranty?.outWarrantyPct ?? "-"}%</div>
                <div className="text-xs text-slate-400 mt-1">นอกประกัน</div>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Dashboard เพิ่มเติม</h3>
          <p className="text-xs text-slate-400 mb-3">แยกเป็นหน้าเฉพาะทาง ไม่ยัดรวมกับ Overdue ด้านบน</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/stock")} className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-100 dark:hover:bg-slate-600">Dashboard Stock</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

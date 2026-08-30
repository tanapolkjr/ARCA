import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2 } from "lucide-react";
import { TextInput, Select, StatusCounterCard, Pill } from "../../components/ui/primitives.jsx";
import { TICKET_STATUS_STEPS, ticketStatusTone } from "../../lib/mockData";
import { useQuery } from "../../hooks/useQuery.js";
import { listTickets, countTicketsByStatus, deleteTicket } from "../../api/tickets.js";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

export default function TicketList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const { data: rows, error, loading, refetch } = useQuery(
    () => listTickets({ status: statusFilter, query }),
    [statusFilter, query]
  );
  const { data: statusCounts } = useQuery(() => countTicketsByStatus(), [rows]);
  const totalCount = statusCounts ? Object.values(statusCounts).reduce((s, n) => s + n, 0) : null;

  const statusCards = [
    { key: "all", label: "ทั้งหมด" },
    { key: "ส่งเรื่อง", label: "ส่งเรื่อง", chip: "bg-slate-400" },
    { key: "รับเรื่อง", label: "รับเรื่อง", chip: "bg-slate-800" },
    { key: "นัดหมายแล้ว", label: "นัดหมายแล้ว", chip: "bg-amber-500" },
    { key: "ปิดงานแล้ว", label: "ปิดงานแล้ว", chip: "bg-emerald-500" },
  ];

  async function handleDelete(e, ticket) {
    e.stopPropagation();
    if (!window.confirm(`ลบ Ticket ${ticket.ticket_code} หรือไม่?`)) return;
    try {
      await deleteTicket(ticket.id);
      toast.success(`ลบ Ticket ${ticket.ticket_code} แล้ว`);
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
            <span>E-Service</span><span>/</span><span>Service</span><span>/</span><span className="text-slate-900 font-medium">Ticket</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">E-Ticket — รายการแจ้งซ่อม</h1>
        </div>
        <button
          onClick={() => navigate("/ticket/new")}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm"
        >
          <Plus className="w-4 h-4" /> สร้าง Ticket ใหม่
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {statusCards.map((c) => (
          <StatusCounterCard
            key={c.key}
            label={c.label}
            count={c.key === "all" ? (totalCount ?? "…") : (statusCounts?.[c.key] ?? 0)}
            chip={c.chip || "bg-slate-300"}
            active={statusFilter === c.key}
            onClick={() => setStatusFilter(c.key)}
          />
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">สถานะทั้งหมด</option>
            {TICKET_STATUS_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select defaultValue="Support All">
            <option>Support All</option>
            <option>Call</option>
            <option>Onsite</option>
          </Select>
          <TextInput type="date" />
          <TextInput type="date" />
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา ticket code..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(error)}</div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Code</th>
              <th className="text-left font-medium px-4 py-3">Project</th>
              <th className="text-left font-medium px-4 py-3">Customer</th>
              <th className="text-left font-medium px-4 py-3">Contact</th>
              <th className="text-left font-medium px-4 py-3">Phone</th>
              <th className="text-right font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>
            )}
            {!loading && (!rows || rows.length === 0) && (
              <tr><td colSpan={8} className="text-center text-slate-400 py-10">No data available in table</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/ticket/${r.id}`)} className="cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/5 transition-colors">
                <td className="px-4 py-3 text-slate-500">{r.reported_at ? new Date(r.reported_at).toLocaleDateString("th-TH") : "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.ticket_code}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.project?.project_number || "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.project?.customer?.display_name || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.reporter_name || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.reporter_phone || "-"}</td>
                <td className="px-4 py-3 text-right"><Pill tone={ticketStatusTone(r.status)}>{r.status}</Pill></td>
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

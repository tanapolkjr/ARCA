import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, FileText, Receipt } from "lucide-react";
import { StatusCounterCard, Pill, Card } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { countProjectsByStatus } from "../../api/projects.js";
import { countTicketsByStatus } from "../../api/tickets.js";
import {
  getOverdueItems, getPendingPMRequestsByType, PM_DASHBOARD_MAIN_TYPES,
  getQuotationsByCategory, getUnpaidBills, getTopStockItems,
} from "../../api/dashboard.js";

const PROJECT_KEY_STATUSES = [
  { key: "New Request", chip: "bg-stone-400" },
  { key: "Request Accepted", chip: "bg-stone-800" },
  { key: "Pending Scheduling", chip: "bg-amber-600" },
  { key: "Installation Completed", chip: "bg-emerald-600" },
];
const TICKET_KEY_STATUSES = [
  { key: "ส่งเรื่อง", label: "Submitted", chip: "bg-stone-400" },
  { key: "รับเรื่อง", label: "Accepted", chip: "bg-stone-800" },
  { key: "นัดหมายแล้ว", label: "Scheduled", chip: "bg-amber-600" },
  { key: "ปิดงานแล้ว", label: "Closed", chip: "bg-emerald-600" },
];
const PM_TYPE_LABEL = {
  "ขอสำรวจหน้างาน": "Site Survey",
  "ขอออกแบบระบบ": "System Design",
  "ขอทดสอบสินค้า": "Product Test",
  "อื่นๆ": "Other",
};

const baht = (n) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ย่อให้อ่านเร็วบนการ์ด: 1,250,000 → 1.25M */
const short = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return v.toFixed(0);
};

/** หัวข้อส่วน — เส้นคาดบางใต้ชื่อ ตามแบบหน้าแคตตาล็อกบริษัท */
function SectionHead({ icon: Icon, title, meta, action, onAction }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3 pb-2 border-b border-stone-200 dark:border-stone-700">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-stone-400 shrink-0" />}
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200 truncate">{title}</h3>
        {meta && <span className="text-xs text-stone-400 whitespace-nowrap">{meta}</span>}
      </div>
      {action && (
        <button onClick={onAction}
                className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100
                  whitespace-nowrap shrink-0">
          {action} <ArrowRight className="w-3 h-3 inline" />
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: projectCounts, loading: loadingProjects } = useQuery(() => countProjectsByStatus(), []);
  const { data: ticketCounts, loading: loadingTickets } = useQuery(() => countTicketsByStatus(), []);
  const { data: overdue, loading: loadingOverdue } = useQuery(() => getOverdueItems(), []);
  const { data: pmPending, loading: loadingPM } = useQuery(() => getPendingPMRequestsByType(), []);
  const { data: quotes, loading: loadingQuotes } = useQuery(() => getQuotationsByCategory(), []);
  const { data: unpaid, loading: loadingUnpaid } = useQuery(() => getUnpaidBills(), []);
  const { data: topStock, loading: loadingStock } = useQuery(() => getTopStockItems(), []);

  function overdueLink(item) {
    if (item.type === "Ticket") return `/ticket/${item.id}`;
    if (item.type === "Project") return `/project/${item.id}`;
    if (item.type === "PM Request") return `/pm-request/${item.id}`;
    if (item.type === "ใบขอซื้อ") return "/stock/purchase-request";
    return "/";
  }

  const maxStock = Math.max(1, ...(topStock ?? []).map((s) => s.onHand));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Dashboard</h1>
        <p className="text-sm text-stone-400 mt-1">
          Sales, receivables and stock at a glance — what needs attention first
        </p>
      </div>

      {/* 1. ใบเสนอราคาแยกตามหมวดสินค้า — ส่วนหลักของหน้า ตัวเลขที่ฝ่ายขายดูทุกวัน */}
      <section className="mb-7">
        <SectionHead
          icon={FileText}
          title="Quotations by Category"
          meta={loadingQuotes ? "…" : `${quotes?.count ?? 0} documents · ${baht(quotes?.total)} THB`}
          action="All quotations"
          onAction={() => navigate("/accounting/QT")}
        />
        {loadingQuotes && <p className="text-sm text-stone-400 py-6 text-center">Loading…</p>}
        {!loadingQuotes && (quotes?.categories?.length ?? 0) === 0 && (
          <Card className="p-6"><p className="text-sm text-stone-400 text-center">No quotations yet</p></Card>
        )}
        {!loadingQuotes && (quotes?.categories?.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quotes.categories.map((c) => (
              <button
                key={c.name}
                onClick={() => navigate("/accounting/QT")}
                className="text-left rounded-xl border border-stone-200 dark:border-stone-700
                  bg-white dark:bg-stone-900 p-4 hover:border-stone-400 dark:hover:border-stone-500
                  transition-colors"
              >
                <div className="text-xs text-stone-500 dark:text-stone-400 truncate">{c.name}</div>
                <div className="mt-1.5 text-xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
                  {short(c.amount)}
                </div>
                <div className="text-[11px] text-stone-400 tabular-nums">{baht(c.amount)} THB</div>
                {/* แถบสัดส่วน — เทียบหมวดกันด้วยสายตาโดยไม่ต้องอ่านตัวเลขทุกใบ */}
                <div className="mt-2.5 h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div className="h-full bg-stone-800 dark:bg-stone-300"
                       style={{ width: `${Math.max(2, Math.round(c.share * 100))}%` }} />
                </div>
                <div className="mt-1.5 text-[11px] text-stone-400">
                  {c.count} doc{c.count > 1 ? "s" : ""} · {Math.round(c.share * 100)}%
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. ใบวางบิลที่ยังเก็บเงินไม่ครบ — เงินที่ออกบิลไปแล้วแต่ยังไม่เข้า */}
      <section className="mb-7">
        <SectionHead
          icon={Receipt}
          title="Outstanding Receivables"
          meta={loadingUnpaid
            ? "…"
            : `${unpaid?.count ?? 0} unpaid · ${baht(unpaid?.totalOutstanding)} THB${
                unpaid?.overdueCount ? ` · ${unpaid.overdueCount} overdue` : ""}`}
          action="All invoices"
          onAction={() => navigate("/accounting/BL")}
        />
        <Card className="overflow-hidden">
          {loadingUnpaid && <p className="text-sm text-stone-400 py-6 text-center">Loading…</p>}
          {!loadingUnpaid && (unpaid?.rows?.length ?? 0) === 0 && (
            <p className="text-sm text-stone-400 py-6 text-center">Everything is collected 🎉</p>
          )}
          <div className="divide-y divide-stone-100 dark:divide-stone-700">
            {unpaid?.rows?.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/accounting/${r.docType}/${r.id}`)}
                className="w-full flex items-center justify-between gap-3 px-5 py-3
                  hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">
                    {r.docNo}
                  </span>
                  <span className="text-xs text-stone-500 truncate">{r.customer}</span>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
                  {r.paid > 0 && (
                    <span className="text-[11px] text-stone-400 tabular-nums hidden sm:inline">
                      paid {baht(r.paid)}
                    </span>
                  )}
                  <span className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {baht(r.outstanding)}
                  </span>
                  {r.overdueDays > 0
                    ? <Pill tone="red">{r.overdueDays}d overdue</Pill>
                    : <Pill tone="slate">{r.dueDate ? "due" : "no due date"}</Pill>}
                </div>
              </button>
            ))}
          </div>
          {(unpaid?.count ?? 0) > (unpaid?.rows?.length ?? 0) && (
            <div className="px-5 py-2.5 border-t border-stone-100 dark:border-stone-700 text-right">
              <button onClick={() => navigate("/accounting/BL")}
                      className="text-xs font-medium text-stone-900 dark:text-stone-100 hover:underline">
                View all {unpaid.count} <ArrowRight className="w-3 h-3 inline" />
              </button>
            </div>
          )}
        </Card>
      </section>

      {/* 3. สินค้าคงคลังสูงสุด 5 อันดับ */}
      <section className="mb-7">
        <SectionHead
          icon={Boxes}
          title="Top 5 Stock by Quantity"
          action="Inventory"
          onAction={() => navigate("/stock")}
        />
        <Card className="overflow-hidden">
          {loadingStock && <p className="text-sm text-stone-400 py-6 text-center">Loading…</p>}
          {!loadingStock && (topStock?.length ?? 0) === 0 && (
            <p className="text-sm text-stone-400 py-6 text-center">No stock on hand</p>
          )}
          <div className="divide-y divide-stone-100 dark:divide-stone-700">
            {topStock?.map((s, i) => (
              <button
                key={s.id}
                onClick={() => navigate("/stock")}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-stone-50
                  dark:hover:bg-stone-800 transition-colors text-left"
              >
                <span className="text-xs text-stone-300 w-4 shrink-0 tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                    {s.modelCode}
                  </div>
                  {s.description && (
                    <div className="text-[11px] text-stone-400 truncate">{s.description}</div>
                  )}
                  <div className="mt-1.5 h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                    <div className="h-full bg-stone-700 dark:bg-stone-300"
                         style={{ width: `${Math.max(2, Math.round((s.onHand / maxStock) * 100))}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {s.onHand.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-stone-400">{s.unit}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* 4. Overdue — ยังอยู่ แต่ย้ายลงมาใต้ตัวเลขฝั่งขายตามที่สั่ง */}
      <Card className="border-rose-200 dark:border-rose-500/30 mb-6 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-rose-600 dark:text-rose-300">Overdue / Needs Action</h2>
        </div>
        <div className="divide-y divide-stone-100 dark:divide-stone-700">
          {loadingOverdue && <p className="text-sm text-stone-400 text-center py-5">Checking…</p>}
          {!loadingOverdue && (!overdue || overdue.length === 0) && (
            <p className="text-sm text-stone-400 text-center py-5">Nothing overdue 🎉</p>
          )}
          {overdue?.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => navigate(overdueLink(item))}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Pill tone={item.severity}>{item.type}</Pill>
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">{item.code}</span>
                <span className="text-sm text-stone-400">{item.label}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-stone-300" />
            </button>
          ))}
        </div>
      </Card>

      {/* 5. Pipeline — เนื้อหาเดิม แต่ย่อขนาดลงให้เป็นแถบสรุป ไม่แย่งที่ส่วนบน */}
      <section className="mb-6">
        <SectionHead title="Project & Ticket Pipeline" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Project</p>
            <div className="grid grid-cols-4 gap-2">
              {PROJECT_KEY_STATUSES.map((c) => (
                <MiniStat
                  key={c.key} label={c.key} chip={c.chip}
                  count={loadingProjects ? "…" : (projectCounts?.[c.key] || 0)}
                  onClick={() => navigate("/project")}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Ticket</p>
            <div className="grid grid-cols-4 gap-2">
              {TICKET_KEY_STATUSES.map((c) => (
                <MiniStat
                  key={c.key} label={c.label} chip={c.chip}
                  count={loadingTickets ? "…" : (ticketCounts?.[c.key] || 0)}
                  onClick={() => navigate("/ticket")}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. PM Request — ย่อเหลือแถบนับ รายการละเอียดอยู่ในหน้าของมันเอง */}
      <section>
        <SectionHead
          title="PM Requests Pending"
          meta={loadingPM ? "…" : `${pmPending?.total ?? 0} open`}
          action="PM Requests"
          onAction={() => navigate("/pm-request")}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...PM_DASHBOARD_MAIN_TYPES, "อื่นๆ"].map((t, i) => (
            <MiniStat
              key={t}
              label={PM_TYPE_LABEL[t] ?? t}
              chip={["bg-stone-800", "bg-stone-500", "bg-amber-600", "bg-stone-400"][i]}
              count={loadingPM ? "…" : (pmPending?.counts?.[t] || 0)}
              onClick={() => navigate("/pm-request")}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** การ์ดนับเลขขนาดย่อ — ใช้กับ pipeline ที่ต้องเล็กลงกว่าเดิม */
function MiniStat({ label, count, chip, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900
        px-3 py-2.5 text-left hover:border-stone-400 dark:hover:border-stone-500 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${chip}`} />
        <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{count}</div>
    </button>
  );
}

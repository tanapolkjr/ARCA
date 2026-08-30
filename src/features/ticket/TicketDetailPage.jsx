import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { User, Package, CheckCircle2, MessageSquare, Wrench, Repeat, Settings2, ArrowLeft, Save, Trash2 } from "lucide-react";
import { Pill, Card } from "../../components/ui/primitives.jsx";
import StatusStepper from "../../components/ui/StatusStepper.jsx";
import CommentPanel from "../../components/ui/CommentPanel.jsx";
import {
  CustomerRefTab, DeviceInstallRefTab, DeviceDetailRefTab, RequestIssueTab,
  SubcontractorTab, StockMovementTab, UpdateTab,
} from "./TicketTabs.jsx";
import { TICKET_STATUS_STEPS, ticketStatusTone } from "../../lib/mockData";
import { useQuery } from "../../hooks/useQuery.js";
import { getTicket, createTicket, updateTicket, deleteTicket } from "../../api/tickets.js";
import { listProjects } from "../../api/projects.js";
import { errMsg, toDatetimeLocalValue, fromDatetimeLocalValue } from "../../lib/format.js";
import { useToast } from "../../hooks/useToast.jsx";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning.js";

const TABS = [
  { id: "customer", label: "Customer", icon: User },
  { id: "deviceInstall", label: "Device Install", icon: Package },
  { id: "deviceDetail", label: "Device Detail", icon: CheckCircle2 },
  { id: "request", label: "Request & Issue", icon: MessageSquare },
  { id: "subcontractor", label: "Subcontractor", icon: Wrench },
  { id: "movement", label: "เบิก/คืน/รับของเก่า", icon: Repeat },
  { id: "update", label: "Update", icon: Settings2 },
];

const BLANK_STATE = {
  status: "ส่งเรื่อง", supportType: "Call",
  reporterName: "", reporterPhone: "", reporterEmail: "", preferredCallbackAt: "", symptomDescription: "",
  receivedAt: "", receivedBy: "", appointmentDate: "", workStartDate: "", workCloseDate: "", remark: "",
};

function dbRowToState(row) {
  return {
    status: row.status,
    supportType: row.support_type || "Call",
    reporterName: row.reporter_name || "",
    reporterPhone: row.reporter_phone || "",
    reporterEmail: row.reporter_email || "",
    preferredCallbackAt: toDatetimeLocalValue(row.preferred_callback_at),
    symptomDescription: row.symptom_description || "",
    receivedAt: toDatetimeLocalValue(row.received_at),
    receivedBy: row.received_by || "",
    appointmentDate: row.appointment_date || "",
    workStartDate: row.work_start_date || "",
    workCloseDate: row.work_close_date || "",
    remark: row.remark || "",
  };
}

function stateToDbPayload(state) {
  return {
    status: state.status,
    support_type: state.supportType || null,
    reporter_name: state.reporterName || null,
    reporter_phone: state.reporterPhone || null,
    reporter_email: state.reporterEmail || null,
    preferred_callback_at: fromDatetimeLocalValue(state.preferredCallbackAt),
    symptom_description: state.symptomDescription || null,
    received_at: fromDatetimeLocalValue(state.receivedAt),
    received_by: state.receivedBy || null,
    appointment_date: state.appointmentDate || null,
    work_start_date: state.workStartDate || null,
    work_close_date: state.workCloseDate || null,
    remark: state.remark || null,
  };
}

export default function TicketDetail() {
  const navigate = useNavigate();
  const { code: id } = useParams();
  const isNew = id === "new";
  const toast = useToast();
  const { profile, session } = useAuth();

  const { data: ticket, error: loadError, loading, refetch } = useQuery(
    () => (isNew ? Promise.resolve(null) : getTicket(id)),
    [id]
  );
  const { data: projectOptions } = useQuery(() => (isNew ? listProjects() : Promise.resolve([])), [isNew]);

  const [activeTab, setActiveTab] = useState(isNew ? "request" : "customer");
  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [state, setState] = useState(BLANK_STATE);
  useUnsavedChangesWarning(isDirty);

  function goBack() {
    if (isDirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้จริงหรือไม่?")) return;
    navigate("/ticket");
  }

  useEffect(() => {
    if (ticket) setState(dbRowToState(ticket));
  }, [ticket]);

  function markDirty(updater) {
    setIsDirty(true);
    setState(updater);
  }

  const saverName = profile?.name || session?.user?.email || "ผู้ใช้งาน";

  async function handleSave() {
    setSaveError("");
    try {
      if (isNew) {
        if (!projectRef) {
          setSaveError("ต้องเลือก Project อ้างอิงก่อนบันทึก");
          toast.error("ต้องเลือก Project อ้างอิงก่อนบันทึก");
          return;
        }
        const created = await createTicket({
          ticket_code: `TK-${Date.now()}`,
          project_id: projectRef,
          submitted_by: session?.user?.id,
          ...stateToDbPayload(state),
        });
        setIsDirty(false);
        toast.success(`${saverName} ได้สร้าง Ticket ${created.ticket_code} แล้ว`);
        navigate(`/ticket/${created.id}`, { replace: true });
        return;
      }
      await updateTicket(id, stateToDbPayload(state));
      setIsDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      toast.success(`${saverName} ได้บันทึก Ticket ${ticket?.ticket_code} แล้ว`);
      refetch();
    } catch (err) {
      setSaveError(errMsg(err));
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบ Ticket ${ticket?.ticket_code} ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteTicket(id);
      toast.success(`ลบ Ticket ${ticket?.ticket_code} แล้ว`);
      navigate("/ticket");
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  const refProject = ticket
    ? {
        code: ticket.project?.project_number,
        name: ticket.project?.site?.name,
        customer: ticket.project?.customer?.display_name,
        phone: ticket.project?.customer?.phone,
      }
    : { code: "-", name: "-", customer: "-", phone: "-" };
  const linkedProjectId = ticket?.project?.id;

  function renderTab() {
    switch (activeTab) {
      case "customer": return <CustomerRefTab project={refProject} />;
      case "deviceInstall": return <DeviceInstallRefTab projectId={linkedProjectId} />;
      case "deviceDetail": return <DeviceDetailRefTab projectId={linkedProjectId} />;
      case "request": return <RequestIssueTab ticketId={isNew ? null : id} projectId={linkedProjectId} state={state} setState={markDirty} />;
      case "subcontractor": return <SubcontractorTab ticketId={isNew ? null : id} />;
      case "movement": return <StockMovementTab ticketId={isNew ? null : id} />;
      case "update": return <UpdateTab state={state} setState={markDirty} />;
      default: return null;
    }
  }

  if (!isNew && loading) {
    return <div className="text-center text-slate-400 py-20">กำลังโหลด...</div>;
  }
  if (!isNew && loadError) {
    return <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4">โหลด Ticket ไม่สำเร็จ: {errMsg(loadError)}</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            <button onClick={() => goBack()} className="hover:text-slate-900 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Ticket
            </button>
            <span>/</span>
            <span>{isNew ? "New Ticket" : "Edit Ticket"}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{isNew ? "Ticket ใหม่" : ticket?.ticket_code}</h1>
            <Pill tone={ticketStatusTone(state.status)}>{state.status}</Pill>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isDirty && <Pill tone="rose">มีการแก้ไขที่ยังไม่บันทึก</Pill>}
          {savedFlash && <Pill tone="green">บันทึกข้อมูลแล้ว ✓</Pill>}
          {saveError && <Pill tone="rose">{saveError}</Pill>}
          {!isNew && (
            <button onClick={handleDelete} title="ลบ Ticket นี้" className="p-2 rounded-xl text-rose-500 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => goBack()} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            ย้อนกลับ
          </button>
          <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm">
            <Save className="w-4 h-4" /> Save Data
          </button>
        </div>
      </div>

      {isNew && (
        <Card className="border-slate-300 dark:border-slate-500/30 p-4 mb-6">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Project อ้างอิง <span className="text-rose-500">*</span>
          </label>
          <select
            value={projectRef}
            onChange={(e) => setProjectRef(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">— ต้องเลือก Project ก่อนจึงเปิด Ticket ได้ —</option>
            {projectOptions?.map((p) => (
              <option key={p.id} value={p.id}>{p.project_number} — {p.site?.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1.5">Project ไม่จำเป็นต้องปิดงานแล้ว แค่มีอยู่ในระบบก็เปิด Ticket อ้างอิงได้ทันที</p>
        </Card>
      )}

      <StatusStepper steps={TICKET_STATUS_STEPS} currentIndex={Math.max(0, TICKET_STATUS_STEPS.indexOf(state.status))} />

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <div className="flex gap-1 overflow-x-auto bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-1.5 mb-4">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
          <Card className="p-6">
            {renderTab()}
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <CommentPanel entityType="ticket" entityId={isNew ? null : id} statusOptions={TICKET_STATUS_STEPS} />
        </div>
      </div>
    </div>
  );
}

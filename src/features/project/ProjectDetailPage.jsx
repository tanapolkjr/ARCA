import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  User, FileText, Package, Truck, CheckCircle2, DollarSign, Smartphone,
  ArrowLeft, Save, ChevronDown, ChevronRight, Clock, Trash2,
} from "lucide-react";
import { Pill, StatCard } from "../../components/ui/primitives.jsx";
import StatusStepper from "../../components/ui/StatusStepper.jsx";
import CommentPanel from "../../components/ui/CommentPanel.jsx";
import { AddCustomerModal, AddSiteModal } from "../../components/ui/ContactModals.jsx";
import {
  CustomerTab, SoInfoTab, DeviceInstallTab, InstallPeriodTab, DeviceDetailTab,
  PaymentPeriodTab, FileTab, AppDataTab,
} from "./ProjectTabs.jsx";
import { PROJECT_STATUS_STEPS, projectStatusTone } from "../../lib/mockData";
import { createCustomer, createSite } from "../../api/contacts.js";
import { getProject, createProject, updateProject, deleteProject, listDeviceInstall, listInstallJobs, listPaymentPeriods } from "../../api/projects.js";
import { useQuery } from "../../hooks/useQuery.js";
import { errMsg } from "../../lib/format.js";
import { useToast } from "../../hooks/useToast.jsx";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning.js";

const TABS = [
  { id: "customer", label: "Customer", icon: User },
  { id: "so", label: "SO Info", icon: FileText },
  { id: "deviceInstall", label: "Device Install", icon: Package },
  { id: "installPeriod", label: "Install Period", icon: Truck },
  { id: "deviceDetail", label: "Device Detail", icon: CheckCircle2 },
  { id: "payment", label: "Payment Period", icon: DollarSign },
  { id: "file", label: "File", icon: FileText },
  { id: "appData", label: "App Data", icon: Smartphone },
];

const BLANK_STATE = {
  projectNumber: "", projectType: "Install", productCategory: "", projectSource: "", paymentVerificationRequired: false,
  salesman: "", salesman_id: null,
  site: "", site_id: null, customer: "", customer_id: null,
  projectContact: "", tel: "", address: "", province: "", googleMap: "",
  houseNumber: "", gpsLat: "", gpsLng: "", plan: "",
  estimatedInstallation: "", installationDate: "", deliveryDue: "", shippedDate: "",
  warrantyMonths: 6,
  status: "New Request",
};

function dbRowToState(row) {
  return {
    projectNumber: row.project_number,
    projectType: row.project_type,
    productCategory: row.product_category || "",
    projectSource: row.project_source || "",
    paymentVerificationRequired: !!row.payment_verification_required,
    salesman: "",
    salesman_id: row.salesman_id,
    site: row.site?.name || "",
    site_id: row.site_id,
    customer: row.customer?.display_name || "",
    customer_id: row.customer_id,
    projectContact: row.project_contact || "",
    tel: row.tel || "",
    address: row.address || "",
    province: row.province || "",
    googleMap: row.google_map || "",
    houseNumber: row.house_number || "",
    gpsLat: row.gps_lat ?? "",
    gpsLng: row.gps_lng ?? "",
    plan: row.plan || "",
    estimatedInstallation: row.estimated_installation || "",
    installationDate: row.installation_date || "",
    deliveryDue: row.delivery_due || "",
    shippedDate: row.shipped_date || "",
    warrantyMonths: row.warranty_months ?? 6,
    status: row.status,
  };
}

function stateToDbPayload(state) {
  return {
    project_number: state.projectNumber,
    project_type: state.projectType,
    product_category: state.productCategory || null,
    project_source: state.projectSource || null,
    payment_verification_required: !!state.paymentVerificationRequired,
    salesman_id: state.salesman_id || null,
    site_id: state.site_id || null,
    customer_id: state.customer_id || null,
    project_contact: state.projectContact || null,
    tel: state.tel || null,
    address: state.address || null,
    province: state.province || null,
    google_map: state.googleMap || null,
    house_number: state.houseNumber || null,
    gps_lat: state.gpsLat === "" ? null : state.gpsLat,
    gps_lng: state.gpsLng === "" ? null : state.gpsLng,
    plan: state.plan || null,
    estimated_installation: state.estimatedInstallation || null,
    installation_date: state.installationDate || null,
    delivery_due: state.deliveryDue || null,
    shipped_date: state.shippedDate || null,
    warranty_months: state.warrantyMonths || null,
    status: state.status,
  };
}

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { code: id } = useParams();
  const isNew = id === "new";
  const toast = useToast();
  const { profile, session } = useAuth();

  const { data: project, error: loadError, loading, refetch } = useQuery(
    () => (isNew ? Promise.resolve(null) : getProject(id)),
    [id]
  );

  const [activeTab, setActiveTab] = useState("customer");
  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [prefillName, setPrefillName] = useState("");
  const [showOverview, setShowOverview] = useState(true);
  const [state, setState] = useState(BLANK_STATE);
  useUnsavedChangesWarning(isDirty);

  function goBack() {
    if (isDirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้จริงหรือไม่?")) return;
    navigate("/project");
  }

  useEffect(() => {
    if (project) setState(dbRowToState(project));
  }, [project]);

  function markDirty(updater) {
    setIsDirty(true);
    setState(updater);
  }

  const saverName = profile?.name || session?.user?.email || "ผู้ใช้งาน";

  async function handleSave() {
    setSaveError("");
    try {
      if (isNew) {
        const created = await createProject(stateToDbPayload(state));
        setIsDirty(false);
        toast.success(`${saverName} ได้บันทึกโปรเจค ${created.project_number} แล้ว`);
        navigate(`/project/${created.id}`, { replace: true });
        return;
      }
      await updateProject(id, stateToDbPayload(state));
      setIsDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      toast.success(`${saverName} ได้บันทึกโปรเจค ${state.projectNumber} แล้ว`);
      refetch();
    } catch (err) {
      setSaveError(errMsg(err));
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  // Delete is allowed while status is still New Request/Request Submitted;
  // once past that, RLS itself blocks anyone who isn't Manager/Super Admin
  // (see 0005_fixes2.sql) — this is enforced at the database level, not
  // just hidden in the UI.
  async function handleDelete() {
    if (!window.confirm(`ลบโปรเจค ${state.projectNumber} ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteProject(id);
      toast.success(`ลบโปรเจค ${state.projectNumber} แล้ว`);
      navigate("/project");
    } catch (err) {
      const msg = errMsg(err);
      if (/row-level security|permission denied|policy/i.test(msg)) {
        toast.error("ลบไม่ได้ — โปรเจคนี้เลยสถานะ Request Submitted แล้ว ต้องให้ Manager หรือ Super Admin เป็นผู้ลบเท่านั้น");
      } else {
        toast.error("ลบไม่สำเร็จ: " + msg);
      }
    }
  }

  const { data: deviceInstallRows } = useQuery(() => (isNew ? Promise.resolve([]) : listDeviceInstall(id)), [id, isNew]);
  const { data: installJobs } = useQuery(() => (isNew ? Promise.resolve([]) : listInstallJobs(id)), [id, isNew]);
  const { data: paymentRows } = useQuery(() => (isNew ? Promise.resolve([]) : listPaymentPeriods(id)), [id, isNew]);

  const plannedTotal = (deviceInstallRows || []).reduce((s, r) => s + (r.planned_qty || 0), 0);
  const withdrawnTotal = (deviceInstallRows || []).reduce((s, r) => s + (r.withdrawn_qty || 0), 0);
  const paymentTotal = (paymentRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const paymentReceived = (paymentRows || []).reduce((s, r) => s + (Number(r.received_amount) || 0), 0);
  const daysToInstall = state.installationDate
    ? Math.ceil((new Date(state.installationDate).getTime() - Date.now()) / 86400000)
    : null;
  const isInstallCompleted = state.status === "Installation Completed";

  const stats = [
    {
      icon: Package, label: "Devices Planned",
      value: `${plannedTotal} ชิ้น`,
      sub: `เบิกแล้ว ${withdrawnTotal}/${plannedTotal}`,
      subColor: withdrawnTotal >= plannedTotal && plannedTotal > 0 ? "text-emerald-500" : "text-amber-500",
      chip: "bg-indigo-500",
    },
    {
      icon: Truck, label: "Install Jobs",
      value: `${(installJobs || []).length} รอบ`,
      sub: (installJobs || []).length > 0 ? "เบิกสินค้าแล้ว" : "ยังไม่มีการเบิก",
      subColor: "text-slate-400",
      chip: "bg-blue-500",
    },
    {
      icon: DollarSign, label: "Payment Collected",
      value: `฿${paymentReceived.toLocaleString()}`,
      sub: `จาก ฿${paymentTotal.toLocaleString()}`,
      subColor: paymentReceived >= paymentTotal && paymentTotal > 0 ? "text-emerald-500" : "text-amber-500",
      chip: "bg-teal-500",
    },
    {
      icon: isInstallCompleted ? CheckCircle2 : Clock, label: "Days to Install",
      value: isInstallCompleted ? "เสร็จสิ้นแล้ว" : daysToInstall === null ? "-" : daysToInstall < 0 ? `เลย ${Math.abs(daysToInstall)} วัน` : `${daysToInstall} วัน`,
      sub: isInstallCompleted ? "Project Completed" : state.installationDate ? `กำหนด ${state.installationDate}` : "ยังไม่กำหนดวัน",
      subColor: isInstallCompleted ? "text-emerald-500" : daysToInstall !== null && daysToInstall < 0 ? "text-rose-500" : "text-slate-400",
      chip: isInstallCompleted ? "bg-emerald-500" : "bg-orange-500",
    },
  ];

  function renderTab() {
    if (isNew && activeTab !== "customer") {
      return (
        <div className="text-center py-16">
          <p className="text-sm text-slate-400">บันทึกข้อมูลแท็บ Customer ก่อน (กด Save Data) จึงจะเปิดแท็บนี้ได้</p>
        </div>
      );
    }
    switch (activeTab) {
      case "customer":
        return (
          <CustomerTab
            state={state}
            setState={markDirty}
            openCustomerModal={(q) => { setPrefillName(q || ""); setShowCustomerModal(true); }}
            openSiteModal={(q) => { setPrefillName(q || ""); setShowSiteModal(true); }}
          />
        );
      case "so": return <SoInfoTab projectId={id} />;
      case "deviceInstall": return <DeviceInstallTab projectId={id} />;
      case "installPeriod": return <InstallPeriodTab projectId={id} warrantyMonths={state.warrantyMonths} />;
      case "deviceDetail": return <DeviceDetailTab projectId={id} />;
      case "payment": return <PaymentPeriodTab projectId={id} />;
      case "file": return <FileTab projectId={id} projectNumber={state.projectNumber} />;
      case "appData": return <AppDataTab projectId={id} />;
      default: return null;
    }
  }

  if (!isNew && loading) {
    return <div className="text-center text-slate-400 py-20">กำลังโหลด...</div>;
  }
  if (!isNew && loadError) {
    return <div className="bg-rose-50 text-rose-600 text-sm rounded-xl p-4">โหลด Project ไม่สำเร็จ: {errMsg(loadError)}</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            <button onClick={() => goBack()} className="hover:text-indigo-600 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Install
            </button>
            <span>/</span>
            <span>{isNew ? "New Project" : "Edit Project"}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{state.projectNumber || "Project ใหม่"}</h1>
            <Pill tone="indigo">{state.projectType}</Pill>
            <Pill tone={projectStatusTone(state.status)}>{state.status}</Pill>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isDirty && <Pill tone="rose">มีการแก้ไขที่ยังไม่บันทึก</Pill>}
          {savedFlash && <Pill tone="green">บันทึกข้อมูลแล้ว ✓</Pill>}
          {saveError && <Pill tone="rose">{saveError}</Pill>}
          {!isNew && (
            <button onClick={handleDelete} title="ลบโปรเจคนี้" className="p-2 rounded-xl text-rose-500 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => goBack()} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            ย้อนกลับ
          </button>
          <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
            <Save className="w-4 h-4" /> Save Data
          </button>
        </div>
      </div>

      <button
        onClick={() => setShowOverview((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-indigo-600 uppercase tracking-wide mb-2.5"
      >
        {showOverview ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        ภาพรวมโปรเจค (Dashboard & Status)
      </button>

      {showOverview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((s) => <StatCard key={s.label} {...s} />)}
          </div>
          <StatusStepper steps={PROJECT_STATUS_STEPS} currentIndex={Math.max(0, PROJECT_STATUS_STEPS.indexOf(state.status))} />
        </>
      )}

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
                    active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            {renderTab()}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <CommentPanel entityType="project" entityId={isNew ? null : id} statusOptions={PROJECT_STATUS_STEPS} />
        </div>
      </div>

      {showCustomerModal && (
        <AddCustomerModal
          initialName={prefillName}
          onClose={() => setShowCustomerModal(false)}
          onSave={async (payload) => {
            try {
              const created = await createCustomer(payload);
              markDirty((s) => ({ ...s, customer: created.display_name, customer_id: created.id }));
              toast.success(`สร้างลูกค้า "${created.display_name}" แล้ว`);
            } catch (err) {
              toast.error("สร้างลูกค้าไม่สำเร็จ: " + errMsg(err));
            } finally {
              setShowCustomerModal(false);
            }
          }}
        />
      )}
      {showSiteModal && (
        <AddSiteModal
          initialName={prefillName}
          onClose={() => setShowSiteModal(false)}
          onSave={async (payload) => {
            try {
              const created = await createSite(payload);
              markDirty((s) => ({
                ...s,
                site: created.name,
                site_id: created.id,
                address: created.address,
                province: created.province,
                googleMap: created.google_map,
              }));
              toast.success(`สร้างโครงการ "${created.name}" แล้ว`);
            } catch (err) {
              toast.error("สร้างโครงการไม่สำเร็จ: " + errMsg(err));
            } finally {
              setShowSiteModal(false);
            }
          }}
        />
      )}
    </div>
  );
}

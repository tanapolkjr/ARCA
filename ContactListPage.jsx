import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users, Building2, MapPin, Trash2 } from "lucide-react";
import { Pill, Card } from "../../components/ui/primitives.jsx";
import { AddCustomerModal, AddSiteModal } from "../../components/ui/ContactModals.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listContacts, createCustomer, listSites, createSite, deleteCustomer, deleteSite } from "../../api/contacts.js";
import { useToast } from "../../hooks/useToast.jsx";
import { VendorsPanel } from "../accounting/VendorsPage";
import { errMsg } from "../../lib/format.js";

export default function ContactList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState("customer"); // "customer" | "project" | "vendor"
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [query, setQuery] = useState("");

  const { data: customers, error: customerError, loading: customerLoading, refetch: refetchCustomers } = useQuery(
    () => listContacts({ query }), [query, tab]
  );
  const { data: sites, error: siteError, loading: siteLoading, refetch: refetchSites } = useQuery(
    () => listSites(query), [query, tab]
  );

  async function handleCreateCustomer(payload) {
    try {
      await createCustomer(payload);
      toast.success(`เพิ่ม "${payload.display_name}" แล้ว`);
      setShowCustomerModal(false);
      refetchCustomers();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleCreateSite(payload) {
    try {
      await createSite(payload);
      toast.success(`เพิ่มโครงการ "${payload.name}" แล้ว`);
      setShowSiteModal(false);
      refetchSites();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDeleteCustomer(e, c) {
    e.stopPropagation();
    if (!window.confirm(`ลบ "${c.display_name}" หรือไม่?`)) return;
    try {
      await deleteCustomer(c.id);
      toast.success(`ลบ "${c.display_name}" แล้ว`);
      refetchCustomers();
    } catch (err) {
      const msg = errMsg(err);
      if (/foreign key|violates|referenced/i.test(msg)) {
        toast.error(`ลบไม่ได้ — "${c.display_name}" มี Project ผูกอยู่แล้ว`);
      } else {
        toast.error("ลบไม่สำเร็จ: " + msg);
      }
    }
  }

  async function handleDeleteSite(e, s) {
    e.stopPropagation();
    if (!window.confirm(`ลบโครงการ "${s.name}" หรือไม่?`)) return;
    try {
      await deleteSite(s.id);
      toast.success(`ลบโครงการ "${s.name}" แล้ว`);
      refetchSites();
    } catch (err) {
      const msg = errMsg(err);
      if (/foreign key|violates|referenced/i.test(msg)) {
        toast.error(`ลบไม่ได้ — โครงการ "${s.name}" มี Project ผูกอยู่แล้ว`);
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
            <span>E-Service</span><span>/</span><span className="text-indigo-600 font-medium">Contact</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Contact — ฐานข้อมูลคู่ค้า</h1>
        </div>
        {tab === "vendor" ? null : tab === "customer" ? (
          <button onClick={() => setShowCustomerModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
            <Plus className="w-4 h-4" /> เพิ่มลูกค้า/บริษัท
          </button>
        ) : (
          <button onClick={() => setShowSiteModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
            <Plus className="w-4 h-4" /> เพิ่มโครงการ
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-1.5 mb-5 w-fit">
        <button
          onClick={() => setTab("customer")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "customer" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
        >
          <Users className="w-3.5 h-3.5" /> Customer
        </button>
        <button
          onClick={() => setTab("project")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "project" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
        >
          <MapPin className="w-3.5 h-3.5" /> Project (Project Name)
        </button>
        <button
          onClick={() => setTab("vendor")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "vendor" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
        >
          <Building className="w-3.5 h-3.5" /> ผู้ขาย / ผู้รับเหมา
        </button>
      </div>

      <div className={`relative mb-5 ${tab === "vendor" ? "hidden" : ""}`}>
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "customer" ? "ค้นหาชื่อลูกค้า/บริษัท..." : "ค้นหาชื่อโครงการ..."}
          className="w-full max-w-md pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {tab === "vendor" ? (
        <VendorsPanel />
      ) : tab === "customer" ? (
        <>
          {customerError && <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(customerError)}</div>}
          {customerLoading && <div className="text-center text-slate-400 py-10">กำลังโหลด...</div>}
          {!customerLoading && customers?.length === 0 && <div className="text-center text-slate-400 py-10">ยังไม่มีข้อมูลลูกค้า</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customers?.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/contact/customer/${c.id}`)}
                className="relative text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 hover:border-indigo-200 transition-colors cursor-pointer"
              >
                <button
                  onClick={(e) => handleDeleteCustomer(e, c)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 z-10"
                  title="ลบ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex items-start justify-between mb-3 pr-6">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${c.customer_type === "company" ? "bg-indigo-500" : "bg-teal-500"}`}>
                    {c.customer_type === "company" ? <Building2 className="w-5 h-5 text-white" /> : <Users className="w-5 h-5 text-white" />}
                  </div>
                  <Pill tone={c.customer_type === "company" ? "indigo" : "green"}>{c.customer_type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}</Pill>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{c.display_name}</h3>
                <p className="text-sm text-slate-500 mb-3">{c.phone || "-"}</p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{c.contacts?.length ?? 0} Key Contact</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {siteError && <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(siteError)}</div>}
          {siteLoading && <div className="text-center text-slate-400 py-10">กำลังโหลด...</div>}
          {!siteLoading && sites?.length === 0 && <div className="text-center text-slate-400 py-10">ยังไม่มีโครงการ — สร้างได้ที่นี่ หรือจะสร้างจากหน้า Project ก็ได้</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites?.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/contact/site/${s.id}`)}
                className="relative text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 hover:border-indigo-200 transition-colors cursor-pointer"
              >
                <button
                  onClick={(e) => handleDeleteSite(e, s)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 z-10"
                  title="ลบ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex items-start justify-between mb-3 pr-6">
                  <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <Pill tone="slate">{s.province || "-"}</Pill>
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{s.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2">{s.address || "-"}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {showCustomerModal && <AddCustomerModal onClose={() => setShowCustomerModal(false)} onSave={handleCreateCustomer} />}
      {showSiteModal && <AddSiteModal onClose={() => setShowSiteModal(false)} onSave={handleCreateSite} />}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { Card, Field, TextInput, TextArea, Pill } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { getCustomer, updateCustomer, addCustomerContact, deleteCustomer } from "../../api/contacts.js";
import { listProjectsForCustomer } from "../../api/projects.js";
import { projectStatusTone } from "../../lib/mockData";
import { useToast } from "../../hooks/useToast.jsx";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning.js";
import { errMsg } from "../../lib/format.js";

export default function CustomerDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const { data: customer, loading, error: loadError, refetch } = useQuery(() => getCustomer(id), [id]);
  const { data: linkedProjects } = useQuery(() => listProjectsForCustomer(id), [id]);

  const [form, setForm] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", position: "", phone: "", email: "" });
  const [addingContact, setAddingContact] = useState(false);
  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (customer) {
      setForm({
        customer_type: customer.customer_type,
        first_name: customer.first_name || "", last_name: customer.last_name || "",
        company_name: customer.company_name || "", tax_id: customer.tax_id || "",
        phone: customer.phone || "", email: customer.email || "",
        address: customer.address || "", province: customer.province || "",
        card_id: customer.card_id || "", office_address: customer.office_address || "",
        billing_address: customer.billing_address || "",
      });
    }
  }, [customer]);

  function set(field, value) {
    setIsDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  }

  function goBack() {
    if (isDirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้จริงหรือไม่?")) return;
    navigate("/contact");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const displayName = form.customer_type === "individual" ? `${form.first_name} ${form.last_name}`.trim() : form.company_name;
      await updateCustomer(id, {
        display_name: displayName || customer.display_name,
        first_name: form.first_name || null, last_name: form.last_name || null,
        company_name: form.company_name || null, tax_id: form.tax_id || null,
        phone: form.phone || null, email: form.email || null,
        address: form.address || null, province: form.province || null,
        card_id: form.card_id || null, office_address: form.office_address || null,
        billing_address: form.billing_address || null,
      });
      setIsDirty(false);
      toast.success(`บันทึก "${displayName}" แล้ว`);
      refetch();
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddContact() {
    if (!newContact.name.trim()) {
      toast.error("กรอกชื่อผู้ติดต่อก่อน");
      return;
    }
    setAddingContact(true);
    try {
      await addCustomerContact(id, newContact);
      toast.success("เพิ่มผู้ติดต่อแล้ว");
      setNewContact({ name: "", position: "", phone: "", email: "" });
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setAddingContact(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบ "${customer.display_name}" ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteCustomer(id);
      toast.success(`ลบ "${customer.display_name}" แล้ว`);
      navigate("/contact");
    } catch (err) {
      const msg = errMsg(err);
      if (/foreign key|violates|referenced/i.test(msg)) {
        toast.error(`ลบไม่ได้ — ลูกค้านี้มี Project ผูกอยู่แล้ว`);
      } else {
        toast.error("ลบไม่สำเร็จ: " + msg);
      }
    }
  }

  if (loading || !form) return <div className="text-center text-slate-400 py-20">กำลังโหลด...</div>;
  if (loadError) return <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4">โหลดไม่สำเร็จ: {errMsg(loadError)}</div>;

  const isCompany = form.customer_type === "company";

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-900 mb-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Contact
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{customer.display_name}</h1>
            <Pill tone={isCompany ? "indigo" : "green"}>{isCompany ? "นิติบุคคล" : "บุคคลธรรมดา"}</Pill>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isDirty && <Pill tone="rose">มีการแก้ไขที่ยังไม่บันทึก</Pill>}
          <button onClick={handleDelete} title="ลบลูกค้ารายนี้" className="p-2 rounded-xl text-rose-500 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={goBack} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">ย้อนกลับ</button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? "กำลังบันทึก..." : "Save Data"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-5">
          <Card className="p-6">
            {isCompany ? (
              <div className="grid grid-cols-2 gap-x-5">
                <div className="col-span-2"><Field label="ชื่อบริษัท" required><TextInput value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field></div>
                <Field label="เลขผู้เสียภาษี"><TextInput value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} /></Field>
                <Field label="เบอร์กลาง"><TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <div className="col-span-2"><Field label="ที่ตั้งสำนักงาน"><TextArea rows={2} value={form.office_address} onChange={(e) => set("office_address", e.target.value)} /></Field></div>
                <div className="col-span-2"><Field label="ที่อยู่วางบิล"><TextArea rows={2} value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} /></Field></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-5">
                <Field label="First Name" required><TextInput value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
                <Field label="Last Name" required><TextInput value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
                <Field label="Phone"><TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Email"><TextInput value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <div className="col-span-2"><Field label="Address"><TextArea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field></div>
                <Field label="Province"><TextInput value={form.province} onChange={(e) => set("province", e.target.value)} /></Field>
                <Field label="Card ID"><TextInput value={form.card_id} onChange={(e) => set("card_id", e.target.value)} /></Field>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Key Contacts</h3>
            <div className="space-y-2 mb-4">
              {(customer.contacts || []).length === 0 && <p className="text-sm text-slate-400">ยังไม่มีผู้ติดต่อ</p>}
              {customer.contacts?.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name} {c.position && <span className="text-slate-400 font-normal">({c.position})</span>}</p>
                    <p className="text-xs text-slate-400">{c.phone} {c.email && `• ${c.email}`}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 items-end">
              <TextInput placeholder="ชื่อ" value={newContact.name} onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))} />
              <TextInput placeholder="ตำแหน่ง" value={newContact.position} onChange={(e) => setNewContact((c) => ({ ...c, position: e.target.value }))} />
              <TextInput placeholder="เบอร์โทร" value={newContact.phone} onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))} />
              <button onClick={handleAddContact} disabled={addingContact} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
                <Plus className="w-4 h-4" /> เพิ่ม
              </button>
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Project ของลูกค้านี้</h3>
            {(!linkedProjects || linkedProjects.length === 0) && <p className="text-sm text-slate-400">ยังไม่มี Project</p>}
            <div className="space-y-2">
              {linkedProjects?.map((p) => (
                <button key={p.id} onClick={() => navigate(`/project/${p.id}`)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-left">
                  <span className="text-sm font-medium text-slate-900">{p.project_number}</span>
                  <Pill tone={projectStatusTone(p.status)}>{p.status}</Pill>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

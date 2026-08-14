import React, { useState } from "react";
import { Modal, Field, TextInput, TextArea } from "./primitives.jsx";

export function AddCustomerModal({ onClose, onSave, initialName = "" }) {
  const [type, setType] = useState("individual");
  const [form, setForm] = useState({
    firstName: initialName, lastName: "", phone: "", email: "", address: "", province: "", cardId: "",
    companyName: initialName, taxId: "", centralPhone: "", officeAddress: "", billingAddress: "",
  });

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSave() {
    const displayName = type === "individual" ? `${form.firstName} ${form.lastName}`.trim() : form.companyName;
    const payload = {
      customer_type: type,
      display_name: displayName || (type === "individual" ? "ลูกค้าใหม่" : "บริษัทใหม่ จำกัด"),
      first_name: form.firstName || null,
      last_name: form.lastName || null,
      phone: type === "individual" ? form.phone : form.centralPhone,
      email: form.email || null,
      address: form.address || null,
      province: form.province || null,
      card_id: form.cardId || null,
      company_name: form.companyName || null,
      tax_id: form.taxId || null,
      office_address: form.officeAddress || null,
      billing_address: form.billingAddress || null,
    };
    onSave(payload);
  }

  return (
    <Modal title="เพิ่มลูกค้าใหม่ (Add Customer)" onClose={onClose}>
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setType("individual")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
            type === "individual" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          บุคคลธรรมดา
        </button>
        <button
          onClick={() => setType("company")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
            type === "company" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          นิติบุคคล
        </button>
      </div>

      {type === "individual" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" required><TextInput placeholder="ชื่อจริง" value={form.firstName} onChange={set("firstName")} /></Field>
          <Field label="Last Name" required><TextInput placeholder="นามสกุล" value={form.lastName} onChange={set("lastName")} /></Field>
          <Field label="Phone" required><TextInput placeholder="08x-xxx-xxxx" value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><TextInput placeholder="name@email.com" value={form.email} onChange={set("email")} /></Field>
          <div className="col-span-2">
            <Field label="Address" required><TextArea rows={2} value={form.address} onChange={set("address")} /></Field>
          </div>
          <Field label="Province" required><TextInput placeholder="กรุงเทพมหานคร" value={form.province} onChange={set("province")} /></Field>
          <Field label="Card ID"><TextInput placeholder="เลขบัตรประชาชน" value={form.cardId} onChange={set("cardId")} /></Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="ชื่อบริษัท" required>
              <TextInput placeholder="บริษัท ... จำกัด" value={form.companyName} onChange={set("companyName")} />
            </Field>
          </div>
          <Field label="เลขผู้เสียภาษี"><TextInput placeholder="0-0000-00000-00-0" value={form.taxId} onChange={set("taxId")} /></Field>
          <Field label="เบอร์กลาง"><TextInput placeholder="02-xxx-xxxx" value={form.centralPhone} onChange={set("centralPhone")} /></Field>
          <div className="col-span-2">
            <Field label="ที่ตั้งสำนักงาน" required><TextArea rows={2} value={form.officeAddress} onChange={set("officeAddress")} /></Field>
          </div>
          <div className="col-span-2">
            <Field label="ที่อยู่วางบิล (แยกจากที่ตั้งสำนักงาน)"><TextArea rows={2} value={form.billingAddress} onChange={set("billingAddress")} /></Field>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
          ยกเลิก
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
        >
          บันทึกและใช้งาน
        </button>
      </div>
    </Modal>
  );
}

export function AddSiteModal({ onClose, onSave, initialName = "" }) {
  const [form, setForm] = useState({ name: initialName, address: "", province: "", googleMap: "" });
  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function handleSave() {
    onSave({
      name: form.name || "โครงการใหม่",
      address: form.address || null,
      province: form.province || null,
      google_map: form.googleMap || null,
    });
  }
  return (
    <Modal title="เพิ่มโครงการ/สถานที่ใหม่ (Add Site)" onClose={onClose}>
      <Field label="ชื่อโครงการ" required>
        <TextInput placeholder="เช่น ชื่อหมู่บ้าน/คอนโด" value={form.name} onChange={set("name")} />
      </Field>
      <Field label="ที่อยู่" required><TextArea rows={2} value={form.address} onChange={set("address")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="จังหวัด" required><TextInput placeholder="จังหวัด" value={form.province} onChange={set("province")} /></Field>
        <Field label="Google Map"><TextInput placeholder="ลิงก์ Google Map" value={form.googleMap} onChange={set("googleMap")} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
          ยกเลิก
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
        >
          บันทึกและใช้งาน
        </button>
      </div>
    </Modal>
  );
}

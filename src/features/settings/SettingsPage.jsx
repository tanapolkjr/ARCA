import React, { useState } from "react";
import { Users, Boxes, Plus, ShieldAlert } from "lucide-react";
import { Card, Select, TextInput, Field, Modal, Pill } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listUsers, updateUserRole } from "../../api/users.js";
import { listLocations, createStockLocation } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const ROLES = ["Super Admin", "Manager", "Sale", "PM", "Admin", "Store"];

function AddLocationModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("คลังสาขา");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createStockLocation({ name, location_type: type });
      toast.success(`สร้างคลัง "${name}" แล้ว`);
      onCreated();
    } catch (err) {
      toast.error("สร้างคลังไม่สำเร็จ (สิทธิ์นี้จำกัดเฉพาะ Manager/Store): " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="เพิ่มคลังสินค้าใหม่" onClose={onClose}>
      <Field label="ชื่อคลัง" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น คลังสาขาชลบุรี" />
      </Field>
      <Field label="ประเภทคลัง">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option>คลังหลัก</option>
          <option>คลังสาขา</option>
          <option>คลังช่างหน้างาน</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : "สร้างคลัง"}
        </button>
      </div>
    </Modal>
  );
}

function UserRoleSection() {
  const { data: users, loading, refetch } = useQuery(() => listUsers(), []);
  const { profile } = useAuth();
  const toast = useToast();
  const canEdit = profile?.role === "Super Admin";

  async function handleRoleChange(userId, role) {
    try {
      await updateUserRole(userId, role);
      toast.success("เปลี่ยน Role แล้ว");
      refetch();
    } catch (err) {
      toast.error("เปลี่ยน Role ไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">User & Role Management</h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        สร้างบัญชีผู้ใช้งานใหม่ทำได้ที่ Supabase Dashboard เท่านั้น (ไม่มีหน้าสมัครสมาชิกเองในเว็บนี้) — หน้านี้ใช้กำหนด Role ให้แต่ละคนตาม Permission Matrix
      </p>
      {!canEdit && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 mb-3">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> เฉพาะ Super Admin เท่านั้นที่แก้ Role ได้ — บัญชีคุณดูได้อย่างเดียว
        </div>
      )}
      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{u.name || "(ยังไม่ตั้งชื่อ)"}</p>
              <p className="text-xs text-slate-400">{u.email}</p>
            </div>
            {canEdit ? (
              <select
                value={u.role}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5"
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            ) : (
              <Pill tone="indigo">{u.role}</Pill>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function LocationSection() {
  const { data: locations, loading, refetch } = useQuery(() => listLocations(), []);
  const [showModal, setShowModal] = useState(false);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">คลังสินค้า (Stock Locations)</h3>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
          <Plus className="w-4 h-4" /> เพิ่มคลัง
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">จำกัดสิทธิ์สร้าง/แก้ไข เฉพาะ Role Manager และ Store ตามสเปค</p>
      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {locations?.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{l.name}</span>
            <Pill tone="slate">{l.location_type}</Pill>
          </div>
        ))}
        {!loading && locations?.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีคลังสินค้า</p>}
      </div>
      {showModal && <AddLocationModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); refetch(); }} />}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-1">การตั้งค่า</h1>
      <p className="text-sm text-slate-400 mb-6">จัดการสิทธิ์ผู้ใช้งานและค่าตั้งต้นของระบบ ARCA</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <UserRoleSection />
        <LocationSection />
      </div>
    </div>
  );
}

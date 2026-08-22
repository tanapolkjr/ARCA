import React, { useState } from "react";
import { Users, Boxes, Plus, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { Card, Select, TextInput, Field, Modal, Pill } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listUsers, updateUserRole } from "../../api/users.js";
import { listLocations, createStockLocation, updateStockLocation, deleteStockLocation } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const ROLES = ["Super Admin", "Manager", "Sale", "PM", "Admin", "Store"];

/**
 * สร้าง/แก้ไขคลังสินค้า
 * `location` เป็น null = สร้างใหม่ ไม่งั้นคือแก้คลังนั้น
 * ใช้ตัวเดียวกันทั้งสองโหมด ฟอร์มจะได้ไม่หลุดกัน
 */
function LocationModal({ location, onClose, onSaved }) {
  const editing = Boolean(location);
  const [f, setF] = useState({
    name: location?.name ?? "",
    location_type: location?.location_type ?? "คลังสาขา",
    address: location?.address ?? "",
    phone: location?.phone ?? "",
    note: location?.note ?? "",
    is_active: location?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!f.name.trim()) { toast.error("ใส่ชื่อคลังก่อน"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateStockLocation(location.id, f);
        toast.success(`บันทึกคลัง "${f.name}" แล้ว`);
      } else {
        await createStockLocation(f);
        toast.success(`สร้างคลัง "${f.name}" แล้ว`);
      }
      onSaved();
    } catch (err) {
      const msg = errMsg(err);
      toast.error(
        /duplicate|unique/i.test(msg)
          ? `มีคลังชื่อ "${f.name}" อยู่แล้ว`
          : (editing ? "บันทึกไม่สำเร็จ: " : "สร้างคลังไม่สำเร็จ (สิทธิ์เฉพาะ Manager/Store): ") + msg
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `แก้ไขคลัง — ${location.name}` : "เพิ่มคลังสินค้าใหม่"} onClose={onClose}>
      <Field label="ชื่อคลัง" required>
        <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น คลังสาขาชลบุรี" />
      </Field>
      <Field label="ประเภทคลัง">
        <Select value={f.location_type} onChange={(e) => set("location_type", e.target.value)}>
          <option>คลังหลัก</option>
          <option>คลังสาขา</option>
          <option>คลังช่างหน้างาน</option>
        </Select>
      </Field>
      <Field label="ที่อยู่">
        <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="เบอร์ติดต่อ">
        <TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="หมายเหตุ">
        <TextInput value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น ผู้ดูแลคลัง / เวลาเปิด-ปิด" />
      </Field>
      {editing && (
        <Field label="สถานะ">
          <Select value={f.is_active ? "y" : "n"} onChange={(e) => set("is_active", e.target.value === "y")}>
            <option value="y">ใช้งาน</option>
            <option value="n">ปิดใช้งาน</option>
          </Select>
        </Field>
      )}
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : editing ? "บันทึก" : "สร้างคลัง"}
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
  const [editLocation, setEditLocation] = useState(null);
  const toast = useToast();

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
      <p className="text-xs text-slate-400 mb-4">จำกัดสิทธิ์สร้าง/แก้ไข เฉพาะ Role Manager และ Store · คลังที่เคยมีการเคลื่อนไหวสินค้าลบไม่ได้ ให้ปิดใช้งานแทน</p>
      {loading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {locations?.map((l) => (
          <div key={l.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{l.name}</span>
                {l.is_active === false && <Pill tone="slate">ปิดใช้งาน</Pill>}
              </div>
              {(l.address || l.phone || l.note) && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {[l.address, l.phone, l.note].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Pill tone="slate">{l.location_type}</Pill>
              <button onClick={() => setEditLocation(l)} title="แก้ไขคลัง"
                      className="p-1.5 text-slate-400 hover:text-indigo-600">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                title="ลบคลัง"
                onClick={async () => {
                  try {
                    await deleteStockLocation(l.id);
                    toast.success("ลบคลังแล้ว");
                    refetch();
                  } catch (err) {
                    toast.error(errMsg(err));
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {!loading && locations?.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีคลังสินค้า</p>}
      </div>
      {showModal && (
        <LocationModal location={null} onClose={() => setShowModal(false)}
                       onSaved={() => { setShowModal(false); refetch(); }} />
      )}
      {editLocation && (
        <LocationModal location={editLocation} onClose={() => setEditLocation(null)}
                       onSaved={() => { setEditLocation(null); refetch(); }} />
      )}
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

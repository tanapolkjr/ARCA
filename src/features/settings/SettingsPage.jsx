import React, { useState } from "react";
import { Users, Boxes, Plus, Pencil, Phone, ShieldAlert, Trash2, PenLine, BadgeCheck } from "lucide-react";
import { Card, Select, TextInput, Field, Modal, Pill } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listUsers, updateUserRole, updateUserProfile } from "../../api/users.js";
import { listLocations, createStockLocation, updateStockLocation, deleteStockLocation } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";
import { SignatureField } from "./SignatureField";
import {
  listApprovers, saveApprover, uploadApproverSignature, clearApproverSignature,
} from "../../accounting-api/approvers";

const ROLES = ["Super Admin", "Manager", "Sale", "PM", "Admin", "Store"];

/**
 * สร้าง/แก้ไขคลังสินค้า
 * `location` เป็น null = สร้างใหม่ ไม่งั้นคือแก้คลังนั้น
 * ใช้ตัวเดียวกันทั้งสองโหมด ฟอร์มจะได้ไม่หลุดกัน
 */
/**
 * แก้ชื่อและเบอร์โทรของผู้ใช้
 * เบอร์นี้ถูกดึงไปพิมพ์ใต้ชื่อผู้ขายบนเอกสาร ลูกค้าจะได้โทรกลับหาเซลล์คนที่ออกใบให้
 */
function UserProfileModal({ user, onClose, onSaved, onSignatureChanged }) {
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  return (
    <Modal title={`แก้ไขผู้ใช้ — ${user.email}`} onClose={onClose}>
      <Field label="ชื่อที่แสดง" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="เบอร์โทร">
        <TextInput value={phone} placeholder="0811111111"
                   onChange={(e) => setPhone(e.target.value)} />
        <p className="text-xs text-stone-400 mt-1">
          ขึ้นบนใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี ใต้ชื่อผู้ขาย
        </p>
      </Field>
      <Field label="ลายเซ็น">
        <SignatureField userId={user.id} currentPath={user.signature_path ?? null} onChanged={onSignatureChanged} />
      </Field>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone-100 dark:border-stone-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">ยกเลิก</button>
        <button
          disabled={saving}
          onClick={async () => {
            if (!name.trim()) { toast.error("ใส่ชื่อก่อน"); return; }
            setSaving(true);
            try {
              await updateUserProfile(user.id, { name, phone });
              toast.success("บันทึกแล้ว");
              onSaved();
            } catch (err) {
              toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
            } finally { setSaving(false); }
          }}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-sm disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </Modal>
  );
}

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
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone-100 dark:border-stone-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
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
  const [editUser, setEditUser] = useState(null);

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
        <Users className="w-4 h-4 text-stone-600" />
        <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">User & Role Management</h3>
      </div>
      <p className="text-xs text-stone-400 mb-4">
        สร้างบัญชีผู้ใช้งานใหม่ทำได้ที่ Supabase Dashboard เท่านั้น (ไม่มีหน้าสมัครสมาชิกเองในเว็บนี้) — หน้านี้ใช้กำหนด Role ให้แต่ละคนตาม Permission Matrix
      </p>
      {!canEdit && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 mb-3">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> เฉพาะ Super Admin เท่านั้นที่แก้ Role ได้ — บัญชีคุณดูได้อย่างเดียว
        </div>
      )}
      {loading && <p className="text-sm text-stone-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-stone-100 dark:border-stone-700">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{u.name || "(ยังไม่ตั้งชื่อ)"}</p>
              <p className="text-xs text-stone-400">{u.email}</p>
              <p className="text-xs mt-0.5 flex items-center gap-1">
                <Phone className="w-3 h-3 text-stone-300" />
                {u.phone
                  ? <span className="text-stone-500">{u.phone}</span>
                  : <span className="text-amber-600">ยังไม่ใส่เบอร์ — เอกสารจะไม่มีเบอร์ให้ลูกค้าโทรกลับ</span>}
              </p>
              <p className="text-xs mt-0.5 flex items-center gap-1">
                <PenLine className="w-3 h-3 text-stone-300" />
                {u.signature_path
                  ? <span className="text-stone-500">มีลายเซ็นแล้ว</span>
                  : <span className="text-stone-400">ยังไม่มีลายเซ็น</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            {(canEdit || u.id === profile?.id) && (
              <button onClick={() => setEditUser(u)} title="แก้ชื่อ เบอร์โทร และลายเซ็น"
                      className="p-1.5 text-stone-400 hover:text-stone-900">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit ? (
              <select
                value={u.role}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                className="text-sm rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-700 dark:text-stone-200 px-2.5 py-1.5"
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            ) : (
              <Pill tone="indigo">{u.role}</Pill>
            )}
            </div>
          </div>
        ))}
      </div>
      {editUser && (
        <UserProfileModal user={editUser} onClose={() => setEditUser(null)}
                          onSaved={() => { setEditUser(null); refetch(); }}
                          onSignatureChanged={async () => {
                            toast.success("บันทึกลายเซ็นแล้ว");
                            refetch();
                            const fresh = await listUsers();
                            const u = fresh?.find((x) => x.id === editUser.id);
                            if (u) setEditUser(u);
                          }} />
      )}
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
          <Boxes className="w-4 h-4 text-stone-600" />
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">คลังสินค้า (Stock Locations)</h3>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-900 hover:text-stone-900">
          <Plus className="w-4 h-4" /> เพิ่มคลัง
        </button>
      </div>
      <p className="text-xs text-stone-400 mb-4">จำกัดสิทธิ์สร้าง/แก้ไข เฉพาะ Role Manager และ Store · คลังที่เคยมีการเคลื่อนไหวสินค้าลบไม่ได้ ให้ปิดใช้งานแทน</p>
      {loading && <p className="text-sm text-stone-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {locations?.map((l) => (
          <div key={l.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-stone-100 dark:border-stone-700">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{l.name}</span>
                {l.is_active === false && <Pill tone="slate">ปิดใช้งาน</Pill>}
              </div>
              {(l.address || l.phone || l.note) && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {[l.address, l.phone, l.note].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Pill tone="slate">{l.location_type}</Pill>
              <button onClick={() => setEditLocation(l)} title="แก้ไขคลัง"
                      className="p-1.5 text-stone-400 hover:text-stone-900">
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
                className="p-1.5 text-stone-400 hover:text-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {!loading && locations?.length === 0 && <p className="text-sm text-stone-400 text-center py-4">ยังไม่มีคลังสินค้า</p>}
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

/**
 * ผู้อนุมัติเอกสารทางบัญชี — ลงนามบนทุกเอกสารที่ไม่ใช่ใบเสนอราคา
 * (ใบแจ้งหนี้ ใบกำกับภาษี ใบเสร็จ ใบสั่งซื้อ ฯลฯ)
 * สร้างใหม่ = กรอกชื่อ/ตำแหน่ง บันทึกก่อน แล้วค่อยใส่ลายเซ็นในหน้าต่างเดิม
 */
function ApproverModal({ approver, onClose, onSaved }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState(approver);
  const editing = Boolean(current);
  const [f, setF] = useState({
    name: approver?.name ?? "",
    position: approver?.position ?? "",
    is_default: approver?.is_default ?? false,
    is_active: approver?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function reload(id) {
    const fresh = (await listApprovers()).find((a) => a.id === id);
    if (fresh) setCurrent(fresh);
  }

  async function handleSave(close) {
    if (!f.name.trim()) { toast.error("ใส่ชื่อผู้อนุมัติก่อน"); return; }
    setSaving(true);
    try {
      const id = await saveApprover({ id: current?.id, ...f }, profile?.id);
      onSaved();
      if (close) { toast.success("บันทึกแล้ว"); onClose(); }
      else { toast.success("บันทึกแล้ว — ใส่ลายเซ็นต่อได้เลย"); await reload(id); }
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ (เฉพาะ Super Admin): " + errMsg(err));
    } finally { setSaving(false); }
  }

  return (
    <Modal title={editing ? `แก้ไขผู้อนุมัติ — ${current.name}` : "เพิ่มผู้อนุมัติเอกสาร"} onClose={onClose}>
      <Field label="ชื่อ (พิมพ์ใต้ลายเซ็น)" required>
        <TextInput value={f.name} placeholder="เช่น ธนพล ใจดี"
                   onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="ตำแหน่ง">
        <TextInput value={f.position} placeholder="เช่น กรรมการผู้จัดการ"
                   onChange={(e) => set("position", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200 mb-3">
        <input type="checkbox" checked={f.is_default} disabled={!f.is_active}
               onChange={(e) => set("is_default", e.target.checked)} />
        ผู้อนุมัติหลัก — เลือกให้อัตโนมัติในเอกสารใหม่
      </label>
      {editing && (
        <Field label="สถานะ">
          <Select value={f.is_active ? "y" : "n"}
                  onChange={(e) => setF((p) => ({ ...p, is_active: e.target.value === "y",
                    is_default: e.target.value === "y" ? p.is_default : false }))}>
            <option value="y">ใช้งาน</option>
            <option value="n">ปิดใช้งาน (ใบที่ออกไปแล้วยังมีลายเซ็นเดิม)</option>
          </Select>
        </Field>
      )}
      <Field label="ลายเซ็น">
        {editing ? (
          <SignatureField
            currentPath={current.signature_path ?? null}
            upload={(png) => uploadApproverSignature(current.id, png)}
            clear={() => clearApproverSignature(current.id)}
            onChanged={async () => { toast.success("บันทึกลายเซ็นแล้ว"); onSaved(); await reload(current.id); }}
          />
        ) : (
          <p className="text-xs text-stone-400">บันทึกชื่อก่อน แล้วใส่ลายเซ็นได้ในหน้าต่างนี้</p>
        )}
      </Field>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone-100 dark:border-stone-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">
          {editing ? "ปิด" : "ยกเลิก"}
        </button>
        <button onClick={() => handleSave(editing)} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : editing ? "บันทึก" : "บันทึกแล้วใส่ลายเซ็น"}
        </button>
      </div>
    </Modal>
  );
}

function ApproverSection() {
  const { data: approvers, loading, refetch } = useQuery(() => listApprovers(), []);
  const { profile } = useAuth();
  const canEdit = profile?.role === "Super Admin";
  const [edit, setEdit] = useState(undefined); // undefined = ปิด · null = เพิ่มใหม่

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 text-stone-600" />
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">ผู้อนุมัติเอกสารทางบัญชี</h3>
        </div>
        {canEdit && (
          <button onClick={() => setEdit(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-900 dark:text-stone-100">
            <Plus className="w-4 h-4" /> เพิ่มผู้อนุมัติ
          </button>
        )}
      </div>
      <p className="text-xs text-stone-400 mb-4">
        ลงนามช่อง "ผู้อนุมัติ / ผู้รับเงิน" บนใบแจ้งหนี้ ใบกำกับภาษี ใบเสร็จ ใบสั่งซื้อ และเอกสารอื่นที่ไม่ใช่ใบเสนอราคา
        (ใบเสนอราคาใช้ลายเซ็นเซลล์ในใบ) · ชื่อ ตำแหน่ง ลายเซ็น ล็อกกับเอกสารตอนออก แก้ทีหลังไม่กระทบใบเดิม
      </p>
      {!canEdit && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 mb-3">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> เฉพาะ Super Admin เท่านั้นที่เพิ่ม/แก้ผู้อนุมัติได้
        </div>
      )}
      {loading && <p className="text-sm text-stone-400">กำลังโหลด...</p>}
      <div className="space-y-2">
        {approvers?.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-stone-100 dark:border-stone-700">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{a.name}</span>
                {a.is_default && <Pill tone="slate">ผู้อนุมัติหลัก</Pill>}
                {!a.is_active && <Pill tone="slate">ปิดใช้งาน</Pill>}
              </div>
              <p className="text-xs text-stone-400">{a.position || "ยังไม่ระบุตำแหน่ง"}</p>
              <p className="text-xs mt-0.5 flex items-center gap-1">
                <PenLine className="w-3 h-3 text-stone-300" />
                {a.signature_path
                  ? <span className="text-stone-500">มีลายเซ็นแล้ว</span>
                  : <span className="text-amber-600">ยังไม่มีลายเซ็น — เอกสารจะเว้นช่องลงนามว่าง</span>}
              </p>
            </div>
            {canEdit && (
              <button onClick={() => setEdit(a)} title="แก้ชื่อ ตำแหน่ง และลายเซ็น"
                      className="p-1.5 text-stone-400 hover:text-stone-900 shrink-0">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {!loading && approvers?.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-4">
            ยังไม่มีผู้อนุมัติ — เอกสารที่ไม่ใช่ใบเสนอราคาจะออกโดยไม่มีลายเซ็น
          </p>
        )}
      </div>
      {edit !== undefined && (
        <ApproverModal approver={edit} onClose={() => setEdit(undefined)} onSaved={refetch} />
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-1">การตั้งค่า</h1>
      <p className="text-sm text-stone-400 mb-6">จัดการสิทธิ์ผู้ใช้งานและค่าตั้งต้นของระบบ ARCA</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <UserRoleSection />
        <div className="flex flex-col gap-5">
          <ApproverSection />
          <LocationSection />
        </div>
      </div>
    </div>
  );
}

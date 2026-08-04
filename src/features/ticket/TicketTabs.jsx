import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, TextInput, TextArea, Select, Pill, SearchSelect } from "../../components/ui/primitives.jsx";
import { TICKET_STATUS_STEPS } from "../../lib/mockData";
import { useQuery } from "../../hooks/useQuery.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";
import { listDeviceInstall, listDeviceDetail } from "../../api/projects.js";
import { listStockItems, listLocations } from "../../api/stock.js";
import { listUsers } from "../../api/users.js";
import {
  listIssues, addIssue, deleteIssue,
  listSubcontractors, addSubcontractor, deleteSubcontractor,
  listStockMovements, addStockMovement,
} from "../../api/tickets.js";

// Reference tabs — pulled read-only from the linked Project, per spec 3.1.1
export function CustomerRefTab({ project }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-4">ข้อมูลนี้ดึงมาจาก Project อ้างอิงโดยอัตโนมัติ (Read-only)</p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Project Number"><TextInput value={project.code || ""} disabled /></Field>
        <Field label="Project Name"><TextInput value={project.name || ""} disabled /></Field>
        <Field label="Customer"><TextInput value={project.customer || ""} disabled /></Field>
        <Field label="Phone"><TextInput value={project.phone || ""} disabled /></Field>
      </div>
    </div>
  );
}

export function DeviceInstallRefTab({ projectId }) {
  const { data: rows, loading } = useQuery(() => (projectId ? listDeviceInstall(projectId) : Promise.resolve([])), [projectId]);
  return (
    <div>
      <p className="text-xs text-slate-400 mb-4">รายการสินค้าตามแผนของ Project (Read-only)</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">รุ่น</th>
              <th className="text-left font-medium px-4 py-2.5">รายละเอียด</th>
              <th className="text-right font-medium px-4 py-2.5">จำนวน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={3} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-6">ไม่มีข้อมูล</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.model_code}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.description}</td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.planned_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DeviceDetailRefTab({ projectId }) {
  const { data: rows, loading } = useQuery(() => (projectId ? listDeviceDetail(projectId) : Promise.resolve([])), [projectId]);
  return (
    <div>
      <p className="text-xs text-slate-400 mb-4">Serial ที่ติดตั้งจริง — เลือกใช้ในแท็บ Request &amp; Issue เพื่อเช็ค Warranty อัตโนมัติ</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Serial No.</th>
              <th className="text-left font-medium px-4 py-2.5">รุ่น</th>
              <th className="text-left font-medium px-4 py-2.5">เริ่มนับ</th>
              <th className="text-right font-medium px-4 py-2.5">ประกัน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={4} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6">ไม่มีข้อมูล</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.serial_no}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.model_code}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.start_date}</td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.warranty_months} เดือน</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RequestIssueTab({ ticketId, projectId, state, setState }) {
  const { data: deviceDetailRows } = useQuery(() => (projectId ? listDeviceDetail(projectId) : Promise.resolve([])), [projectId]);
  const { data: issues, refetch: refetchIssues } = useQuery(() => (ticketId ? listIssues(ticketId) : Promise.resolve([])), [ticketId]);
  const toast = useToast();
  const [newRow, setNewRow] = useState({ serial: "", symptom: "" });
  const [saving, setSaving] = useState(false);

  function warrantyOf(serial) {
    const row = deviceDetailRows?.find((d) => d.serial_no === serial);
    if (!row) return null;
    const end = new Date(row.start_date);
    end.setMonth(end.getMonth() + (row.warranty_months || 0));
    return { inWarranty: new Date() <= end, model: row.model_code };
  }

  async function handleAddIssue() {
    if (!newRow.serial) {
      toast.error("เลือก Serial ก่อน");
      return;
    }
    const found = deviceDetailRows?.find((d) => d.serial_no === newRow.serial);
    setSaving(true);
    try {
      await addIssue(ticketId, {
        device_detail_id: found?.id || null,
        serial_no: newRow.serial,
        model_code: found?.model_code || null,
        symptom: newRow.symptom || null,
      });
      setNewRow({ serial: "", symptom: "" });
      refetchIssues();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteIssue(id) {
    try {
      await deleteIssue(id);
      refetchIssues();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">ข้อมูลการแจ้งเรื่อง</h4>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="ผู้แจ้งเรื่อง">
          <TextInput placeholder="ชื่อลูกค้า" value={state.reporterName || ""} onChange={(e) => setState((s) => ({ ...s, reporterName: e.target.value }))} />
        </Field>
        <Field label="เบอร์โทร">
          <TextInput placeholder="0xx-xxx-xxxx" value={state.reporterPhone || ""} onChange={(e) => setState((s) => ({ ...s, reporterPhone: e.target.value }))} />
        </Field>
        <Field label="อีเมล">
          <TextInput value={state.reporterEmail || ""} onChange={(e) => setState((s) => ({ ...s, reporterEmail: e.target.value }))} />
        </Field>
        <Field label="วันเวลาสะดวกติดต่อกลับ">
          <TextInput type="datetime-local" value={state.preferredCallbackAt || ""} onChange={(e) => setState((s) => ({ ...s, preferredCallbackAt: e.target.value }))} />
        </Field>
      </div>
      <Field label="อาการที่ลูกค้าแจ้ง">
        <TextArea rows={3} placeholder="อธิบายอาการที่ลูกค้าแจ้งมา..." value={state.symptomDescription || ""} onChange={(e) => setState((s) => ({ ...s, symptomDescription: e.target.value }))} />
      </Field>
      {!ticketId && <p className="text-xs text-amber-500 -mt-2.5 mb-2">บันทึก (Save Data) ก่อน จึงจะเพิ่มรายการปัญหาแยกตามอุปกรณ์ด้านล่างได้</p>}

      <div className="flex items-center justify-between mt-6 mb-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">รายการปัญหาแยกตามอุปกรณ์</h4>
      </div>

      {ticketId && (
        <div className="grid grid-cols-3 gap-2 mb-3 items-end">
          <Select value={newRow.serial} onChange={(e) => setNewRow((r) => ({ ...r, serial: e.target.value }))}>
            <option value="">— เลือก Serial —</option>
            {deviceDetailRows?.map((d) => <option key={d.serial_no} value={d.serial_no}>{d.serial_no} ({d.model_code})</option>)}
          </Select>
          <TextInput placeholder="อาการที่พบ" value={newRow.symptom} onChange={(e) => setNewRow((r) => ({ ...r, symptom: e.target.value }))} />
          <button onClick={handleAddIssue} disabled={saving} className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
            {saving ? "..." : "+ เพิ่มอุปกรณ์"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Serial No.</th>
              <th className="text-left font-medium px-4 py-2.5">รุ่น</th>
              <th className="text-left font-medium px-4 py-2.5">อาการที่พบ</th>
              <th className="text-right font-medium px-4 py-2.5">Warranty</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {(!issues || issues.length === 0) && <tr><td colSpan={5} className="text-center text-slate-400 py-6">ยังไม่มีรายการ</td></tr>}
            {issues?.map((row) => {
              const w = warrantyOf(row.serial_no);
              return (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{row.serial_no}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{row.model_code || "-"}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{row.symptom || "-"}</td>
                  <td className="px-4 py-2 text-right">
                    {w ? (w.inWarranty ? <Pill tone="green">ในประกัน</Pill> : <Pill tone="rose">หมดประกัน</Pill>) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleDeleteIssue(row.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SubcontractorTab({ ticketId }) {
  const { data: rows, refetch } = useQuery(() => (ticketId ? listSubcontractors(ticketId) : Promise.resolve([])), [ticketId]);
  const toast = useToast();
  const [form, setForm] = useState({ company_or_name: "", phone: "", scheduled_date: "", cost: "", note: "" });
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.company_or_name.trim()) {
      toast.error("กรอกชื่อบริษัท/ช่างก่อน");
      return;
    }
    setSaving(true);
    try {
      await addSubcontractor(ticketId, { ...form, cost: form.cost ? Number(form.cost) : null, scheduled_date: form.scheduled_date || null });
      toast.success("เพิ่มข้อมูลช่างนอกแล้ว");
      setForm({ company_or_name: "", phone: "", scheduled_date: "", cost: "", note: "" });
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteSubcontractor(id);
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  if (!ticketId) {
    return <p className="text-sm text-amber-500 text-center py-10">บันทึก (Save Data) ก่อน จึงจะมอบหมายช่างนอกได้</p>;
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">มอบหมายช่างนอก (Subcontractor)</h4>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="บริษัท/ช่างนอก"><TextInput value={form.company_or_name} onChange={(e) => setForm((f) => ({ ...f, company_or_name: e.target.value }))} /></Field>
        <Field label="เบอร์ติดต่อ"><TextInput value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="วันที่นัดเข้างาน"><TextInput type="date" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} /></Field>
        <Field label="ค่าใช้จ่าย (ถ้ามี)"><TextInput type="number" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} /></Field>
      </div>
      <Field label="หมายเหตุ"><TextArea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
      <button onClick={handleAdd} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60 mb-5">
        {saving ? "กำลังบันทึก..." : "+ เพิ่มช่างนอก"}
      </button>

      <div className="space-y-2">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.company_or_name}</p>
              <p className="text-xs text-slate-400">{r.phone} {r.scheduled_date && `• นัด ${r.scheduled_date}`} {r.cost && `• ฿${Number(r.cost).toLocaleString()}`}</p>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOVEMENT_LABELS = { withdraw: "เบิกสินค้า", return: "คืนเบิกสินค้า", receive_old: "รับสินค้าเก่า" };

export function StockMovementTab({ ticketId }) {
  const { data: movements, refetch } = useQuery(() => (ticketId ? listStockMovements(ticketId) : Promise.resolve([])), [ticketId]);
  const { data: stockItems } = useQuery(() => listStockItems(), []);
  const { data: locations } = useQuery(() => listLocations(), []);
  const { session, profile } = useAuth();
  const toast = useToast();
  const canMoveStock = ["Super Admin", "Manager", "Store"].includes(profile?.role);

  const sections = [
    { type: "withdraw", title: "เบิกสินค้า", hint: "อะไหล่ที่เบิกจากคลังไปใช้ซ่อม — ตัด On Hand" },
    { type: "return", title: "คืนเบิกสินค้า", hint: "อะไหล่ที่เบิกไปแต่ไม่ได้ใช้ — คืนกลับเข้า On Hand" },
    { type: "receive_old", title: "รับสินค้าเก่า", hint: "ของเก่า/ของเสียที่ถอดจากลูกค้า รับกลับเข้าคลังเพื่อเคลม/ทำลาย" },
  ];

  const [forms, setForms] = useState({});

  function setFormField(type, field, value) {
    setForms((f) => ({ ...f, [type]: { ...(f[type] || {}), [field]: value } }));
  }

  async function handleAdd(type) {
    const f = forms[type] || {};
    if (!f.stockItemId) {
      toast.error("เลือกสินค้าก่อน");
      return;
    }
    if ((type === "withdraw" || type === "return") && !f.locationId) {
      toast.error("เลือกคลังก่อน — เบิก/คืนต้องระบุคลังที่จะตัด/คืนสต็อก");
      return;
    }
    try {
      await addStockMovement(ticketId, {
        movementType: type,
        stockItemId: f.stockItemId,
        locationId: f.locationId || null,
        serialNo: f.serialNo || null,
        qty: f.qty ? Number(f.qty) : 1,
        createdBy: session?.user?.id,
      });
      toast.success(`บันทึก${MOVEMENT_LABELS[type]}แล้ว${type !== "receive_old" ? " และปรับสต็อกแล้ว" : ""}`);
      setForms((s) => ({ ...s, [type]: {} }));
      refetch();
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  if (!ticketId) {
    return <p className="text-sm text-amber-500 text-center py-10">บันทึก (Save Data) ก่อน จึงจะเบิก/คืนสินค้าได้</p>;
  }

  return (
    <div className="space-y-6">
      {!canMoveStock && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
          บทบาทของคุณ ({profile?.role}) ไม่มีสิทธิ์บันทึกการเบิก/คืนสินค้าโดยตรง — ต้องให้ Store หรือ Manager เป็นผู้บันทึกตามสิทธิ์ในระบบ
        </p>
      )}
      {sections.map((s) => {
        const rows = (movements || []).filter((m) => m.movement_type === s.type);
        const f = forms[s.type] || {};
        return (
          <div key={s.type}>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.title}</h4>
            <p className="text-xs text-slate-400 mb-2.5">{s.hint}</p>

            <div className="grid grid-cols-5 gap-2 mb-2.5 items-start">
              <div className="col-span-2">
                <SearchSelect
                  asyncSearch={(q) => {
                    const ql = q.toLowerCase();
                    return Promise.resolve(
                      (stockItems || [])
                        .filter((i) => !ql || i.model_code?.toLowerCase().includes(ql) || i.description?.toLowerCase().includes(ql))
                        .slice(0, 50)
                        .map((i) => ({ label: `${i.model_code} — ${i.description || ""}`, id: i.id, raw: i }))
                    );
                  }}
                  value={f.stockItemLabel || ""}
                  onChange={(label, id) => { setFormField(s.type, "stockItemLabel", label); setFormField(s.type, "stockItemId", id || ""); }}
                  placeholder="พิมพ์ค้นหาสินค้า..."
                />
              </div>
              <TextInput placeholder="Serial (ถ้ามี)" value={f.serialNo || ""} onChange={(e) => setFormField(s.type, "serialNo", e.target.value)} />
              <TextInput type="number" placeholder="จำนวน" value={f.qty || ""} onChange={(e) => setFormField(s.type, "qty", e.target.value)} />
              <button onClick={() => handleAdd(s.type)} disabled={!canMoveStock} className="px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">บันทึก</button>
            </div>
            {s.type !== "receive_old" && (
              <Select value={f.locationId || ""} onChange={(e) => setFormField(s.type, "locationId", e.target.value)}>
                <option value="">— เลือกคลัง (จำเป็นเพื่อปรับสต็อก) —</option>
                {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mt-2.5">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">รุ่น</th>
                    <th className="text-left font-medium px-4 py-2">Serial</th>
                    <th className="text-right font-medium px-4 py-2">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={3} className="text-center text-slate-300 py-4">ยังไม่มีรายการ</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{r.item?.model_code}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.serial_no || "-"}</td>
                      <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-300">{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UpdateTab({ state, setState }) {
  const { data: users } = useQuery(() => listUsers(), []);
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="สถานะ" required>
          <Select value={state.status} onChange={(e) => setState((s) => ({ ...s, status: e.target.value }))}>
            {TICKET_STATUS_STEPS.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Support Type">
          <Select value={state.supportType || "Call"} onChange={(e) => setState((s) => ({ ...s, supportType: e.target.value }))}>
            <option>Call</option>
            <option>Onsite</option>
            <option>Remote</option>
          </Select>
        </Field>
        <Field label="วันที่รับเรื่อง">
          <TextInput type="datetime-local" value={state.receivedAt || ""} onChange={(e) => setState((s) => ({ ...s, receivedAt: e.target.value }))} />
        </Field>
        <Field label="ผู้รับเรื่อง">
          <Select value={state.receivedBy || ""} onChange={(e) => setState((s) => ({ ...s, receivedBy: e.target.value }))}>
            <option value="">— เลือกผู้รับเรื่อง —</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="วันที่นัดหมาย">
          <TextInput type="date" value={state.appointmentDate || ""} onChange={(e) => setState((s) => ({ ...s, appointmentDate: e.target.value }))} />
        </Field>
        <Field label="วันที่เริ่มงาน">
          <TextInput type="date" value={state.workStartDate || ""} onChange={(e) => setState((s) => ({ ...s, workStartDate: e.target.value }))} />
        </Field>
        <Field label="วันที่ปิดงาน">
          <TextInput type="date" value={state.workCloseDate || ""} onChange={(e) => setState((s) => ({ ...s, workCloseDate: e.target.value }))} />
        </Field>
      </div>
      <Field label="หมายเหตุ">
        <TextArea rows={3} value={state.remark || ""} onChange={(e) => setState((s) => ({ ...s, remark: e.target.value }))} />
      </Field>
      <p className="text-xs text-slate-400 -mt-2.5">การเปลี่ยนสถานะตรงนี้จะอัปเดตแถบสถานะด้านบนและ Status Stepper ทันที</p>
    </div>
  );
}

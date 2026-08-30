import React, { useEffect, useState } from "react";
import { Plus, Paperclip, FileText, Eye, EyeOff, MapPin, CheckCircle2, Trash2, Link as LinkIcon } from "lucide-react";
import { Field, TextInput, TextArea, Select, Pill, SearchSelect, Toggle, Modal } from "../../components/ui/primitives.jsx";
import FileUploader from "../../components/ui/FileUploader.jsx";
import { getPublicFileUrl } from "../../lib/upload.js";
import { PROJECT_STATUS_STEPS } from "../../lib/mockData";
import { listSites, listContacts } from "../../api/contacts.js";
import { listUsers } from "../../api/users.js";
import { listProductCategories, listStockItems, listLocations, createInstallJobRequest, fulfillInstallJob, cancelInstallJob, returnDeviceDetailToStock } from "../../api/stock.js";
import {
  listQuotations, addQuotation, deleteQuotation,
  listDeviceInstall, addDeviceInstallRow, updateDeviceInstallRow, deleteDeviceInstallRow,
  listInstallJobs, listJobsForModel, listDeviceDetail,
  listPaymentPeriods, addPaymentPeriod, markPaymentPaid, deletePaymentPeriod,
  listProjectFiles, addProjectFile, deleteProjectFile,
  listAppData, addAppData, deleteAppData,
} from "../../api/projects.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

async function searchSites(query) {
  const results = await listSites(query);
  return results.map((s) => ({ label: s.name, id: s.id, raw: s }));
}

async function searchCustomers(query) {
  const results = await listContacts({ query });
  return results.map((c) => ({ label: c.display_name, id: c.id, raw: c }));
}

export function CustomerTab({ state, setState, openCustomerModal, openSiteModal }) {
  const { session } = useAuth();
  // Previously filtered to roles: ["Sale", "PM"] — but a small team often
  // has Salesman duties covered by Manager/Super Admin too (real accounts
  // like "Bos"/"Poom" never showed up here because of that filter). Now
  // lists every active user instead.
  const { data: salesUsers } = useQuery(() => listUsers(), []);
  const { data: productCategories } = useQuery(() => listProductCategories(), []);

  // Default the Salesman field to whoever is currently logged in, since
  // most of the time the person creating the project IS the salesperson —
  // still fully changeable, this just saves a click for the common case.
  useEffect(() => {
    if (!state.salesman_id && session?.user?.id && salesUsers?.length) {
      const me = salesUsers.find((u) => u.id === session.user.id);
      if (me) setState((s) => ({ ...s, salesman_id: me.id, salesman: me.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesUsers, session?.user?.id]);

  function handleSiteChange(siteName, siteId, siteRecord) {
    setState((s) => ({
      ...s,
      site: siteName,
      site_id: siteId,
      address: siteRecord ? siteRecord.address : s.address,
      province: siteRecord ? siteRecord.province : s.province,
      googleMap: siteRecord ? siteRecord.google_map : s.googleMap,
    }));
  }

  function handleCustomerChange(name, customerId) {
    setState((s) => ({ ...s, customer: name, customer_id: customerId }));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="Project Number" required>
          <TextInput
            placeholder="กรอกเลขที่โปรเจคของคุณเอง"
            value={state.projectNumber}
            onChange={(e) => setState((s) => ({ ...s, projectNumber: e.target.value }))}
          />
        </Field>
        <Field label="Project Type" required>
          <Select value={state.projectType} onChange={(e) => setState((s) => ({ ...s, projectType: e.target.value }))}>
            <option>Install</option>
            <option>ส่งสินค้าอย่างเดียว</option>
            <option>งานซ่อมและงานบริการ</option>
          </Select>
        </Field>
        <Field label="Product Category">
          <Select value={state.productCategory || ""} onChange={(e) => setState((s) => ({ ...s, productCategory: e.target.value }))}>
            <option value="">— เลือกหมวดหมู่สินค้า —</option>
            {productCategories?.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Project Source">
          <Select value={state.projectSource || ""} onChange={(e) => setState((s) => ({ ...s, projectSource: e.target.value }))}>
            <option value="">— เลือกที่มาของโปรเจค —</option>
            <option value="Developer">Developer</option>
            <option value="Designer">Designer</option>
            <option value="Dealer">Dealer</option>
            <option value="Partner">Partner</option>
            <option value="End-User">End-User</option>
            <option value="Home Builder">Home Builder</option>
            <option value="Phuket">Phuket</option>
          </Select>
        </Field>
        <Field label="Salesman" required>
          <Select value={state.salesman_id || ""} onChange={(e) => {
            const chosen = salesUsers?.find((u) => u.id === e.target.value);
            setState((s) => ({ ...s, salesman_id: e.target.value, salesman: chosen?.name || "" }));
          }}>
            <option value="">— เลือกจากบัญชีผู้ใช้งาน —</option>
            {salesUsers?.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="ต้องการตรวจสอบการชำระเงินหรือไม่">
        <div className="flex items-center gap-2">
          <Toggle checked={!!state.paymentVerificationRequired} onChange={() => setState((s) => ({ ...s, paymentVerificationRequired: !s.paymentVerificationRequired }))} />
          <span className="text-sm text-slate-600 dark:text-slate-300">{state.paymentVerificationRequired ? "ต้องการ" : "ไม่ต้องการ"}</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-x-5">
        <SearchSelect
          label="Project Name (Site)"
          asyncSearch={searchSites}
          value={state.site}
          onChange={handleSiteChange}
          placeholder="พิมพ์ค้นหาโครงการ/สถานที่..."
          addLabel="สร้างโครงการ/สถานที่ใหม่"
          onAddNew={openSiteModal}
        />
        <SearchSelect
          label="Customer Name"
          required
          asyncSearch={searchCustomers}
          value={state.customer}
          onChange={handleCustomerChange}
          placeholder="พิมพ์ค้นหาลูกค้า..."
          addLabel="เพิ่มลูกค้าใหม่"
          onAddNew={openCustomerModal}
        />
      </div>


      <p className="text-xs text-slate-400 -mt-2.5 mb-4 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> Project Contact / Tel / Address / Province / Google Map ด้านล่างดึงค่าอัตโนมัติจาก Site ที่เลือก — แก้ไขได้เฉพาะโปรเจคนี้โดยไม่กระทบข้อมูลต้นฉบับ
      </p>

      <div className="grid grid-cols-2 gap-x-5">
        <Field label="Project Contact">
          <TextInput value={state.projectContact || ""} onChange={(e) => setState((s) => ({ ...s, projectContact: e.target.value }))} />
        </Field>
        <Field label="Tel Number">
          <TextInput value={state.tel || ""} onChange={(e) => setState((s) => ({ ...s, tel: e.target.value }))} />
        </Field>
      </div>

      <Field label="Address">
        <TextArea rows={2} value={state.address || ""} onChange={(e) => setState((s) => ({ ...s, address: e.target.value }))} />
      </Field>

      <div className="grid grid-cols-3 gap-x-5">
        <Field label="Province">
          <TextInput value={state.province || ""} onChange={(e) => setState((s) => ({ ...s, province: e.target.value }))} />
        </Field>
        <Field label="Google Map">
          <TextInput value={state.googleMap || ""} onChange={(e) => setState((s) => ({ ...s, googleMap: e.target.value }))} />
        </Field>
        <Field label="House Number">
          <TextInput placeholder="เลขที่บ้าน/ยูนิต" value={state.houseNumber || ""} onChange={(e) => setState((s) => ({ ...s, houseNumber: e.target.value }))} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-5">
        <Field label="GPS LAT">
          <TextInput placeholder="13.7563" value={state.gpsLat ?? ""} onChange={(e) => setState((s) => ({ ...s, gpsLat: e.target.value }))} />
        </Field>
        <Field label="GPS LAG">
          <TextInput placeholder="100.5018" value={state.gpsLng ?? ""} onChange={(e) => setState((s) => ({ ...s, gpsLng: e.target.value }))} />
        </Field>
      </div>

      <Field label="Plan">
        <TextInput
          placeholder="เช่น ชื่อแปลนบ้าน หรือชื่อสินค้าตามประเภทงาน"
          value={state.plan || ""}
          onChange={(e) => setState((s) => ({ ...s, plan: e.target.value }))}
        />
      </Field>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2.5">กำหนดการ</p>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="Estimated Installation">
          <TextInput type="date" value={state.estimatedInstallation || ""} onChange={(e) => setState((s) => ({ ...s, estimatedInstallation: e.target.value }))} />
        </Field>
        <Field label="Installation Date">
          <TextInput type="date" value={state.installationDate || ""} onChange={(e) => setState((s) => ({ ...s, installationDate: e.target.value }))} />
        </Field>
        <Field label="กำหนดส่งมอบ">
          <TextInput type="date" value={state.deliveryDue || ""} onChange={(e) => setState((s) => ({ ...s, deliveryDue: e.target.value }))} />
        </Field>
        <Field label="วันที่ส่งของ">
          <TextInput type="date" value={state.shippedDate || ""} onChange={(e) => setState((s) => ({ ...s, shippedDate: e.target.value }))} />
        </Field>
      </div>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-5 mb-2.5">ประกัน & สถานะ</p>
      <div className="grid grid-cols-2 gap-x-5">
        <Field label="Warranty (month)">
          <TextInput
            type="number"
            placeholder="เช่น 24"
            value={state.warrantyMonths ?? ""}
            onChange={(e) => setState((s) => ({ ...s, warrantyMonths: e.target.value ? Number(e.target.value) : null }))}
          />
        </Field>
        <Field label="Status">
          <Select value={state.status} onChange={(e) => setState((s) => ({ ...s, status: e.target.value }))}>
            {PROJECT_STATUS_STEPS.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-slate-400 -mt-2.5 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" /> ค่านี้คือสถานะจริงของ Project — เปลี่ยนตรงนี้แล้วแถบสถานะด้านบนและ Status Stepper จะอัปเดตตามทันที
      </p>
    </div>
  );
}

export function SoInfoTab({ projectId }) {
  const { data: rows, loading, refetch } = useQuery(() => listQuotations(projectId), [projectId]);
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [docNo, setDocNo] = useState("");
  const [productType, setProductType] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!docNo.trim()) {
      toast.error("กรอกเลขที่เอกสารก่อน");
      return;
    }
    setSaving(true);
    try {
      await addQuotation(projectId, { document_no: docNo, product_type: productType || null, price: price ? Number(price) : null });
      toast.success("เพิ่มใบเสนอราคาแล้ว");
      setDocNo(""); setProductType(""); setPrice(""); setShowForm(false);
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteQuotation(id);
      toast.success("ลบใบเสนอราคาแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">ใบเสนอราคาที่เกี่ยวข้อง</h4>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-900">
          <Plus className="w-4 h-4" /> เพิ่มใบเสนอราคา
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-4 gap-2 mb-4 items-end">
          <TextInput placeholder="เลขที่เอกสาร" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
          <TextInput placeholder="ประเภทสินค้า" value={productType} onChange={(e) => setProductType(e.target.value)} />
          <TextInput placeholder="ราคา" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button onClick={handleAdd} disabled={saving} className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
            {saving ? "..." : "บันทึก"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">วันที่สร้าง</th>
              <th className="text-left font-medium px-4 py-2.5">ประเภทสินค้า</th>
              <th className="text-left font-medium px-4 py-2.5">เลขที่เอกสาร</th>
              <th className="text-right font-medium px-4 py-2.5">ราคา</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={5} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">ยังไม่มีใบเสนอราคา</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.product_type || "-"}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">{r.document_no}</td>
                <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-100 font-medium">{r.price ? `฿${Number(r.price).toLocaleString()}` : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JobHistoryPanel({ projectId, modelCode }) {
  const { data: jobs, loading } = useQuery(() => listJobsForModel(projectId, modelCode), [projectId, modelCode]);
  if (loading) return <p className="text-xs text-slate-400 py-2">กำลังโหลด...</p>;
  if (!jobs || jobs.length === 0) return <p className="text-xs text-slate-400 py-2">ยังไม่มีการเบิกสำหรับรุ่นนี้</p>;
  return (
    <div className="py-2 space-y-2">
      {jobs.map((j) => (
        <div key={j.jobId} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
          <div>
            <span className="font-medium text-slate-900">{j.jobCode}</span>
            <span className="text-slate-400 ml-2">{new Date(j.createdAt).toLocaleString("th-TH")}</span>
            <span className="text-slate-400 ml-2">— {j.serials.length} ชิ้น: {j.serials.join(", ")}</span>
          </div>
          <Pill tone={j.status === "ยกเลิกแล้ว" ? "rose" : "green"}>{j.status}</Pill>
        </div>
      ))}
    </div>
  );
}

export function DeviceInstallTab({ projectId }) {
  const { data: rows, loading, refetch } = useQuery(() => listDeviceInstall(projectId), [projectId]);
  const { data: stockItems } = useQuery(() => listStockItems(), []);
  const { data: locations } = useQuery(() => listLocations(), []);
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [stockItemId, setStockItemId] = useState("");
  const [stockItemLabel, setStockItemLabel] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [expandedModel, setExpandedModel] = useState(null);

  // Local search over the already-loaded product list — with 200+ products
  // (after the Excel import feature) a plain <select> became unusable to
  // scroll through, so this reuses the same searchable-picker component
  // used for Site/Customer elsewhere in the app.
  async function searchStockItems(query) {
    const q = query.toLowerCase();
    return (stockItems || [])
      .filter((i) => !q || i.model_code?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
      .slice(0, 50)
      .map((i) => ({ label: `${i.model_code} — ${i.description || ""}`, id: i.id, raw: i }));
  }

  async function handleAdd() {
    const item = stockItems?.find((i) => i.id === stockItemId);
    if (!item) {
      toast.error("เลือกสินค้าก่อน");
      return;
    }
    if (!locationId) {
      toast.error("เลือกคลังที่จะจองสต็อกก่อน");
      return;
    }
    setSaving(true);
    try {
      await addDeviceInstallRow(projectId, {
        model_code: item.model_code, description: item.description, planned_qty: Number(qty) || 1,
        withdrawn_qty: 0, is_reserved: true, stock_item_id: item.id, location_id: locationId,
      });
      toast.success("เพิ่มรายการแล้ว และจองสต็อกในหน้า Stock ให้แล้ว");
      setStockItemId(""); setStockItemLabel(""); setQty(1); setShowForm(false);
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleReserve(row) {
    if (!row.location_id) {
      toast.error("รายการนี้ไม่มีคลังที่ผูกไว้ (สร้างก่อนอัปเดตฟีเจอร์นี้) — ลบแล้วเพิ่มใหม่เพื่อเลือกคลัง");
      return;
    }
    try {
      await updateDeviceInstallRow(row.id, { is_reserved: !row.is_reserved });
      toast.success(row.is_reserved ? "ยกเลิกการจองสต็อกแล้ว" : "จองสต็อกแล้ว");
      refetch();
    } catch (err) {
      toast.error("อัปเดตไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDeviceInstallRow(id);
      toast.success("ลบรายการแล้ว (คืนสต็อกที่จองไว้ ถ้ามี)");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">รายการที่วางแผนใช้ (Estimate)</h4>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-900">
          <Plus className="w-4 h-4" /> เพิ่มรายการ
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        สลับปุ่ม "จองสต็อก" ได้ต่อรายการ — ถ้าเปิดไว้ จะขึ้นยอด <span className="font-medium text-slate-600">Reserved</span> ในหน้า Stock ทันที (ไม่ตัด On Hand จริง) ถ้าปิดไว้ รายการนี้จะเป็นแค่ประมาณการ ไม่กันสต็อกให้
      </p>

      {showForm && (
        <div className="grid grid-cols-5 gap-2 mb-4 items-start">
          <div className="col-span-2">
            <SearchSelect
              label="สินค้าจาก Stock"
              asyncSearch={searchStockItems}
              value={stockItemLabel}
              onChange={(label, id) => { setStockItemLabel(label); setStockItemId(id || ""); }}
              placeholder="พิมพ์ค้นหา Model Code หรือชื่อสินค้า..."
            />
          </div>
          <Field label="คลังที่จะจอง">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— เลือกคลัง —</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="จำนวน">
            <TextInput type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <div className="pt-6">
            <button onClick={handleAdd} disabled={saving} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
              {saving ? "..." : "เพิ่ม"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">รุ่น</th>
              <th className="text-left font-medium px-4 py-2.5">รายละเอียด</th>
              <th className="text-right font-medium px-4 py-2.5">วางแผน</th>
              <th className="text-right font-medium px-4 py-2.5">เบิกแล้ว</th>
              <th className="text-center font-medium px-4 py-2.5">จองสต็อก</th>
              <th className="text-right font-medium px-4 py-2.5">สถานะ</th>
              <th className="text-right font-medium px-4 py-2.5">ประวัติเบิก</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">ยังไม่มีรายการ</td></tr>}
            {rows?.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.model_code}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.description}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.planned_qty}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.withdrawn_qty}</td>
                  <td className="px-4 py-3 text-center"><Toggle checked={r.is_reserved} onChange={() => toggleReserve(r)} /></td>
                  <td className="px-4 py-3 text-right">
                    {!r.is_reserved ? (
                      <Pill tone="slate">ไม่จอง (Estimate)</Pill>
                    ) : r.withdrawn_qty >= r.planned_qty ? (
                      <Pill tone="green">เบิกครบแล้ว</Pill>
                    ) : (
                      <Pill tone="amber">Reserved</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.withdrawn_qty > 0 && (
                      <button
                        onClick={() => setExpandedModel(expandedModel === r.model_code ? null : r.model_code)}
                        className="text-xs font-medium text-slate-900 hover:underline"
                      >
                        {expandedModel === r.model_code ? "ซ่อน" : "ดู Job"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
                {expandedModel === r.model_code && (
                  <tr>
                    <td colSpan={8} className="px-4 bg-slate-50/50 dark:bg-slate-900/40">
                      <JobHistoryPanel projectId={projectId} modelCode={r.model_code} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STOCK_ACTION_ROLES = ["Super Admin", "Manager", "Store"];

function serialArrayFor(serialInputs, rowId, remaining) {
  const arr = serialInputs[rowId] || [];
  return Array.from({ length: remaining }, (_, i) => arr[i] || "");
}

function NewJobModal({ projectId, warrantyMonths, deviceInstallRows, existingJob, onClose, onCreated }) {
  const { session, profile } = useAuth();
  const toast = useToast();
  const { data: locations } = useQuery(() => listLocations(), []);
  const canFulfill = STOCK_ACTION_ROLES.includes(profile?.role);
  const [locationId, setLocationId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [serialInputs, setSerialInputs] = useState({}); // { deviceInstallRowId: ["SN1", "SN2", ...] }
  const [saving, setSaving] = useState(false);

  const pending = (deviceInstallRows || []).filter((r) => r.planned_qty > r.withdrawn_qty);

  function setSerialAt(rowId, index, value) {
    setSerialInputs((s) => {
      const remaining = pending.find((r) => r.id === rowId)?.planned_qty - pending.find((r) => r.id === rowId)?.withdrawn_qty;
      const next = serialArrayFor(s, rowId, remaining);
      next[index] = value;
      return { ...s, [rowId]: next };
    });
  }

  async function handleSubmitRequest() {
    setSaving(true);
    try {
      const job = await createInstallJobRequest(projectId, {
        job_code: `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-J${Math.floor(Math.random() * 9000 + 1000)}`,
        due_date: dueDate || null,
        requested_by: session?.user?.id,
      });
      toast.success(`ส่งคำขอเบิกสินค้า Job ${job.job_code} แล้ว — รอ Store/Manager ดำเนินการเบิกจริง`);
      onCreated();
    } catch (err) {
      toast.error("ส่งคำขอไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleFulfill() {
    if (!locationId) {
      toast.error("เลือกคลังที่จะเบิกก่อน");
      return;
    }
    const withdrawals = pending
      .map((r) => {
        const remaining = r.planned_qty - r.withdrawn_qty;
        return {
          deviceInstallId: r.id,
          modelCode: r.model_code,
          description: r.description,
          stockItemId: r.stock_item_id,
          isReserved: !!r.is_reserved,
          serials: serialArrayFor(serialInputs, r.id, remaining).map((s) => s.trim()).filter(Boolean),
        };
      })
      .filter((w) => w.serials.length > 0);

    if (withdrawals.length === 0) {
      toast.error("กรอก Serial ของสินค้าที่จะเบิกอย่างน้อย 1 ชิ้น");
      return;
    }

    // Catch duplicate serials within this submission before hitting the DB,
    // so the error is clear instead of a raw constraint-violation message.
    const allSerials = withdrawals.flatMap((w) => w.serials);
    const dupes = allSerials.filter((s, i) => allSerials.indexOf(s) !== i);
    if (dupes.length > 0) {
      toast.error(`มี Serial ซ้ำกันในรายการที่กรอก: ${[...new Set(dupes)].join(", ")} — Serial ต้องไม่ซ้ำกัน`);
      return;
    }

    setSaving(true);
    try {
      const jobId = existingJob
        ? existingJob.id
        : (await createInstallJobRequest(projectId, {
            job_code: `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-J${Math.floor(Math.random() * 9000 + 1000)}`,
            due_date: dueDate || null,
            requested_by: session?.user?.id,
          })).id;

      const job = await fulfillInstallJob({
        jobId, projectId, locationId, warrantyMonths, withdrawals, createdBy: session?.user?.id,
      });
      toast.success(`เบิกสินค้าตาม Job ${job.job_code} แล้ว — ตัดสต็อกและบันทึก Warranty เรียบร้อย`);
      onCreated();
    } catch (err) {
      const msg = errMsg(err);
      if (/duplicate key|already exists|unique constraint/i.test(msg)) {
        toast.error("มี Serial บางตัวมีอยู่ในระบบแล้ว (Serial ต้องไม่ซ้ำกันทั้งระบบ) — กรุณาตรวจสอบแล้วลองใหม่");
      } else {
        toast.error("เบิกสินค้าไม่สำเร็จ: " + msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={existingJob ? `ดำเนินการเบิก — ${existingJob.job_code}` : "New Jobs — ขอเบิกสินค้าออกจากคลัง"} onClose={onClose}>
      {!canFulfill && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          บทบาทของคุณ ({profile?.role}) ส่งได้แค่ "คำขอเบิก" เท่านั้น — การเบิกจริง (ตัดสต็อก + บันทึก Serial) ต้องทำโดย Store หรือ Manager ตามสิทธิ์ในระบบ
        </p>
      )}

      {canFulfill && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="คลังที่จะเบิก" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— เลือกคลัง —</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          {!existingJob && <Field label="กำหนดส่ง"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
        </div>
      )}
      {!canFulfill && !existingJob && (
        <Field label="กำหนดส่ง"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      )}

      {canFulfill && (
        pending.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">ไม่มีรายการค้างเบิก (เบิกครบตามแผนแล้วทุกรายการ)</p>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => {
              const remaining = r.planned_qty - r.withdrawn_qty;
              const serials = serialArrayFor(serialInputs, r.id, remaining);
              return (
                <div key={r.id}>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    {r.model_code} — {r.description} <span className="text-slate-400 font-normal">(ค้างเบิก {remaining} ชิ้น — กรอก Serial ทีละช่อง)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {serials.map((val, idx) => (
                      <input
                        key={idx}
                        value={val}
                        onChange={(e) => setSerialAt(r.id, idx, e.target.value)}
                        placeholder={`Serial #${idx + 1}`}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        {canFulfill ? (
          <button onClick={handleFulfill} disabled={saving || pending.length === 0} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
            {saving ? "กำลังเบิก..." : "ยืนยันเบิกสินค้า"}
          </button>
        ) : (
          <button onClick={handleSubmitRequest} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
            {saving ? "กำลังส่ง..." : "ส่งคำขอเบิก"}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function InstallPeriodTab({ projectId, warrantyMonths }) {
  const { data: jobs, loading, refetch } = useQuery(() => listInstallJobs(projectId), [projectId]);
  const { data: deviceInstallRows, refetch: refetchDeviceInstall } = useQuery(() => listDeviceInstall(projectId), [projectId]);
  const [showModal, setShowModal] = useState(false);
  const [fulfillJob, setFulfillJob] = useState(null);
  const { session, profile } = useAuth();
  const toast = useToast();
  const canCancel = STOCK_ACTION_ROLES.includes(profile?.role);

  async function handleCancel(job) {
    if (!window.confirm(`ยกเลิกการเบิก Job ${job.job_code} หรือไม่? ระบบจะคืนสต็อกที่เบิกไปกลับเข้าคลัง และลบข้อมูล Serial/Warranty ที่ผูกกับ Job นี้`)) return;
    try {
      await cancelInstallJob(job.id, session?.user?.id);
      toast.success(`ยกเลิกการเบิก Job ${job.job_code} แล้ว — คืนสต็อกเรียบร้อย`);
      refetch();
      refetchDeviceInstall();
    } catch (err) {
      toast.error("ยกเลิกไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">การเบิกสินค้าออกจากคลัง</h4>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white px-3 py-1.5 rounded-lg shadow-sm">
          <Plus className="w-4 h-4" /> New Jobs
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Job ที่เบิกแล้วสามารถกด "ยกเลิกการเบิก" ได้ (เฉพาะ Store/Manager/Super Admin) — ระบบคืนสต็อกและลบ Serial/Warranty ที่ผูกกับ Job นั้นให้อัตโนมัติ ไม่ต้องกรอกข้อมูลอะไรเพิ่ม
      </p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Job Code</th>
              <th className="text-left font-medium px-4 py-2.5">วันที่สร้าง</th>
              <th className="text-left font-medium px-4 py-2.5">กำหนดส่ง</th>
              <th className="text-left font-medium px-4 py-2.5">ผู้ร้องขอ</th>
              <th className="text-right font-medium px-4 py-2.5">สถานะ</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={6} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && jobs?.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">ยังไม่มีการเบิกสินค้า</td></tr>}
            {jobs?.map((j) => (
              <tr key={j.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{j.job_code}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(j.created_at).toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{j.due_date || "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{j.requester?.name || "-"}</td>
                <td className="px-4 py-3 text-right">
                  {j.status === "เบิกสินค้าแล้ว" ? (
                    <Pill tone="green">{j.status}</Pill>
                  ) : j.status === "ยกเลิกแล้ว" ? (
                    <Pill tone="rose">{j.status}</Pill>
                  ) : (
                    <Pill tone="amber">{j.status}</Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {j.status !== "เบิกสินค้าแล้ว" && j.status !== "ยกเลิกแล้ว" && (
                    <button onClick={() => setFulfillJob(j)} className="text-xs font-medium text-slate-900 hover:underline">ดำเนินการเบิก</button>
                  )}
                  {j.status === "เบิกสินค้าแล้ว" && canCancel && (
                    <button onClick={() => handleCancel(j)} className="text-xs font-medium text-rose-500 hover:underline">ยกเลิกการเบิก</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <NewJobModal
          projectId={projectId}
          warrantyMonths={warrantyMonths}
          deviceInstallRows={deviceInstallRows}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); refetch(); refetchDeviceInstall(); }}
        />
      )}
      {fulfillJob && (
        <NewJobModal
          projectId={projectId}
          warrantyMonths={warrantyMonths}
          deviceInstallRows={deviceInstallRows}
          existingJob={fulfillJob}
          onClose={() => setFulfillJob(null)}
          onCreated={() => { setFulfillJob(null); refetch(); refetchDeviceInstall(); }}
        />
      )}
    </div>
  );
}

function ReturnToStockModal({ row, projectId, onClose, onReturned }) {
  const { session } = useAuth();
  const toast = useToast();
  const [typedSerial, setTypedSerial] = useState("");
  const [returning, setReturning] = useState(false);
  const matches = typedSerial.trim() === row.serial_no;

  async function handleConfirm() {
    if (!matches) return;
    setReturning(true);
    try {
      const { stockAdjusted } = await returnDeviceDetailToStock({
        deviceDetailId: row.id, projectId, serialNo: row.serial_no, modelCode: row.model_code, returnedBy: session?.user?.id,
      });
      if (stockAdjusted) {
        toast.success(`คืนสินค้า Serial ${row.serial_no} เข้าคลังแล้ว และลบออกจาก Device Detail แล้ว`);
      } else {
        toast.error(`ลบ Serial ${row.serial_no} ออกจาก Device Detail แล้ว แต่ไม่พบรายการเบิกเดิม — กรุณาตรวจสอบยอดสต็อกด้วยตนเอง`);
      }
      onReturned();
    } catch (err) {
      toast.error("ดำเนินการไม่สำเร็จ: " + errMsg(err));
    } finally {
      setReturning(false);
    }
  }

  return (
    <Modal title="ดึงสินค้ากลับเข้าคลัง" onClose={onClose}>
      <p className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2.5 mb-4">
        ⚠️ การกระทำนี้จะ<strong>ลบสินค้าออกจากระบบ</strong> (ออกจาก Device Detail และหยุดนับประกัน) และคืนยอดกลับเข้าคลัง ยืนยันที่จะทำหรือไม่?
      </p>
      <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        รุ่น: <span className="font-medium text-slate-800 dark:text-slate-100">{row.model_code}</span> — {row.description}
      </div>
      <Field label={`พิมพ์ Serial Number "${row.serial_no}" เพื่อยืนยัน`} required>
        <TextInput
          value={typedSerial}
          onChange={(e) => setTypedSerial(e.target.value)}
          placeholder="พิมพ์ Serial ให้ตรงกับที่ยิงออกไป"
          className={typedSerial && !matches ? "border-rose-300" : ""}
        />
      </Field>
      {typedSerial && !matches && <p className="text-xs text-rose-500 -mt-2.5">Serial ไม่ตรงกัน</p>}
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button
          onClick={handleConfirm}
          disabled={!matches || returning}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {returning ? "กำลังดำเนินการ..." : "ยืนยันดึงกลับเข้าคลัง"}
        </button>
      </div>
    </Modal>
  );
}

export function DeviceDetailTab({ projectId }) {
  const { data: rows, loading, refetch } = useQuery(() => listDeviceDetail(projectId), [projectId]);
  const { profile } = useAuth();
  const canReturn = STOCK_ACTION_ROLES.includes(profile?.role);
  const [returnRow, setReturnRow] = useState(null);

  function warrantyStatus(row) {
    const start = new Date(row.start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + (row.warranty_months || 0));
    return new Date() <= end;
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">สินค้าที่เบิกจริง พร้อม Serial + Warranty</h4>
      <p className="text-xs text-slate-400 mb-4">ข้อมูลชุดนี้ถูกสร้างอัตโนมัติจากแท็บ Install Period ตอนกด "ยืนยันเบิกสินค้า" — ไม่มีการพิมพ์ซ้ำ</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Serial No.</th>
              <th className="text-left font-medium px-4 py-2.5">รุ่น</th>
              <th className="text-left font-medium px-4 py-2.5">เริ่มนับ</th>
              <th className="text-left font-medium px-4 py-2.5">ประกัน</th>
              <th className="text-right font-medium px-4 py-2.5">สถานะประกัน</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={6} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">ยังไม่มีสินค้าที่เบิกจริง — เบิกได้ที่แท็บ Install Period</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.serial_no}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.model_code}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.start_date}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.warranty_months} เดือน</td>
                <td className="px-4 py-3 text-right">
                  {warrantyStatus(r) ? <Pill tone="green">ในประกัน</Pill> : <Pill tone="rose">หมดประกัน</Pill>}
                </td>
                <td className="px-4 py-3 text-right">
                  {canReturn && (
                    <button onClick={() => setReturnRow(r)} className="text-xs font-medium text-rose-500 hover:underline">ดึงกลับเข้าคลัง</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {returnRow && (
        <ReturnToStockModal
          row={returnRow}
          projectId={projectId}
          onClose={() => setReturnRow(null)}
          onReturned={() => { setReturnRow(null); refetch(); }}
        />
      )}
    </div>
  );
}

export function PaymentPeriodTab({ projectId }) {
  const { data: rows, loading, refetch } = useQuery(() => listPaymentPeriods(projectId), [projectId]);
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [condition, setCondition] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      await addPaymentPeriod(projectId, {
        period_no: (rows?.length || 0) + 1,
        amount: amount ? Number(amount) : null,
        condition_text: condition || null,
      });
      toast.success("เพิ่มงวดชำระแล้ว");
      setAmount(""); setCondition(""); setShowForm(false);
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(row) {
    try {
      await markPaymentPaid(row.id, row.amount);
      toast.success(`บันทึกงวดที่ ${row.period_no} ว่าชำระแล้ว`);
      refetch();
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete(id) {
    try {
      await deletePaymentPeriod(id);
      toast.success("ลบงวดชำระแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  const totalAmount = (rows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalReceived = (rows || []).reduce((sum, r) => sum + (Number(r.received_amount) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">เงื่อนไขการชำระเงิน</h4>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-900">
          <Plus className="w-4 h-4" /> เพิ่มงวดชำระ
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-3 gap-2 mb-4 items-end">
          <TextInput placeholder="ยอดชำระ" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextInput placeholder="เงื่อนไข เช่น ชำระหลังส่งมอบงาน" value={condition} onChange={(e) => setCondition(e.target.value)} />
          <button onClick={handleAdd} disabled={saving} className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
            {saving ? "..." : "บันทึก"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">งวดที่</th>
              <th className="text-left font-medium px-4 py-2.5">เงื่อนไข</th>
              <th className="text-right font-medium px-4 py-2.5">ยอดชำระ</th>
              <th className="text-right font-medium px-4 py-2.5">รับแล้ว</th>
              <th className="text-right font-medium px-4 py-2.5">สถานะ</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={6} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">ยังไม่มีงวดชำระ</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">งวดที่ {r.period_no}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.condition_text || "-"}</td>
                <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-100 font-medium">{r.amount ? `฿${Number(r.amount).toLocaleString()}` : "-"}</td>
                <td className="px-4 py-3 text-right text-slate-500">{r.received_amount ? `฿${Number(r.received_amount).toLocaleString()}` : "฿0"}</td>
                <td className="px-4 py-3 text-right">
                  {r.paid ? <Pill tone="green">ชำระแล้ว</Pill> : <Pill tone="amber">รอชำระ</Pill>}
                </td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  {!r.paid && <button onClick={() => handleMarkPaid(r)} className="text-xs font-medium text-slate-900 hover:underline">แจ้งชำระแล้ว</button>}
                  <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-900 font-medium">
                <td colSpan={2} className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">รวม / คงเหลือ</td>
                <td className="px-4 py-2.5 text-right text-slate-800 dark:text-slate-100">฿{totalAmount.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-emerald-600">฿{totalReceived.toLocaleString()}</td>
                <td colSpan={2} className="px-4 py-2.5 text-right text-rose-500">ค้าง ฿{(totalAmount - totalReceived).toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function FileTab({ projectId, projectNumber }) {
  const docs = ["Plan", "PO", "Quotation", "Requirement", "BOQ", "SO", "Other"];
  const { data: files, loading, refetch } = useQuery(() => listProjectFiles(projectId), [projectId]);
  const { session } = useAuth();
  const toast = useToast();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  async function handleUploaded(path, file) {
    try {
      await addProjectFile(projectId, {
        storage_path: path, file_name: file.name, uploaded_by: session?.user?.id,
      });
      toast.success(`แนบไฟล์ "${file.name}" แล้ว`);
      refetch();
    } catch (err) {
      toast.error("บันทึกไฟล์ไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim() || !/^https?:\/\//i.test(linkUrl.trim())) {
      toast.error("กรอกลิงก์ให้ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)");
      return;
    }
    setAddingLink(true);
    try {
      // No schema change needed — external links are stored in the same
      // `storage_path` column as uploaded files. The file list below tells
      // them apart by checking if the value is already a full URL (an
      // external link) vs a Supabase Storage object key (an uploaded file,
      // which needs resolving to a public URL first).
      await addProjectFile(projectId, {
        storage_path: linkUrl.trim(),
        file_name: linkLabel.trim() || linkUrl.trim(),
        uploaded_by: session?.user?.id,
      });
      toast.success("เพิ่มลิงก์แล้ว");
      setLinkUrl("");
      setLinkLabel("");
      refetch();
    } catch (err) {
      toast.error("เพิ่มลิงก์ไม่สำเร็จ: " + errMsg(err));
    } finally {
      setAddingLink(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteProjectFile(id);
      toast.success("ลบออกจากรายการแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  function hrefFor(f) {
    return /^https?:\/\//i.test(f.storage_path) ? f.storage_path : getPublicFileUrl(f.storage_path);
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Document Checked</h4>
      <div className="grid grid-cols-4 gap-2 mb-6">
        {docs.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="rounded accent-slate-600" />
            {d}
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">ไฟล์แนบ</h4>
        <FileUploader pathPrefix={`projects/${projectNumber || projectId}`} onUploaded={handleUploaded} />
      </div>
      <p className="text-xs text-slate-400 mb-3">รองรับไฟล์ขนาดใหญ่ 100MB+ — คลิกชื่อไฟล์ในรายการด้านล่างเพื่อเปิด/ดาวน์โหลดกลับได้ทุกเมื่อ</p>

      <div className="flex items-end gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">เพิ่มลิงก์ภายนอก (เช่น Google Drive, OneDrive)</label>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">ชื่อที่แสดง (ไม่บังคับ)</label>
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="เช่น แบบก่อสร้าง"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100"
          />
        </div>
        <button onClick={handleAddLink} disabled={addingLink} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
          {addingLink ? "..." : "เพิ่มลิงก์"}
        </button>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400 text-center py-4">กำลังโหลด...</p>}
        {!loading && files?.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีไฟล์แนบ</p>}
        {files?.map((f) => {
          const isLink = /^https?:\/\//i.test(f.storage_path);
          return (
            <div key={f.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
              <a
                href={hrefFor(f)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-900 hover:text-slate-900 hover:underline min-w-0"
              >
                {isLink ? <LinkIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
                <span className="truncate">{f.file_name}</span>
              </a>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-slate-400 text-xs">{f.uploader?.name || "-"}</span>
                <button onClick={() => handleDelete(f.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppDataTab({ projectId }) {
  const { data: rows, loading, refetch } = useQuery(() => listAppData(projectId), [projectId]);
  const [visible, setVisible] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ application: "", account_id: "", password: "", email: "", customer_name: "" });
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.application.trim()) {
      toast.error("กรอกชื่อ Application ก่อน");
      return;
    }
    setSaving(true);
    try {
      await addAppData(projectId, form);
      toast.success("เพิ่มบัญชี Application แล้ว");
      setForm({ application: "", account_id: "", password: "", email: "", customer_name: "" });
      setShowForm(false);
      refetch();
    } catch (err) {
      toast.error("เพิ่มไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAppData(id);
      toast.success("ลบบัญชีแล้ว");
      refetch();
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">บัญชี Application ของโปรเจคนี้</h4>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-900">
          <Plus className="w-4 h-4" /> เพิ่มบัญชี
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-5 gap-2 mb-4 items-end">
          <TextInput placeholder="Application" value={form.application} onChange={(e) => setForm((f) => ({ ...f, application: e.target.value }))} />
          <TextInput placeholder="ID" value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))} />
          <TextInput placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <TextInput placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <button onClick={handleAdd} disabled={saving} className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60">
            {saving ? "..." : "บันทึก"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Application</th>
              <th className="text-left font-medium px-4 py-2.5">ID</th>
              <th className="text-left font-medium px-4 py-2.5">Password</th>
              <th className="text-left font-medium px-4 py-2.5">Email</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={5} className="text-center text-slate-400 py-6">กำลังโหลด...</td></tr>}
            {!loading && rows?.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">ยังไม่มีบัญชี Application</td></tr>}
            {rows?.map((r, i) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.application}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.account_id}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{visible[r.id] ? (r.password || "-") : "•".repeat((r.password || "").length || 8)}</span>
                    <button onClick={() => setVisible((v) => ({ ...v, [r.id]: !v[r.id] }))} className="text-slate-400 hover:text-slate-900">
                      {visible[r.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.email || "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">ข้อมูลรหัสผ่านถูกจำกัดการมองเห็นตามสิทธิ์ผู้ใช้งาน และมีการบันทึก Log ทุกครั้งที่มีการเปิดดู</p>
    </div>
  );
}

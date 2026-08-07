import React, { useState, useEffect } from "react";
import { Search, Download, RefreshCw, Plus, PackagePlus, Trash2, FileSpreadsheet, Upload, Pencil, Link2 } from "lucide-react";
import { TextInput, Select, Pill, Card, Modal, Field, SearchSelect } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listStockSummary, listLocations, listStockItems, createStockItem, updateStockItem, receiveStock, deleteStockItem, bulkUpsertStockItems } from "../../api/stock.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const STOCK_IN_ROLES = ["Super Admin", "Manager", "Store"];

// Flexible header matching — accepts a few common variations so the sheet
// doesn't have to match one exact set of column names.
const HEADER_MAP = {
  // "model number" is the Sourcing wording, now used as the column label here too.
  model_code: ["model number", "model_number", "modelnumber", "model code", "model_code", "modelcode", "รหัสสินค้า", "รหัส", "model"],
  description: ["product name", "product_name", "productname", "description", "รายละเอียด", "ชื่อสินค้า", "desc"],
  category: ["category", "หมวดหมู่", "หมวด"],
  sub_category: ["sub-category", "sub category", "sub_category", "subcategory", "หมวดหมู่ย่อย", "หมวดย่อย"],
  unit: ["unit", "หน่วย", "หน่วยนับ"],
  reorder_point: ["reorder point", "reorder_point", "จุดสั่งซื้อ", "จุดสั่งซื้อขั้นต่ำ"],
};

function normalizeRow(rawRow) {
  const normalized = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const cleanKey = String(key).trim().toLowerCase();
    for (const [field, variants] of Object.entries(HEADER_MAP)) {
      if (variants.includes(cleanKey)) {
        normalized[field] = typeof value === "string" ? value.trim() : value;
      }
    }
  }
  return normalized;
}

function ImportProductsModal({ onClose, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState("");

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setParsing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(evt.target.result, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        const parsed = rawRows.map(normalizeRow).filter((r) => r.model_code);
        if (parsed.length === 0) {
          setParseError("ไม่พบข้อมูลที่ใช้ได้ในไฟล์ — ต้องมีคอลัมน์ Model Number อย่างน้อย");
        }
        setRows(parsed);
      } catch (err) {
        setParseError("อ่านไฟล์ไม่สำเร็จ: ตรวจสอบว่าเป็นไฟล์ .xlsx หรือ .xls ที่ถูกต้อง");
      } finally {
        setParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      // Postgres upsert can't touch the same row twice in one statement —
      // if the sheet has the same Model Code more than once (a data-entry
      // issue in the source file, not something this can safely guess the
      // "right" answer for), de-dupe by keeping the last occurrence and
      // clearly tell the user which codes need checking in their sheet.
      const seen = new Map();
      const dupeCodes = new Set();
      for (const r of rows) {
        if (seen.has(r.model_code)) dupeCodes.add(r.model_code);
        seen.set(r.model_code, r);
      }
      const deduped = Array.from(seen.values());

      const payload = deduped.map((r) => ({
        model_code: r.model_code,
        description: r.description || null,
        category: r.category || null,
        sub_category: r.sub_category || null,
        unit: r.unit || "ชิ้น",
        reorder_point: r.reorder_point ? Number(r.reorder_point) || 0 : 0,
      }));
      const result = await bulkUpsertStockItems(payload);

      if (dupeCodes.size > 0) {
        toast.error(
          `นำเข้า ${result.length} รายการแล้ว แต่พบ Model Number ซ้ำในไฟล์ ${dupeCodes.size} รหัส (ใช้แถวสุดท้ายที่เจอแทน): ${Array.from(dupeCodes).join(", ")} — กรุณาตรวจสอบไฟล์ต้นฉบับว่าตั้งใจให้ใช้รหัสเดียวกันจริงหรือพิมพ์ผิด`
        );
      } else {
        toast.success(`นำเข้าสินค้าแล้ว ${result.length} รายการ`);
      }
      onImported();
    } catch (err) {
      toast.error("นำเข้าไม่สำเร็จ: " + errMsg(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="นำเข้า Product Master จาก Excel" onClose={onClose}>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        ไฟล์ .xlsx ต้องมีหัวคอลัมน์ (แถวแรก) อย่างน้อย <strong>Model Number</strong> — คอลัมน์อื่นที่รองรับ:
        Product Name, Category, Unit, Reorder Point (ไม่บังคับ, ชื่อคอลัมน์เป็นภาษาไทยก็ได้ เช่น รหัสสินค้า, รายละเอียด, หมวดหมู่, หน่วย)
      </p>
      <p className="text-xs text-slate-400 mb-4">
        ถ้า Model Number ในไฟล์ตรงกับสินค้าที่มีอยู่แล้ว ระบบจะ<strong>อัปเดต</strong>ข้อมูลแถวนั้นแทนการสร้างซ้ำ — นำเข้าไฟล์เดิมซ้ำได้อย่างปลอดภัย
      </p>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-6 cursor-pointer hover:border-indigo-300 mb-4">
        <Upload className="w-5 h-5 text-slate-400" />
        <span className="text-sm text-slate-500 dark:text-slate-400">{fileName || "คลิกเพื่อเลือกไฟล์ .xlsx / .xls"}</span>
        <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      </label>

      {parsing && <p className="text-sm text-slate-400 text-center">กำลังอ่านไฟล์...</p>}
      {parseError && <p className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{parseError}</p>}

      {rows.length > 0 && (() => {
        const seen = new Set();
        const dupes = new Set();
        rows.forEach((r) => {
          if (seen.has(r.model_code)) dupes.add(r.model_code);
          seen.add(r.model_code);
        });
        return dupes.size > 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2 mb-3">
            ⚠️ พบ Model Number ซ้ำในไฟล์ {dupes.size} รหัส: {Array.from(dupes).join(", ")} — ถ้ากดนำเข้า จะใช้ข้อมูลจากแถวสุดท้ายที่เจอของแต่ละรหัสแทน แนะนำให้กลับไปตรวจสอบไฟล์ต้นฉบับก่อนว่าตั้งใจให้ซ้ำจริงหรือพิมพ์ผิด
          </p>
        ) : null;
      })()}

      {rows.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">ตัวอย่างข้อมูล ({rows.length} รายการ)</p>
          <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Model Number</th>
                  <th className="text-left font-medium px-3 py-2">Product Name</th>
                  <th className="text-left font-medium px-3 py-2">Category</th>
                  <th className="text-left font-medium px-3 py-2">Sub-Category</th>
                  <th className="text-left font-medium px-3 py-2">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100">{r.model_code}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{r.description || "-"}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{r.category || "-"}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{r.sub_category || "-"}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{r.unit || "ชิ้น"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && <p className="text-xs text-slate-400 mt-1.5">แสดง 50 รายการแรก (มีทั้งหมด {rows.length} รายการ)</p>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleImport} disabled={rows.length === 0 || importing} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {importing ? "กำลังนำเข้า..." : `นำเข้า ${rows.length || ""} รายการ`}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Product Master create/edit.
 *
 * `item` null = create, otherwise edit that row. One component for both so the
 * two forms can never drift apart.
 *
 * Labels follow the Sourcing vocabulary (Model Number / Product Name /
 * Category); the database columns are still model_code / description, which is
 * deliberate — renaming live columns would touch every stock query for no
 * user-visible gain.
 */
function ProductModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(item);
  const [form, setForm] = useState({
    model_code: item?.model ?? "",
    description: item?.desc ?? "",
    category: item?.category ?? "",
    sub_category: item?.subCategory ?? "",
    unit: item?.unit ?? "ชิ้น",
    reorder_point: item?.reorderPoint ?? "",
    sale_price: item?.salePrice ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.model_code.trim()) {
      toast.error("กรอก Model Number ก่อน");
      return;
    }
    setSaving(true);
    const payload = {
      model_code: form.model_code.trim(),
      description: form.description || null,
      category: form.category || null,
      sub_category: form.sub_category || null,
      unit: form.unit || "ชิ้น",
      reorder_point: form.reorder_point ? Number(form.reorder_point) : 0,
      // ราคาขาย: ว่างได้ ระบบจะไม่ดึงไปใส่ใบเสนอราคาถ้ายังไม่ตั้ง
      sale_price: form.sale_price === "" ? null : Number(form.sale_price),
    };
    try {
      if (editing) {
        await updateStockItem(item.id, payload);
        toast.success(`บันทึก "${payload.model_code}" แล้ว`);
      } else {
        await createStockItem(payload);
        toast.success(`เพิ่มสินค้า "${payload.model_code}" แล้ว`);
      }
      onSaved();
    } catch (err) {
      const msg = errMsg(err);
      // Unique violation on model_code — the most common failure here.
      toast.error(
        /duplicate|unique/i.test(msg)
          ? `Model Number "${payload.model_code}" ถูกใช้กับสินค้าอื่นแล้ว`
          : (editing ? "บันทึกไม่สำเร็จ: " : "เพิ่มไม่สำเร็จ: ") + msg
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `แก้ไขสินค้า — ${item.model}` : "เพิ่มสินค้าใหม่ (Product Master)"} onClose={onClose}>
      {editing && item.sourceProductId && (
        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 mb-1">
          <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>สินค้านี้ถูกดึงมาจาก Sourcing — แก้ไขที่นี่จะไม่ย้อนกลับไปแก้ข้อมูลฝั่ง Sourcing</span>
        </div>
      )}
      <Field label="Model Number" required><TextInput value={form.model_code} onChange={(e) => setForm((f) => ({ ...f, model_code: e.target.value }))} /></Field>
      <Field label="Product Name"><TextInput value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
      <Field label="ราคาขาย (บาท/หน่วย)">
        <TextInput type="number" step="0.01" value={form.sale_price} placeholder="ยังไม่ตั้งราคา"
                   onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))} />
        <p className="text-xs text-slate-400 mt-1">ดึงไปใส่ใบเสนอราคาอัตโนมัติ · สินค้าที่มาจาก Sourcing จะเติมราคาที่แนะนำมาให้</p>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="หมวดหมู่ (Category)"><TextInput placeholder="เช่น Smart Home" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></Field>
        <Field label="หมวดหมู่ย่อย (Sub-Category)"><TextInput placeholder="เช่น Gateway, Control Panel" value={form.sub_category} onChange={(e) => setForm((f) => ({ ...f, sub_category: e.target.value }))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="หน่วยนับ"><TextInput value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></Field>
        <Field label="จุดสั่งซื้อขั้นต่ำ"><TextInput type="number" value={form.reorder_point} onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
        </button>
      </div>
    </Modal>
  );
}

function ReceiveStockModal({ onClose, onCreated }) {
  const { session } = useAuth();
  const toast = useToast();
  const { data: items } = useQuery(() => listStockItems(), []);
  const { data: locations } = useQuery(() => listLocations(), []);
  const [stockItemId, setStockItemId] = useState("");
  const [stockItemLabel, setStockItemLabel] = useState("");
  const [locationId, setLocationId] = useState("");
  const [roundNo, setRoundNo] = useState("");
  const [serialsText, setSerialsText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!stockItemId || !locationId) {
      toast.error("เลือกสินค้าและคลังก่อน");
      return;
    }
    const serials = serialsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (serials.length === 0) {
      toast.error("กรอก Serial อย่างน้อย 1 ชิ้น (บรรทัดละ 1 Serial)");
      return;
    }
    setSaving(true);
    try {
      const { qty } = await receiveStock({ stockItemId, locationId, serials, roundNo, createdBy: session?.user?.id });
      toast.success(`รับเข้าคลังแล้ว ${qty} ชิ้น`);
      onCreated();
    } catch (err) {
      toast.error("รับเข้าคลังไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="รับสินค้าเข้าคลัง (Stock In)" onClose={onClose}>
      <Field label="Round No (ไม่บังคับ)"><TextInput value={roundNo} onChange={(e) => setRoundNo(e.target.value)} placeholder="เลขอ้างอิงล็อตการรับ" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <SearchSelect
          label="สินค้า"
          required
          asyncSearch={(q) => {
            const ql = q.toLowerCase();
            return Promise.resolve(
              (items || [])
                .filter((i) => !ql || i.model_code?.toLowerCase().includes(ql) || i.description?.toLowerCase().includes(ql))
                .slice(0, 50)
                .map((i) => ({ label: `${i.model_code} — ${i.description || ""}`, id: i.id, raw: i }))
            );
          }}
          value={stockItemLabel}
          onChange={(label, id) => { setStockItemLabel(label); setStockItemId(id || ""); }}
          placeholder="พิมพ์ค้นหาสินค้า..."
        />
        <Field label="คลังที่จะรับเข้า" required>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— เลือกคลัง —</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Serial Number (บรรทัดละ 1 ชิ้น)">
        <textarea
          rows={4}
          value={serialsText}
          onChange={(e) => setSerialsText(e.target.value)}
          placeholder={"สแกน/พิมพ์ Serial ทีละบรรทัด เช่น\nBC340029B519\n6900051"}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono"
        />
      </Field>
      <p className="text-xs text-slate-400 -mt-2.5">สินค้าจะเข้าเป็น On Hand สถานะ "สินค้าปกติ" ทันที — ยังไม่เริ่มนับประกัน จนกว่าจะถูกเบิกไปติดตั้งจริง</p>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {saving ? "กำลังรับเข้า..." : "รับเข้าคลัง"}
        </button>
      </div>
    </Modal>
  );
}

export default function StockSummary() {
  const [query, setQuery] = useState("");
  const [locationId, setLocationId] = useState("all");
  const [showProductModal, setShowProductModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const { profile } = useAuth();
  const toast = useToast();
  const canReceive = STOCK_IN_ROLES.includes(profile?.role);

  const { data: locations } = useQuery(() => listLocations(), []);
  const { data: rows, error, loading, refetch } = useQuery(
    () => listStockSummary({ locationId, query }),
    [locationId, query]
  );

  const totalPages = Math.max(1, Math.ceil((rows?.length || 0) / PAGE_SIZE));
  const pagedRows = (rows || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [locationId, query, rows?.length]);

  async function handleDeleteItem(item) {
    if (!window.confirm(`ลบสินค้า "${item.model}" ออกจากระบบหรือไม่?`)) return;
    try {
      await deleteStockItem(item.id);
      toast.success(`ลบสินค้า "${item.model}" แล้ว`);
      refetch();
    } catch (err) {
      const msg = errMsg(err);
      if (/foreign key|violates|referenced/i.test(msg)) {
        toast.error(`ลบไม่ได้ — สินค้า "${item.model}" มีประวัติการเคลื่อนไหวสต็อกอยู่แล้ว (รับเข้า/เบิก/จอง) ระบบไม่ให้ลบเพื่อรักษาประวัติ`);
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
            <span>E-Service</span><span>/</span><span>Stock</span><span>/</span><span className="text-indigo-600 font-medium">Inventory</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Stock Summary</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <FileSpreadsheet className="w-4 h-4" /> นำเข้าจาก Excel
          </button>
          <button onClick={() => setShowProductModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Plus className="w-4 h-4" /> เพิ่มสินค้าใหม่
          </button>
          <button
            onClick={() => setShowReceiveModal(true)}
            disabled={!canReceive}
            title={!canReceive ? "เฉพาะ Super Admin/Manager/Store" : ""}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PackagePlus className="w-4 h-4" /> รับสินค้าเข้าคลัง
          </button>
        </div>
      </div>

      <Card className="p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          <TextInput type="date" placeholder="คงเหลือ ณ วันที่" />
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="all">All Location</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select defaultValue="สถานะทั้งหมด">
            <option>สถานะทั้งหมด</option>
            <option>สินค้าปกติ</option>
            <option>สินค้าเสีย</option>
            <option>ยืมสินค้า</option>
          </Select>
          <div className="relative">
            <TextInput placeholder="ค้นหา Model Number / Product Name..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetch} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">ค้นหา</button>
          <button onClick={refetch} className="p-2 rounded-xl text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"><RefreshCw className="w-4 h-4" /></button>
          <button className="p-2 rounded-xl text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"><Download className="w-4 h-4" /></button>
        </div>
      </Card>

      {error && <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4 mb-5">โหลดข้อมูลไม่สำเร็จ: {errMsg(error)}</div>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-4 py-3">Model Number</th>
              <th className="text-left font-medium px-4 py-3">Product Name</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-left font-medium px-4 py-3">Sub-Category</th>
              <th className="text-right font-medium px-4 py-3">ราคาขาย</th>
              <th className="text-right font-medium px-4 py-3">On Hand</th>
              <th className="text-right font-medium px-4 py-3">Reserved</th>
              <th className="text-right font-medium px-4 py-3">Available</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading && <tr><td colSpan={9} className="text-center text-slate-400 py-10">กำลังโหลด...</td></tr>}
            {!loading && (!rows || rows.length === 0) && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-10">ยังไม่มีสินค้าในระบบ — กด "เพิ่มสินค้าใหม่" ก่อน</td></tr>
            )}
            {pagedRows.map((r) => {
              const available = r.onHand - r.reserved;
              return (
                <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1.5">
                      {r.model}
                      {r.sourceProductId && (
                        <span title="ดึงมาจาก Sourcing" className="text-indigo-400"><Link2 className="w-3.5 h-3.5" /></span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.desc}</td>
                  <td className="px-4 py-3 text-slate-500">{r.category || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.subCategory || "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                    {r.salePrice != null
                      ? Number(r.salePrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{r.onHand}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{r.reserved}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {available <= 0 ? <Pill tone="rose">{available}</Pill> : <span className="text-emerald-600">{available}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => setEditItem(r)} title="แก้ไขข้อมูลสินค้า" className="text-slate-400 hover:text-indigo-600 p-1"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteItem(r)} title="ลบสินค้า" className="text-slate-400 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700">
          <span>
            แสดง {rows?.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, rows?.length || 0)} จากทั้งหมด {rows?.length ?? 0} รายการ
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ก่อนหน้า
              </button>
              <span className="px-2 text-slate-500 dark:text-slate-400">หน้า {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ถัดไป
              </button>
            </div>
          )}
        </div>
      </Card>

      {showProductModal && (
        <ProductModal onClose={() => setShowProductModal(false)} onSaved={() => { setShowProductModal(false); refetch(); }} />
      )}
      {showReceiveModal && (
        <ReceiveStockModal onClose={() => setShowReceiveModal(false)} onCreated={() => { setShowReceiveModal(false); refetch(); }} />
      )}
      {editItem && (
        <ProductModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); refetch(); }} />
      )}

      {showImportModal && (
        <ImportProductsModal onClose={() => setShowImportModal(false)} onImported={() => { setShowImportModal(false); refetch(); }} />
      )}
    </div>
  );
}

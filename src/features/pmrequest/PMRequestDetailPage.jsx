import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Trash2, FileText, Link as LinkIcon } from "lucide-react";
import { Pill, Card, Field, TextInput, TextArea, Select } from "../../components/ui/primitives.jsx";
import CommentPanel from "../../components/ui/CommentPanel.jsx";
import FileUploader from "../../components/ui/FileUploader.jsx";
import { getPublicFileUrl } from "../../lib/upload.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning.js";
import {
  getPMRequest, createPMRequest, updatePMRequest, deletePMRequest,
  listPMRequestFiles, addPMRequestFile, deletePMRequestFile,
} from "../../api/pmRequests.js";
import { listProjects } from "../../api/projects.js";
import { listUsers } from "../../api/users.js";
import { errMsg, toDatetimeLocalValue, fromDatetimeLocalValue } from "../../lib/format.js";

const REQUEST_TYPES = ["ขอออกแบบระบบ", "ขอสำรวจหน้างาน", "ขอทดสอบสินค้า", "ขอประเมินสเปค/ความเข้ากันได้ของสินค้า", "อื่นๆ"];
const STATUS_FLOW = ["คำขอใหม่", "รับเรื่องแล้ว", "กำลังดำเนินการ", "เสร็จสิ้น", "ยกเลิก"];
const STATUS_TONE = { "คำขอใหม่": "slate", "รับเรื่องแล้ว": "indigo", "กำลังดำเนินการ": "blue", "เสร็จสิ้น": "green", "ยกเลิก": "rose" };

const BLANK_STATE = {
  requestType: REQUEST_TYPES[0], customerNameFree: "", projectId: "", channel: "", neededAt: "",
  detail: "", assignedPm: "", status: "คำขอใหม่",
};

function dbRowToState(row) {
  return {
    requestType: row.request_type,
    customerNameFree: row.customer_name_free || "",
    projectId: row.project_id || "",
    channel: row.channel || "",
    neededAt: toDatetimeLocalValue(row.needed_at),
    detail: row.detail || "",
    assignedPm: row.assigned_pm || "",
    status: row.status,
  };
}

function stateToDbPayload(state) {
  return {
    request_type: state.requestType,
    customer_name_free: state.customerNameFree || null,
    project_id: state.projectId || null,
    channel: state.channel || null,
    needed_at: fromDatetimeLocalValue(state.neededAt),
    detail: state.detail || null,
    assigned_pm: state.assignedPm || null,
    status: state.status,
  };
}

function AttachmentSection({ pmRequestId }) {
  const toast = useToast();
  const { session } = useAuth();
  const { data: files, loading, refetch } = useQuery(() => listPMRequestFiles(pmRequestId), [pmRequestId]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  async function handleUploaded(path, file) {
    try {
      await addPMRequestFile(pmRequestId, { storage_path: path, file_name: file.name, uploaded_by: session?.user?.id });
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
      await addPMRequestFile(pmRequestId, { storage_path: linkUrl.trim(), file_name: linkLabel.trim() || linkUrl.trim(), uploaded_by: session?.user?.id });
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
      await deletePMRequestFile(id);
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
    <Card className="p-6 mt-5">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">ไฟล์แนบ / ลิงก์ (เช่น แบบบ้าน, สเปค)</h4>
        <FileUploader pathPrefix={`pm-requests/${pmRequestId}`} onUploaded={handleUploaded} />
      </div>
      <p className="text-xs text-slate-400 mb-3">รองรับไฟล์ขนาดใหญ่ 100MB+ หรือแปะลิงก์จาก Google Drive/OneDrive ก็ได้</p>

      <div className="flex items-end gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">แปะลิงก์ภายนอก</label>
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
            placeholder="เช่น แบบบ้าน"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100"
          />
        </div>
        <button onClick={handleAddLink} disabled={addingLink} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
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
              <a href={hrefFor(f)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 hover:underline min-w-0">
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
    </Card>
  );
}

export default function PMRequestDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = id === "new";
  const toast = useToast();
  const { profile, session } = useAuth();

  const { data: reqData, error: loadError, loading, refetch } = useQuery(
    () => (isNew ? Promise.resolve(null) : getPMRequest(id)),
    [id]
  );
  const { data: projects } = useQuery(() => listProjects(), []);
  const { data: users } = useQuery(() => listUsers(), []);

  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [state, setState] = useState(BLANK_STATE);
  useUnsavedChangesWarning(isDirty);

  function goBack() {
    if (isDirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้จริงหรือไม่?")) return;
    navigate("/pm-request");
  }

  useEffect(() => {
    if (reqData) setState(dbRowToState(reqData));
  }, [reqData]);

  function markDirty(updater) {
    setIsDirty(true);
    setState(updater);
  }

  const saverName = profile?.name || session?.user?.email || "ผู้ใช้งาน";

  async function handleSave() {
    setSaveError("");
    try {
      if (isNew) {
        const created = await createPMRequest({
          request_code: `PM-${Date.now()}`,
          requester_id: session?.user?.id,
          ...stateToDbPayload(state),
        });
        setIsDirty(false);
        toast.success(`${saverName} ได้สร้างคำขอ ${created.request_code} แล้ว`);
        navigate(`/pm-request/${created.id}`, { replace: true });
        return;
      }
      await updatePMRequest(id, stateToDbPayload(state));
      setIsDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      toast.success(`${saverName} ได้บันทึกคำขอ ${reqData?.request_code} แล้ว`);
      refetch();
    } catch (err) {
      setSaveError(errMsg(err));
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบคำขอ ${reqData?.request_code} ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deletePMRequest(id);
      toast.success(`ลบคำขอ ${reqData?.request_code} แล้ว`);
      navigate("/pm-request");
    } catch (err) {
      toast.error("ลบไม่สำเร็จ: " + errMsg(err));
    }
  }

  if (!isNew && loading) return <div className="text-center text-slate-400 py-20">กำลังโหลด...</div>;
  if (!isNew && loadError) return <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4">โหลดไม่สำเร็จ: {errMsg(loadError)}</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            <button onClick={() => goBack()} className="hover:text-indigo-600 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> PM Request
            </button>
            <span>/</span>
            <span>{isNew ? "New Request" : "Edit Request"}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{isNew ? "คำขอใหม่" : reqData?.request_code}</h1>
            <Pill tone={STATUS_TONE[state.status] || "slate"}>{state.status}</Pill>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isDirty && <Pill tone="rose">มีการแก้ไขที่ยังไม่บันทึก</Pill>}
          {savedFlash && <Pill tone="green">บันทึกข้อมูลแล้ว ✓</Pill>}
          {saveError && <Pill tone="rose">{saveError}</Pill>}
          {!isNew && (
            <button onClick={handleDelete} title="ลบคำขอนี้" className="p-2 rounded-xl text-rose-500 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10">
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

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <Card className="p-6">
            <div className="grid grid-cols-2 gap-x-5">
              <Field label="ประเภทคำขอ" required>
                <Select value={state.requestType} onChange={(e) => markDirty((s) => ({ ...s, requestType: e.target.value }))}>
                  {REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="สถานะ" required>
                <Select value={state.status} onChange={(e) => markDirty((s) => ({ ...s, status: e.target.value }))}>
                  {STATUS_FLOW.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="ลูกค้า (ไม่บังคับ)">
                <TextInput placeholder="พิมพ์ชื่อลูกค้าอิสระ" value={state.customerNameFree} onChange={(e) => markDirty((s) => ({ ...s, customerNameFree: e.target.value }))} />
              </Field>
              <Field label="Project อ้างอิง (ไม่บังคับ)">
                <Select value={state.projectId} onChange={(e) => markDirty((s) => ({ ...s, projectId: e.target.value }))}>
                  <option value="">— ไม่ผูก Project —</option>
                  {projects?.map((p) => <option key={p.id} value={p.id}>{p.project_number} — {p.site?.name}</option>)}
                </Select>
              </Field>
              <Field label="ช่องทาง">
                <TextInput value={state.channel} onChange={(e) => markDirty((s) => ({ ...s, channel: e.target.value }))} placeholder="เช่น Online, โทรศัพท์" />
              </Field>
              <Field label="วันที่ต้องการใช้">
                <TextInput type="datetime-local" value={state.neededAt} onChange={(e) => markDirty((s) => ({ ...s, neededAt: e.target.value }))} />
              </Field>
              <Field label="พนักงาน PM ที่ดูแล">
                <Select value={state.assignedPm} onChange={(e) => markDirty((s) => ({ ...s, assignedPm: e.target.value }))}>
                  <option value="">— ยังไม่มอบหมาย —</option>
                  {users?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </Select>
              </Field>
            </div>
            <Field label="รายละเอียดคำขอ">
              <TextArea rows={4} value={state.detail} onChange={(e) => markDirty((s) => ({ ...s, detail: e.target.value }))} />
            </Field>
            <p className="text-xs text-slate-400 -mt-2.5">เปลี่ยนสถานะเป็น "เสร็จสิ้น" เมื่อจบงานแล้ว ตัวเลือกอยู่ในช่อง Status ด้านบน</p>
          </Card>
          {isNew ? (
            <p className="text-sm text-slate-400 text-center py-6">บันทึกข้อมูลก่อน (กด Save Data) จึงจะแนบไฟล์/ลิงก์ได้</p>
          ) : (
            <AttachmentSection pmRequestId={id} />
          )}
        </div>
        <div className="col-span-12 lg:col-span-4">
          <CommentPanel entityType="pm_request" entityId={isNew ? null : id} statusOptions={STATUS_FLOW} />
        </div>
      </div>
    </div>
  );
}

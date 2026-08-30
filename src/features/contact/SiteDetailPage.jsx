import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Card, Field, TextInput, TextArea, Pill } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { getSite, updateSite, deleteSite } from "../../api/contacts.js";
import { listProjectsForSite } from "../../api/projects.js";
import { projectStatusTone } from "../../lib/mockData";
import { useToast } from "../../hooks/useToast.jsx";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning.js";
import { errMsg } from "../../lib/format.js";

export default function SiteDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const { data: site, loading, error: loadError, refetch } = useQuery(() => getSite(id), [id]);
  const { data: linkedProjects } = useQuery(() => listProjectsForSite(id), [id]);

  const [form, setForm] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (site) {
      setForm({
        name: site.name || "", address: site.address || "", province: site.province || "",
        google_map: site.google_map || "", gps_lat: site.gps_lat ?? "", gps_lng: site.gps_lng ?? "",
      });
    }
  }, [site]);

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
      await updateSite(id, {
        name: form.name, address: form.address || null, province: form.province || null,
        google_map: form.google_map || null,
        gps_lat: form.gps_lat === "" ? null : form.gps_lat,
        gps_lng: form.gps_lng === "" ? null : form.gps_lng,
      });
      setIsDirty(false);
      toast.success(`บันทึกโครงการ "${form.name}" แล้ว`);
      refetch();
    } catch (err) {
      toast.error("บันทึกไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบโครงการ "${form.name}" ทิ้งถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteSite(id);
      toast.success(`ลบโครงการ "${form.name}" แล้ว`);
      navigate("/contact");
    } catch (err) {
      const msg = errMsg(err);
      if (/foreign key|violates|referenced/i.test(msg)) {
        toast.error(`ลบไม่ได้ — โครงการนี้มี Project ผูกอยู่แล้ว`);
      } else {
        toast.error("ลบไม่สำเร็จ: " + msg);
      }
    }
  }

  if (loading || !form) return <div className="text-center text-slate-400 py-20">กำลังโหลด...</div>;
  if (loadError) return <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm rounded-xl p-4">โหลดไม่สำเร็จ: {errMsg(loadError)}</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-900 mb-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Contact / Project
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{form.name || "โครงการ"}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {isDirty && <Pill tone="rose">มีการแก้ไขที่ยังไม่บันทึก</Pill>}
          <button onClick={handleDelete} title="ลบโครงการนี้" className="p-2 rounded-xl text-rose-500 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={goBack} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">ย้อนกลับ</button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? "กำลังบันทึก..." : "Save Data"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <Card className="p-6">
            <Field label="ชื่อโครงการ" required><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="ที่อยู่"><TextArea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-x-5">
              <Field label="จังหวัด"><TextInput value={form.province} onChange={(e) => set("province", e.target.value)} /></Field>
              <Field label="Google Map"><TextInput value={form.google_map} onChange={(e) => set("google_map", e.target.value)} /></Field>
              <Field label="GPS LAT"><TextInput value={form.gps_lat} onChange={(e) => set("gps_lat", e.target.value)} /></Field>
              <Field label="GPS LAG"><TextInput value={form.gps_lng} onChange={(e) => set("gps_lng", e.target.value)} /></Field>
            </div>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Project ที่ใช้โครงการนี้</h3>
            {(!linkedProjects || linkedProjects.length === 0) && <p className="text-sm text-slate-400">ยังไม่มี Project ที่ผูกกับโครงการนี้</p>}
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

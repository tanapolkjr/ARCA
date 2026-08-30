import React, { useRef, useState } from "react";
import { Paperclip, CheckCircle2, XCircle } from "lucide-react";
import { uploadFileResumable } from "../../lib/upload.js";
import { errMsg } from "../../lib/format.js";

/**
 * Drop-in uploader for any File/BOQ/PO/photo attachment across the app.
 * Handles files from a few KB up to several hundred MB via resumable (TUS)
 * upload — see src/lib/upload.js for why this matters.
 *
 * Usage:
 *   <FileUploader
 *     pathPrefix={`projects/${projectId}`}
 *     onUploaded={(path) => saveAttachmentRecord(path)}
 *   />
 */

/**
 * Bug fix: Supabase Storage rejects object keys containing spaces, Thai
 * script, "&", etc. with a 400 "Invalid key" error — this was breaking
 * every upload where the original filename wasn't plain ASCII. The fix
 * only sanitizes the *storage key*; the real filename is still shown in
 * the UI from the `project_files.file_name` DB column, so nothing is lost.
 */
function sanitizeForStorageKey(name) {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > -1 ? name.slice(lastDot).replace(/[^a-zA-Z0-9.]/g, "") : "";
  const base = lastDot > -1 ? name.slice(0, lastDot) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "file";
  return safeBase + ext;
}

export default function FileUploader({ pathPrefix, onUploaded, accept }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState(null); // null | "success" | "error"
  const [errorText, setErrorText] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);
    setProgress(0);
    setFileName(file.name);

    const safePrefix = (pathPrefix || "files").replace(/[^a-zA-Z0-9_/-]+/g, "_");
    const objectPath = `${safePrefix}/${Date.now()}-${sanitizeForStorageKey(file.name)}`;

    try {
      const { path } = await uploadFileResumable(file, objectPath, setProgress);
      setStatus("success");
      onUploaded?.(path, file);
    } catch (err) {
      setStatus("error");
      setErrorText(errMsg(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-900 disabled:opacity-50"
      >
        <Paperclip className="w-4 h-4" /> {uploading ? "กำลังอัปโหลด..." : "แนบไฟล์"}
      </button>
      <input ref={inputRef} type="file" accept={accept} onChange={handleFile} className="hidden" />

      {uploading && (
        <div className="mt-2.5 max-w-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="truncate">{fileName}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1">อัปโหลดแบบ Resumable — หากเน็ตหลุด สามารถอัปโหลดไฟล์เดิมซ้ำเพื่อทำต่อจากจุดที่ค้างได้</p>
        </div>
      )}

      {status === "success" && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> อัปโหลด "{fileName}" สำเร็จ
        </p>
      )}
      {status === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-rose-600 mt-1.5">
          <XCircle className="w-3.5 h-3.5" /> อัปโหลดไม่สำเร็จ: {errorText}
        </p>
      )}
    </div>
  );
}

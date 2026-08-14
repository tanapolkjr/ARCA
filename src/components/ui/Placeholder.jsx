import React from "react";
import { Construction } from "lucide-react";

export default function Placeholder({ title, note }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-6">{title}</h1>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Construction className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-600 mb-1.5">โมดูลนี้ยังไม่ได้ลงรายละเอียดออกแบบ</h2>
        <p className="text-sm text-slate-400 max-w-md">
          {note || "หน้านี้อยู่ในรายการ \"Open Items\" ของเอกสาร Spec — ต้องคุยรายละเอียดเพิ่มก่อนออกแบบหน้าจอจริง"}
        </p>
      </div>
    </div>
  );
}

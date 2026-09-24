import React from "react";
import { Construction } from "lucide-react";

export default function Placeholder({ title, note }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-6">{title}</h1>
      <div className="bg-white dark:bg-stone-800 rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
          <Construction className="w-6 h-6 text-stone-400" />
        </div>
        <h2 className="text-sm font-semibold text-stone-600 mb-1.5">โมดูลนี้ยังไม่ได้ลงรายละเอียดออกแบบ</h2>
        <p className="text-sm text-stone-400 max-w-md">
          {note || "หน้านี้อยู่ในรายการ \"Open Items\" ของเอกสาร Spec — ต้องคุยรายละเอียดเพิ่มก่อนออกแบบหน้าจอจริง"}
        </p>
      </div>
    </div>
  );
}

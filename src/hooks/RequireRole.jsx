import React from "react";
import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuth } from "./useAuth.jsx";

/**
 * Wrap a route subtree to limit it to certain roles.
 *
 *   <Route element={<RequireRole roles={SOURCING_ROLES} />}>...</Route>
 *
 * This is a convenience gate only — the real enforcement is the RLS policies
 * in supabase/migrations/0014_sourcing_module.sql. Keep the two in step: if
 * you widen the roles here, widen them in the migration too.
 */
export default function RequireRole({ roles, children }) {
  const { profile, profileLoaded } = useAuth();

  // Profile arrives one request after the session — don't flash "no access".
  if (!profileLoaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <ShieldOff className="w-5 h-5 text-slate-400" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          เข้าถึงส่วนนี้ไม่ได้
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          ส่วนนี้เปิดให้เฉพาะ {roles.join(" และ ")} เพราะมีข้อมูลต้นทุนและกำไร
          หากต้องใช้งาน ให้ Super Admin ปรับสิทธิ์ให้ที่หน้าการตั้งค่า
        </p>
        <Link
          to="/"
          className="inline-block mt-6 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          กลับหน้า Dashboard
        </Link>
      </div>
    );
  }

  return children ?? null;
}

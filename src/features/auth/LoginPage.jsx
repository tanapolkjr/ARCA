import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { errMsg } from "../../lib/format.js";
import { ArcaSeal } from "../../components/brand/ArcaSeal";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(errMsg(signInError));
      return;
    }
    navigate(location.state?.from?.pathname || "/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <ArcaSeal className="w-20 h-20 text-slate-900 dark:text-slate-100" />
          <div className="text-center leading-none">
            <div className="brand-wordmark text-slate-900 dark:text-slate-100 text-2xl">ARCA HAUS</div>
            <div className="text-[10px] tracking-[0.25em] text-slate-400 mt-1.5">E-SERVICE</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7">
          <h1 className="text-lg font-bold text-slate-900 mb-1">เข้าสู่ระบบ</h1>
          <p className="text-sm text-slate-400 mb-6">E-Service Backend System</p>

          {error && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 text-rose-600 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">อีเมล</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60"
            >
              {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-5">
          ไม่มีระบบสมัครสมาชิกเอง — บัญชีผู้ใช้งานถูกสร้างโดยแอดมินผ่าน Supabase Dashboard เท่านั้น
        </p>
      </div>
    </div>
  );
}

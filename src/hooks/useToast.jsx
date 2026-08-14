import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, ...toast }]);
    if (toast.type !== "error") {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const success = useCallback((message) => push({ type: "success", message }), [push]);
  const error = useCallback((message) => push({ type: "error", message }), [push]);

  // The Sourcing module calls toast(message, kind). Providing it here means
  // none of its ~50 call sites needed editing during the merge.
  const toast = useCallback(
    (message, kind = "success") => push({ type: kind, message }),
    [push]
  );

  return (
    <ToastContext.Provider value={{ success, error, toast, push, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm ${
              t.type === "error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"
            }`}
          >
            {t.type === "error" ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-white/70 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

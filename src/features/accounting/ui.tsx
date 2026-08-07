import React from 'react';
import { X } from 'lucide-react';
import { STATUS_LABEL } from '@/accounting-lib/types';

/**
 * ชิ้นส่วนฟอร์มของโมดูลบัญชี
 * ใช้คลาส Tailwind ชุดเดียวกับหน้าจออื่นของแพลตฟอร์ม (indigo / rounded-xl / slate)
 * ไม่ใช้ design token ของโมดูล Sourcing เพื่อให้หน้าตากลมกลืนกับระบบเดิม
 */

export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 ' +
  'bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 ' +
  'disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400';

export function Field({
  label, required, hint, children, className = '',
}: {
  label: string; required?: boolean; hint?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      {...props}
      className={`${inputCls} text-right tabular-nums ${props.className ?? ''}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} resize-y ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function PrimaryButton({
  children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
        text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm
        disabled:opacity-60 disabled:cursor-not-allowed ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
        text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700
        hover:bg-slate-50 dark:hover:bg-slate-800
        disabled:opacity-60 disabled:cursor-not-allowed ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  sent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  expired: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  issued: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ordered: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  received: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium
      ${STATUS_TONE[status] ?? STATUS_TONE.draft}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Modal({
  title, onClose, children, wide,
}: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print"
         onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full
          ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-400">
        {text}
      </td>
    </tr>
  );
}

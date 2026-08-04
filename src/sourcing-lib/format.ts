import type { Currency } from './types';

const thb = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** THB always renders as ฿1,247.50 (spec §3). */
export function fmtTHB(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `฿${thb.format(n)}`;
}

const CODE: Record<Currency, string> = { CNY: 'CN¥', USD: 'US$', THB: '฿' };

export function fmtMoney(n: number | null | undefined, currency: Currency): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${CODE[currency]} ${thb.format(n)}`;
}

export function fmtPercent(n: number | null | undefined, dp = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

export function fmtScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(1);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

/** "Days in current status" for dashboard cards. */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function parseNum(v: string): number {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

/** Supabase errors are plain objects, not Error instances — surface their message. */
export function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
    return (e as any).message;
  }
  return fallback;
}

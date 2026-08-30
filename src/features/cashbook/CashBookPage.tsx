import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Copy, KeyRound, Link2, Lock, Pencil, Plus,
  Repeat, Search, Trash2, Unlock, Wallet as WalletIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate, money, round2 } from '@/accounting-lib/calc';
import type { CashEntry, Wallet } from '@/accounting-lib/types';
import {
  cashEntryLinks, createWallet, deleteCashEntry, duplicateCashEntry,
  listCashCategories, listCashEntries, deleteWallet, listWallets, monthlySummary, saveCashEntry,
  setWalletPin, clearWalletPin, updateWallet, walletAudit, walletBalances, walletHasPin,
} from '@/accounting-api/cashbook';
import type { CashEntryFull, WalletPatch } from '@/accounting-api/cashbook';
import { getDefaultCompany } from '@/accounting-api/setup';
import {
  EmptyRow, Field, GhostButton, Modal, NumberInput, PrimaryButton, Select, TextArea, TextInput,
} from '../accounting/ui';

const firstOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * สมุดรายรับ-รายจ่ายของบริษัท
 *
 * เอกสาร AR/AP ครอบคลุมเฉพาะเงินที่มีบิลผูกกับงาน แต่ค่าใช้จ่ายจริงส่วนใหญ่
 * ไม่มีใบสั่งซื้อ (ค่าน้ำมัน กล่องพัสดุ ค่าโฆษณา) ถ้าไม่มีที่ลง คนจะกลับไปใช้
 * Excel แล้วตัวเลขจะแยกเป็นสองโลก
 */
export function CashBookPage() {
  const { toast } = useToast();
  const userId = useUserId();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [walletFilter, setWalletFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'in' | 'out' | 'transfer'>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<CashEntry> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { entry: CashEntryFull; linkedDoc: string | null } | null>(null);
  const [showWallets, setShowWallets] = useState(false);
  const [viewing, setViewing] = useState<CashEntryFull | null>(null);

  // หน้าจัดการต้องเห็นกระเป๋าที่ปิดใช้งานด้วย ไม่งั้นเปิดกลับมาใช้ไม่ได้
  const walletsQ = useQuery(() => listWallets(false), []);
  const catsQ = useQuery(() => listCashCategories(), []);
  const balancesQ = useQuery(() => walletBalances(), []);
  const entriesQ = useQuery(
    () => listCashEntries({
      from, to,
      walletId: walletFilter || undefined,
      categoryId: categoryFilter || undefined,
      entryType: typeFilter || undefined,
      search: search || undefined,
    }),
    [from, to, walletFilter, categoryFilter, typeFilter, search]
  );
  const summaryQ = useQuery(() => monthlySummary(from, to), [from, to]);

  const period = useMemo(() => {
    const rows = entriesQ.data ?? [];
    let income = 0, expense = 0;
    for (const e of rows) {
      if (e.entry_type === 'in') income += Number(e.amount) || 0;
      if (e.entry_type === 'out') expense += Number(e.amount) || 0;
    }
    return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
  }, [entriesQ.data]);

  const reload = () => {
    void entriesQ.refetch(); void balancesQ.refetch(); void summaryQ.refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            รายรับ-รายจ่าย
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            บันทึกเงินเข้า-ออกทุกกระเป๋า เพื่อประเมินรายได้ต่อเดือน
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <GhostButton onClick={() => setShowWallets(true)}>
            <WalletIcon className="w-4 h-4" /> จัดการกระเป๋าเงิน
          </GhostButton>
          <GhostButton onClick={() => setEditing({ entry_type: 'transfer', entry_date: today() })}>
            <Repeat className="w-4 h-4" /> ย้ายโอน
          </GhostButton>
          <GhostButton
            className="!text-emerald-700 !border-emerald-200 dark:!border-emerald-900"
            onClick={() => setEditing({ entry_type: 'in', entry_date: today() })}
          >
            <ArrowDownLeft className="w-4 h-4" /> รับเงิน
          </GhostButton>
          <PrimaryButton onClick={() => setEditing({ entry_type: 'out', entry_date: today() })}>
            <ArrowUpRight className="w-4 h-4" /> จ่ายเงิน
          </PrimaryButton>
        </div>
      </div>

      {/* ยอดคงเหลือแต่ละกระเป๋า — ยอดสะสม ไม่ตัดตามช่วงวันที่ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balancesQ.data?.map((b) => (
          <div key={b.wallet.id} className="bg-white dark:bg-slate-900 rounded-2xl border
            border-slate-100 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-500">{b.wallet.name}</div>
            <div className={`text-lg font-bold tabular-nums mt-1
              ${b.balance < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
              {money(b.balance)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 p-4 flex flex-wrap items-end gap-3">
        <Field label="ตั้งแต่" className="w-40">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึง" className="w-40">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="กระเป๋า" className="w-44">
          <Select value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)}>
            <option value="">ทุกกระเป๋า</option>
            {walletsQ.data?.filter((w) => w.is_active)
              .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <Field label="ประเภท" className="w-32">
          <Select value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="">ทั้งหมด</option>
            <option value="in">รับเงิน</option>
            <option value="out">จ่ายเงิน</option>
            <option value="transfer">ย้ายโอน</option>
          </Select>
        </Field>
        <Field label="หมวดหมู่" className="w-44">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">ทุกหมวดหมู่</option>
            {catsQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="ค้นหา" className="w-52">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput className="pl-9" placeholder="รายละเอียด…"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <div className="ml-auto flex gap-6 text-sm">
          <Stat label="รายรับ" value={period.income} tone="text-emerald-600" />
          <Stat label="รายจ่าย" value={period.expense} tone="text-rose-500" />
          <Stat label="คงเหลือ" value={period.net}
                tone={period.net < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
        dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-28">วันที่</th>
                <th className="text-left font-medium px-4 py-3 w-20">ประเภท</th>
                <th className="text-left font-medium px-4 py-3">รายละเอียด</th>
                <th className="text-left font-medium px-4 py-3 w-40">หมวดหมู่</th>
                <th className="text-left font-medium px-4 py-3 w-36">กระเป๋า</th>
                <th className="text-right font-medium px-4 py-3 w-32">จำนวนเงิน</th>
                <th className="text-right font-medium px-4 py-3 w-28">หัก ณ ที่จ่าย</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {entriesQ.loading && <EmptyRow colSpan={8} text="กำลังโหลด…" />}
              {!entriesQ.loading && (entriesQ.data?.length ?? 0) === 0 && (
                <EmptyRow colSpan={8} text="ยังไม่มีรายการในช่วงนี้" />
              )}
              {entriesQ.data?.map((e) => (
                <tr key={e.id} className="border-t border-slate-50 dark:border-slate-800
                  hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                    {docDate(e.entry_date)}
                  </td>
                  <td className="px-4 py-3">
                    {e.entry_type === 'in' && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                        <ArrowDownLeft className="w-3.5 h-3.5" /> รับ
                      </span>
                    )}
                    {e.entry_type === 'out' && (
                      <span className="inline-flex items-center gap-1 text-rose-500 text-xs">
                        <ArrowUpRight className="w-3.5 h-3.5" /> จ่าย
                      </span>
                    )}
                    {e.entry_type === 'transfer' && (
                      <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                        <Repeat className="w-3.5 h-3.5" /> ย้าย
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setViewing(e)}
                            className="text-left text-slate-700 dark:text-slate-200 hover:text-slate-900">
                      {e.description}
                    </button>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {e.ar_document_id && (
                        <span className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> จากการรับชำระ
                        </span>
                      )}
                      {e.has_vat && (
                        <span className="text-[11px] text-slate-400">
                          VAT {money(e.vat_amount)}
                        </span>
                      )}
                      {e.wht_cert_no && (
                        <span className="text-[11px] text-slate-400">
                          หนังสือรับรอง {e.wht_cert_no}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{e.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.wallet?.name}
                    {e.to_wallet && <span> → {e.to_wallet.name}</span>}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium
                    ${e.entry_type === 'in' ? 'text-emerald-600'
                      : e.entry_type === 'out' ? 'text-rose-500' : 'text-slate-500'}`}>
                    {money(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {Number(e.wht_amount) > 0 ? money(e.wht_amount) : '—'}
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    <div className="inline-flex items-center gap-0.5">
                      <button title="แก้ไข" onClick={() => setEditing(e)}
                              className="text-slate-400 hover:text-slate-900 p-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="ทำซ้ำเป็นรายการวันนี้"
                        onClick={async () => {
                          try {
                            await duplicateCashEntry(e, userId);
                            toast('ทำซ้ำรายการแล้ว');
                            reload();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'ทำซ้ำไม่สำเร็จ', 'error');
                          }
                        }}
                        className="text-slate-400 hover:text-slate-900 p-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="ลบ"
                        onClick={async () => {
                          // ตรวจก่อนว่ารายการนี้มาจากการรับชำระไหม จะได้เตือนให้ตรงเรื่อง
                          let linkedDoc: string | null = null;
                          try { linkedDoc = (await cashEntryLinks(e.id)).paymentDocNo; } catch { /* ไม่สำคัญพอจะขวางการลบ */ }
                          setConfirmDelete({ entry: e, linkedDoc });
                        }}
                        className="text-slate-400 hover:text-rose-500 p-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {(entriesQ.data?.length ?? 0) > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-100 dark:border-slate-700
                  bg-slate-50/60 dark:bg-slate-800/40">
                  <td colSpan={5} className="px-4 py-3 text-xs text-slate-500">
                    รวม {entriesQ.data?.length} รายการ · รับ {money(period.income)} · จ่าย {money(period.expense)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-bold
                    ${period.net < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
                    {money(period.net)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {(summaryQ.data?.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100
          dark:border-slate-800 p-5">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">สรุปรายเดือน</h2>
          <p className="text-xs text-slate-500 mb-3">
            การย้ายโอนระหว่างกระเป๋าไม่นับเป็นรายรับหรือรายจ่าย เพราะเงินยังอยู่ในบริษัท
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium py-2">เดือน</th>
                <th className="text-right font-medium py-2">รายรับ</th>
                <th className="text-right font-medium py-2">รายจ่าย</th>
                <th className="text-right font-medium py-2">คงเหลือ</th>
                <th className="text-left font-medium py-2 pl-6">หมวดที่ใช้มากสุด</th>
              </tr>
            </thead>
            <tbody>
              {summaryQ.data?.map((m) => (
                <tr key={m.month} className="border-t border-slate-50 dark:border-slate-800">
                  <td className="py-2 font-medium text-slate-700 dark:text-slate-200">{m.month}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{money(m.income)}</td>
                  <td className="py-2 text-right tabular-nums text-rose-500">{money(m.expense)}</td>
                  <td className={`py-2 text-right tabular-nums font-semibold
                    ${m.net < 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-100'}`}>
                    {money(m.net)}
                  </td>
                  <td className="py-2 pl-6 text-xs text-slate-500">
                    {m.byCategory.slice(0, 3).map((c) => `${c.name} ${money(c.amount)}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EntryModal
          entry={editing}
          wallets={walletsQ.data ?? []}
          categories={catsQ.data ?? []}
          userId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {viewing && (
        <Modal title="รายละเอียดรายการ" onClose={() => setViewing(null)}>
          <div className="flex items-baseline gap-3">
            <span className={`text-2xl font-bold tabular-nums
              ${viewing.entry_type === 'in' ? 'text-emerald-600'
                : viewing.entry_type === 'out' ? 'text-rose-500' : 'text-slate-600'}`}>
              {money(viewing.amount)}
            </span>
            <span className="text-sm text-slate-500">
              {viewing.entry_type === 'in' ? 'รับเงิน'
                : viewing.entry_type === 'out' ? 'จ่ายเงิน' : 'ย้ายโอน'}
            </span>
          </div>

          <dl className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
            <Row2 k="วันที่" v={docDate(viewing.entry_date)} />
            <Row2 k="รายละเอียด" v={viewing.description} />
            {viewing.entry_type === 'transfer' ? (
              <Row2 k="ย้ายเงิน"
                    v={`${viewing.wallet?.name ?? '—'} → ${viewing.to_wallet?.name ?? '—'}`} />
            ) : (
              <>
                <Row2 k="กระเป๋าเงิน" v={viewing.wallet?.name ?? '—'} />
                <Row2 k="หมวดหมู่" v={viewing.category?.name ?? 'ไม่ระบุ'} />
              </>
            )}
            {viewing.has_vat && <Row2 k="ภาษีมูลค่าเพิ่ม" v={money(viewing.vat_amount)} />}
            {Number(viewing.wht_amount) > 0 && (
              <>
                <Row2 k="หัก ณ ที่จ่าย" v={money(viewing.wht_amount)} />
                <Row2 k="เลขที่หนังสือรับรอง" v={viewing.wht_cert_no ?? 'ยังไม่ได้คีย์'} />
              </>
            )}
            {viewing.project && (
              <Row2 k="โปรเจกต์" v={viewing.project.project_number} />
            )}
            {viewing.vendor && <Row2 k="ผู้ขาย" v={viewing.vendor.display_name} />}
            {viewing.ar_document_id && <Row2 k="ที่มา" v="เกิดจากการรับชำระเงินของเอกสารขาย" />}
            <Row2 k="บันทึกเมื่อ" v={docDate(viewing.created_at?.slice(0, 10))} />
          </dl>

          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => setViewing(null)}>ปิด</GhostButton>
            <PrimaryButton onClick={() => { setEditing(viewing); setViewing(null); }}>
              <Pencil className="w-4 h-4" /> แก้ไข
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="ลบรายการนี้?" onClose={() => setConfirmDelete(null)}>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <div className="font-medium text-slate-800 dark:text-slate-100">
              {confirmDelete.entry.description}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {docDate(confirmDelete.entry.entry_date)} · {money(confirmDelete.entry.amount)} ·{' '}
              {confirmDelete.entry.wallet?.name}
            </div>
          </div>

          {confirmDelete.linkedDoc && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
              dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-200
              flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                รายการนี้เกิดจากการรับชำระของเอกสาร <strong>{confirmDelete.linkedDoc}</strong> —
                ลบแล้วเงินจะหายจากสมุดและยอดกระเป๋า แต่ <strong>ประวัติการรับชำระยังอยู่</strong>{' '}
                และบิลยังเป็นชำระแล้วเหมือนเดิม
                ถ้าต้องการยกเลิกการรับเงินจริงๆ ให้ไปลบที่ประวัติการรับชำระในเอกสารแทน
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => setConfirmDelete(null)}>ไม่ลบ</GhostButton>
            <button
              onClick={async () => {
                try {
                  await deleteCashEntry(confirmDelete.entry.id);
                  toast('ลบรายการแล้ว');
                  setConfirmDelete(null);
                  reload();
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
                }
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700"
            >
              ลบรายการ
            </button>
          </div>
        </Modal>
      )}

      {showWallets && (
        <WalletModal
          wallets={walletsQ.data ?? []}
          onClose={() => setShowWallets(false)}
          onSaved={() => { void walletsQ.refetch(); void balancesQ.refetch(); }}
        />
      )}
    </div>
  );
}

function Row2({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
      <dd className="flex-1 text-slate-800 dark:text-slate-100 break-words">{v}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-right">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-bold tabular-nums ${tone}`}>{money(value)}</div>
    </div>
  );
}

function EntryModal({
  entry, wallets, categories, userId, onClose, onSaved,
}: {
  entry: Partial<CashEntry>;
  wallets: Wallet[];
  categories: { id: string; name: string; direction: string }[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Partial<CashEntry>>({
    entry_type: 'out', entry_date: today(), amount: 0, has_vat: false,
    wht_type: 'none', wht_amount: 0, ...entry,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CashEntry, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const isTransfer = f.entry_type === 'transfer';

  const visibleCats = categories.filter(
    (c) => c.direction === 'both' || c.direction === f.entry_type
  );

  return (
    <Modal
      title={entry.id
        ? 'แก้ไขรายการ'
        : f.entry_type === 'in' ? 'บันทึกรับเงิน'
          : f.entry_type === 'transfer' ? 'ย้ายโอนระหว่างกระเป๋า' : 'บันทึกจ่ายเงิน'}
      onClose={onClose} wide
    >
      {entry.ar_document_id && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs
          text-slate-500 flex gap-2">
          <Link2 className="w-4 h-4 shrink-0" />
          รายการนี้เกิดจากการรับชำระเงินของเอกสารขาย แก้ไขที่นี่จะไม่ย้อนกลับไปแก้ยอดในบิล
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="ประเภท" required>
          <Select value={f.entry_type} onChange={(e) => set('entry_type', e.target.value)}>
            <option value="in">รับเงิน</option>
            <option value="out">จ่ายเงิน</option>
            <option value="transfer">ย้ายโอนระหว่างกระเป๋า</option>
          </Select>
        </Field>
        <Field label="วันที่" required>
          <TextInput type="date" value={f.entry_date ?? ''}
                     onChange={(e) => set('entry_date', e.target.value)} />
        </Field>
        <Field label="จำนวนเงิน" required>
          <NumberInput value={f.amount ?? 0} step="0.01"
                       onChange={(e) => set('amount', Number(e.target.value))} />
        </Field>

        <Field label={isTransfer ? 'จากกระเป๋า' : 'กระเป๋า'} required>
          <Select value={f.wallet_id ?? ''} onChange={(e) => set('wallet_id', e.target.value)}>
            <option value="">— เลือก —</option>
            {wallets.filter((w) => w.is_active)
              .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        {isTransfer ? (
          <Field label="ไปกระเป๋า" required>
            <Select value={f.to_wallet_id ?? ''} onChange={(e) => set('to_wallet_id', e.target.value)}>
              <option value="">— เลือก —</option>
              {wallets.filter((w) => w.is_active && w.id !== f.wallet_id)
                .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="หมวดหมู่">
            <Select value={f.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {visibleCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="รายละเอียด" required className="md:col-span-3">
          <TextArea rows={2} value={f.description ?? ''}
                    onChange={(e) => set('description', e.target.value)} />
        </Field>

        {!isTransfer && (
          <>
            <Field label="ภาษีมูลค่าเพิ่ม" hint="มี VAT ต้องมีใบกำกับแนบ">
              <Select value={f.has_vat ? 'y' : 'n'}
                      onChange={(e) => set('has_vat', e.target.value === 'y')}>
                <option value="n">ไม่มี VAT</option>
                <option value="y">มี VAT</option>
              </Select>
            </Field>
            {f.has_vat && (
              <Field label="ยอด VAT">
                <NumberInput value={f.vat_amount ?? 0} step="0.01"
                             onChange={(e) => set('vat_amount', Number(e.target.value))} />
              </Field>
            )}
            <Field label="หัก ณ ที่จ่าย">
              <Select value={f.wht_type ?? 'none'} onChange={(e) => set('wht_type', e.target.value)}>
                <option value="none">ไม่มีหัก</option>
                <option value="withheld_from_us">ถูกหัก (ลูกค้าหักเรา)</option>
                <option value="we_withhold">เป็นผู้หัก ต้องนำส่ง</option>
              </Select>
            </Field>
            {f.wht_type !== 'none' && (
              <>
                <Field label="ยอดหัก">
                  <NumberInput value={f.wht_amount ?? 0} step="0.01"
                               onChange={(e) => set('wht_amount', Number(e.target.value))} />
                </Field>
                <Field label="เลขที่หนังสือรับรอง">
                  <TextInput value={f.wht_cert_no ?? ''}
                             onChange={(e) => set('wht_cert_no', e.target.value)} />
                </Field>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            if (!f.wallet_id) { toast('เลือกกระเป๋าก่อน', 'error'); return; }
            if (isTransfer && !f.to_wallet_id) { toast('เลือกกระเป๋าปลายทางก่อน', 'error'); return; }
            if (!f.description?.trim()) { toast('ใส่รายละเอียดก่อน', 'error'); return; }
            if (!f.amount || f.amount <= 0) { toast('ใส่จำนวนเงินก่อน', 'error'); return; }
            setBusy(true);
            try {
              const company = await getDefaultCompany();
              await saveCashEntry({ ...f, company_id: f.company_id ?? company?.id }, userId);
              toast('บันทึกแล้ว');
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
            } finally { setBusy(false); }
          }}
        >
          บันทึก
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/**
 * จัดการกระเป๋าเงิน
 *
 * แก้และลบต้องใส่รหัสของกระเป๋านั้น ตรวจที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ —
 * policy update/delete ของตาราง wallets ถูกถอดออกแล้ว (migration 0024)
 * ทางเดียวที่แก้ได้คือผ่านฟังก์ชันที่ตรวจรหัสให้ก่อน
 */
function WalletModal({
  wallets, onClose, onSaved,
}: {
  wallets: Wallet[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ name: string; wallet_type: Wallet['wallet_type']; opening_balance: number }>(
    { name: '', wallet_type: 'bank', opening_balance: 0 });
  const [editing, setEditing] = useState<Wallet | null>(null);

  return (
    <Modal title="กระเป๋าเงิน" onClose={onClose} wide>
      <div className="flex flex-col gap-2">
        {wallets.map((w) => (
          <WalletRow key={w.id} wallet={w} onEdit={() => setEditing(w)} />
        ))}
        {wallets.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีกระเป๋าเงิน</p>}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
        <Field label="ชื่อกระเป๋าใหม่">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="ประเภท">
          <Select value={draft.wallet_type}
                  onChange={(e) => setDraft({ ...draft, wallet_type: e.target.value as Wallet['wallet_type'] })}>
            <option value="bank">บัญชีธนาคาร</option>
            <option value="cash">เงินสด</option>
            <option value="promptpay">พร้อมเพย์</option>
            <option value="credit_card">บัตรเครดิต</option>
          </Select>
        </Field>
        <Field label="ยอดยกมา">
          <NumberInput value={draft.opening_balance} step="0.01"
                       onChange={(e) => setDraft({ ...draft, opening_balance: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <PrimaryButton
          onClick={async () => {
            if (!draft.name.trim()) { toast('ใส่ชื่อกระเป๋าก่อน', 'error'); return; }
            try {
              const company = await getDefaultCompany();
              await createWallet({ ...draft, company_id: company?.id ?? null });
              setDraft({ name: '', wallet_type: 'bank', opening_balance: 0 });
              toast('เพิ่มกระเป๋าแล้ว');
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'เพิ่มไม่สำเร็จ', 'error');
            }
          }}
        >
          <Plus className="w-4 h-4" /> เพิ่มกระเป๋า
        </PrimaryButton>
      </div>

      {editing && (
        <WalletEditModal wallet={editing} onClose={() => setEditing(null)}
                         onSaved={() => { setEditing(null); onSaved(); }} />
      )}
    </Modal>
  );
}

function WalletRow({ wallet, onEdit }: { wallet: Wallet; onEdit: () => void }) {
  const lockedQ = useQuery(() => walletHasPin(wallet.id), [wallet.id]);
  return (
    <div className="flex items-center justify-between text-sm border
      border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {lockedQ.data
          ? <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          : <Unlock className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
        <span className="truncate">{wallet.name}</span>
        {!wallet.is_active && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800
            text-slate-500">ปิดใช้งาน</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-400 tabular-nums">
          ยอดยกมา {money(wallet.opening_balance)}
        </span>
        <button onClick={onEdit} className="text-slate-400 hover:text-slate-900 p-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function WalletEditModal({
  wallet, onClose, onSaved,
}: { wallet: Wallet; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const lockedQ = useQuery(() => walletHasPin(wallet.id), [wallet.id]);
  const auditQ = useQuery(() => walletAudit(wallet.id), [wallet.id]);

  const [pin, setPin] = useState('');
  const [f, setF] = useState<WalletPatch>({
    name: wallet.name,
    wallet_type: wallet.wallet_type,
    bank_name: wallet.bank_name,
    account_no: wallet.account_no,
    opening_balance: Number(wallet.opening_balance) || 0,
    is_active: wallet.is_active,
  });
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = Boolean(lockedQ.data);

  return (
    <Modal title={`แก้ไขกระเป๋า — ${wallet.name}`} onClose={onClose} wide>
      {locked ? (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200
          dark:border-amber-800 px-4 py-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            กระเป๋านี้ล็อกรหัสไว้ — ต้องใส่รหัสถึงจะบันทึกได้
            ระบบตรวจรหัสที่ฐานข้อมูล ข้ามด้วยการแก้หน้าจอไม่ได้
          </span>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 flex gap-2
          text-xs text-slate-500">
          <Unlock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>ยังไม่ได้ล็อกรหัส — ใครที่มีสิทธิ์บัญชีก็แก้ได้ ตั้งรหัสได้ที่ข้างล่าง</span>
        </div>
      )}

      {locked && (
        <Field label="รหัสกระเป๋าเงิน" required>
          <TextInput type="password" value={pin} autoFocus
                     placeholder="ใส่รหัสเพื่อยืนยัน"
                     onChange={(e) => setPin(e.target.value)} />
        </Field>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="ชื่อกระเป๋า" required>
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="ประเภท">
          <Select value={f.wallet_type}
                  onChange={(e) => setF({ ...f, wallet_type: e.target.value as Wallet['wallet_type'] })}>
            <option value="bank">บัญชีธนาคาร</option>
            <option value="cash">เงินสด</option>
            <option value="promptpay">พร้อมเพย์</option>
            <option value="credit_card">บัตรเครดิต</option>
          </Select>
        </Field>
        <Field label="ธนาคาร">
          <TextInput value={f.bank_name ?? ''} onChange={(e) => setF({ ...f, bank_name: e.target.value })} />
        </Field>
        <Field label="เลขที่บัญชี">
          <TextInput value={f.account_no ?? ''} onChange={(e) => setF({ ...f, account_no: e.target.value })} />
        </Field>
        <Field label="ยอดยกมา" hint="แก้แล้วยอดคงเหลือขยับทันที และถูกบันทึกไว้ในประวัติ">
          <NumberInput value={f.opening_balance} step="0.01"
                       onChange={(e) => setF({ ...f, opening_balance: Number(e.target.value) })} />
        </Field>
        <Field label="สถานะ">
          <Select value={f.is_active ? 'y' : 'n'}
                  onChange={(e) => setF({ ...f, is_active: e.target.value === 'y' })}>
            <option value="y">ใช้งาน</option>
            <option value="n">ปิดใช้งาน</option>
          </Select>
        </Field>
      </div>

      <div className="flex justify-between gap-2">
        <button
          className="text-xs text-rose-500 hover:underline"
          onClick={async () => {
            try {
              await deleteWallet(wallet.id, pin);
              toast('ลบกระเป๋าแล้ว');
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
            }
          }}
        >
          ลบกระเป๋านี้
        </button>
        <div className="flex gap-2">
          <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
          <PrimaryButton
            disabled={busy}
            onClick={async () => {
              if (!f.name.trim()) { toast('ใส่ชื่อกระเป๋าก่อน', 'error'); return; }
              if (locked && !pin) { toast('ใส่รหัสกระเป๋าเงินก่อน', 'error'); return; }
              setBusy(true);
              try {
                await updateWallet(wallet.id, pin, f);
                toast('บันทึกแล้ว');
                onSaved();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
              } finally { setBusy(false); }
            }}
          >
            บันทึก
          </PrimaryButton>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2
          flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-slate-400" /> รหัสกระเป๋าเงิน
        </h3>
        <p className="text-xs text-slate-500 mb-2">
          ตั้งไว้ให้เฉพาะคนที่ถือเงินรู้ · รหัสเก็บแบบเข้ารหัส ไม่มีใครอ่านตัวเลขจริงได้
          {locked && ' · Super Admin รีเซ็ตให้ได้ถ้าลืม'}
        </p>
        <div className="flex gap-2 items-end">
          <Field label={locked ? 'ตั้งรหัสใหม่' : 'ตั้งรหัส (อย่างน้อย 4 ตัว)'} className="w-56">
            <TextInput type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
          </Field>
          <GhostButton
            onClick={async () => {
              try {
                await setWalletPin(wallet.id, newPin, pin || undefined);
                setNewPin('');
                toast(locked ? 'เปลี่ยนรหัสแล้ว' : 'ตั้งรหัสแล้ว');
                void lockedQ.refetch();
                void auditQ.refetch();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'ตั้งรหัสไม่สำเร็จ', 'error');
              }
            }}
          >
            {locked ? 'เปลี่ยนรหัส' : 'ตั้งรหัส'}
          </GhostButton>
          {locked && (
            <GhostButton
              onClick={async () => {
                try {
                  await clearWalletPin(wallet.id, pin);
                  toast('ยกเลิกการล็อกแล้ว');
                  void lockedQ.refetch();
                  void auditQ.refetch();
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
                }
              }}
            >
              ยกเลิกการล็อก
            </GhostButton>
          )}
        </div>
      </div>

      {(auditQ.data?.length ?? 0) > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <h3 className="text-xs font-semibold text-slate-500 mb-1.5">ประวัติการแก้ไข</h3>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {auditQ.data?.map((a) => (
              <div key={a.id} className="text-[11px] text-slate-400 flex gap-2">
                <span className="w-20 shrink-0">{docDate(a.changed_at.slice(0, 10))}</span>
                <span className="w-24 shrink-0">{a.action}</span>
                <span className="flex-1">{a.detail ?? ''}</span>
                <span>{a.user?.name ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

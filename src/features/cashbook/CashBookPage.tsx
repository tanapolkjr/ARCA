import { useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Plus, Repeat, Trash2, Wallet as WalletIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { docDate, money, round2 } from '@/accounting-lib/calc';
import type { CashEntry, Wallet } from '@/accounting-lib/types';
import {
  deleteCashEntry, listCashCategories, listCashEntries, listWallets,
  monthlySummary, saveCashEntry, saveWallet, walletBalances,
} from '@/accounting-api/cashbook';
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
  const [editing, setEditing] = useState<Partial<CashEntry> | null>(null);
  const [showWallets, setShowWallets] = useState(false);

  const walletsQ = useQuery(() => listWallets(), []);
  const catsQ = useQuery(() => listCashCategories(), []);
  const balancesQ = useQuery(() => walletBalances(), []);
  const entriesQ = useQuery(
    () => listCashEntries({ from, to, walletId: walletFilter || undefined }),
    [from, to, walletFilter]
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
        <div className="ml-auto flex gap-2">
          <GhostButton onClick={() => setShowWallets(true)}>
            <WalletIcon className="w-4 h-4" /> จัดการกระเป๋าเงิน
          </GhostButton>
          <PrimaryButton onClick={() => setEditing({ entry_type: 'out', entry_date: today() })}>
            <Plus className="w-4 h-4" /> บันทึกรายการ
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
        <Field label="กระเป๋า" className="w-48">
          <Select value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)}>
            <option value="">ทุกกระเป๋า</option>
            {walletsQ.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
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
                    <button className="text-left hover:text-indigo-600"
                            onClick={() => setEditing(e)}>{e.description}</button>
                    {e.project && (
                      <div className="text-[11px] text-slate-400">{e.project.project_code}</div>
                    )}
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
                  <td className="px-2">
                    <button
                      className="text-slate-300 hover:text-rose-500 p-1"
                      onClick={async () => {
                        await deleteCashEntry(e.id);
                        toast('ลบรายการแล้ว');
                        reload();
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
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
  wallets: { id: string; name: string }[];
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
    <Modal title={entry.id ? 'แก้ไขรายการ' : 'บันทึกรายการ'} onClose={onClose} wide>
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
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        {isTransfer ? (
          <Field label="ไปกระเป๋า" required>
            <Select value={f.to_wallet_id ?? ''} onChange={(e) => set('to_wallet_id', e.target.value)}>
              <option value="">— เลือก —</option>
              {wallets.filter((w) => w.id !== f.wallet_id)
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

function WalletModal({
  wallets, onClose, onSaved,
}: {
  wallets: { id: string; name: string; wallet_type: string; opening_balance: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ name: string; wallet_type: Wallet['wallet_type']; opening_balance: number }>(
    { name: '', wallet_type: 'bank', opening_balance: 0 });

  return (
    <Modal title="กระเป๋าเงิน" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {wallets.map((w) => (
          <div key={w.id} className="flex items-center justify-between text-sm border
            border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2">
            <span>{w.name}</span>
            <span className="text-xs text-slate-400">
              ยอดยกมา {money(w.opening_balance)}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
        <Field label="ชื่อกระเป๋า">
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
            const company = await getDefaultCompany();
            await saveWallet({ ...draft, company_id: company?.id });
            setDraft({ name: '', wallet_type: 'bank', opening_balance: 0 });
            onSaved();
          }}
        >
          <Plus className="w-4 h-4" /> เพิ่มกระเป๋า
        </PrimaryButton>
      </div>
    </Modal>
  );
}

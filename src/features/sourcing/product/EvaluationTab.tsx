import { useEffect, useMemo, useState } from 'react';
import { Boxes, Info, Lock } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { getEvaluation, recordDecision, reopenDecision, saveScores } from '@/sourcing-api/evaluations';
import { listUsers } from '@/sourcing-api/users';
import { getInventoryLink, promoteToInventory } from '@/sourcing-api/inventory';
import {
  isComplete, overallScore, scoreColorVar, scoredCount, segmentColorVar, suggestRecommendation,
} from '@/sourcing-lib/calculations';
import { CRITERIA, CRITERIA_GROUPS, DECISION_LABEL, MARGIN_THRESHOLD } from '@/sourcing-lib/constants';
import { fmtDate, fmtPercent, fmtScore } from '@/sourcing-lib/format';
import { Link } from 'react-router-dom';
import { Button } from '@/components/sourcing-ui/Button';
import { Textarea } from '@/components/sourcing-ui/Input';
import { Tooltip } from '@/components/sourcing-ui/Tooltip';
import { ConfirmDialog } from '@/components/sourcing-ui/ConfirmDialog';
import { DecisionBadge } from '@/components/sourcing-ui/Badge';
import { CheckCircle2, Clock, Star, XCircle } from 'lucide-react';
import type { CriterionComments, DecisionStatus, ProductSummary, Scores } from '@/sourcing-lib/types';

const DECISION_OPTIONS: { status: DecisionStatus; icon: typeof Star; color: string; blurb: string }[] = [
  { status: 'Approved', icon: CheckCircle2, color: 'var(--c-green)', blurb: 'Import this product' },
  { status: 'Interested', icon: Star, color: 'var(--c-blue)', blurb: 'Promising — keep pursuing' },
  { status: 'Waiting', icon: Clock, color: 'var(--c-amber)', blurb: 'Hold — verify or negotiate first' },
  { status: 'Rejected', icon: XCircle, color: 'var(--c-red)', blurb: 'Do not import' },
];

/** Evaluation tab (spec §11): scorecard + suggestion + human decision. */
export function EvaluationTab({ product, onChanged }: { product: ProductSummary; onChanged: () => void }) {
  const { toast } = useToast();
  const userId = useUserId();
  const evalQ = useQuery(() => getEvaluation(product.id), [product.id]);
  const usersQ = useQuery(() => listUsers(true), []);

  const [scores, setScores] = useState<Scores>({});
  const [comments, setComments] = useState<CriterionComments>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<DecisionStatus | null>(null);
  const [reason, setReason] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [promoBlocked, setPromoBlocked] = useState<string | null>(null);
  // The SKU this product was promoted to, if any.
  const invQ = useQuery(() => getInventoryLink(product.id), [product.id]);

  const saved = evalQ.data;
  const locked = (saved?.decision_status ?? 'Not Yet Evaluated') !== 'Not Yet Evaluated';

  useEffect(() => {
    setScores(saved?.scores ?? {});
    setComments(saved?.comments ?? {});
    setReason(saved?.decision_reason ?? '');
    setDecision(locked ? saved!.decision_status : null);
    setDirty(false);
  }, [saved?.id, saved?.updated_at]);

  const live = overallScore(scores);
  const complete = isComplete(scores);
  const count = scoredCount(scores);
  const margin = product.latest_cost?.gross_margin ?? null;
  const suggestion = complete ? suggestRecommendation(live.value, margin) : null;

  const decidedBy = useMemo(
    () => usersQ.data?.find((u) => u.id === saved?.evaluated_by)?.name ?? 'a teammate',
    [usersQ.data, saved?.evaluated_by],
  );

  const setScore = (key: string, v: number) => {
    if (locked) return;
    setScores((s) => ({ ...s, [key]: v }));
    setDirty(true);
  };

  const doSaveScores = async () => {
    setBusy(true);
    try {
      await saveScores(product.id, scores, comments, userId);
      toast('Scores saved.');
      setDirty(false);
      void evalQ.refetch();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doRecord = async () => {
    if (!decision) return;
    if (!reason.trim()) { toast('A reason is required — it becomes the Decision Log.', 'error'); return; }
    setBusy(true);
    try {
      if (dirty) await saveScores(product.id, scores, comments, userId);
      await recordDecision(product.id, decision, reason, userId);
      toast(`Decision recorded: ${DECISION_LABEL[decision]}.`);
      // Approving is what makes a candidate a real SKU, so the Inventory row
      // is created here rather than in a separate step someone can forget.
      // A promotion problem must never undo the decision — hence the try.
      if (decision === 'Approved') await runPromotion();
      void evalQ.refetch();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Recording failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Create or adopt the Inventory SKU. Used on approval and by the button. */
  const runPromotion = async () => {
    try {
      const result = await promoteToInventory(product);
      if (result.status === 'blocked') {
        setPromoBlocked(result.reason);
      } else {
        setPromoBlocked(null);
        if (result.status === 'created') toast(`Added to Inventory as "${result.item.model_code}".`);
        if (result.status === 'linked') toast(`Linked to the existing Inventory item "${result.item.model_code}".`);
        void invQ.refetch();
      }
    } catch (e) {
      setPromoBlocked(e instanceof Error ? e.message : 'Could not add this product to Inventory.');
    }
  };

  const doReopen = async () => {
    setConfirmReopen(false);
    setBusy(true);
    try {
      await reopenDecision(product.id, userId);
      toast('Decision reopened — scores are editable again.');
      void evalQ.refetch();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Reopen failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const recommendationTable = `Suggestion logic:
≥ 4.0 and margin ≥ ${MARGIN_THRESHOLD}% → Approved
≥ 4.0 and margin < ${MARGIN_THRESHOLD}% → ${DECISION_LABEL.Waiting}
3.0 – 3.9 → Interested
2.0 – 2.9 → ${DECISION_LABEL.Waiting}
< 2.0 → Rejected`;

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start pb-8">
      {/* ——— Scorecard ——— */}
      <div className="flex flex-col gap-5">
        {locked && (
          <div className="rounded-card border border-line bg-subtle px-3 py-2 text-[13px] text-ink-2 flex items-center gap-2">
            <Lock size={14} />
            Decision recorded by {decidedBy} on {fmtDate(saved?.evaluated_at)} — reopen to edit.
            <button className="text-accent hover:underline ml-auto" onClick={() => setConfirmReopen(true)}>
              Reopen
            </button>
          </div>
        )}

        {/* Inventory link — only meaningful once the product is Approved. */}
        {saved?.decision_status === 'Approved' && (
          <div className="rounded-card border border-line bg-subtle px-3 py-2 text-[13px] flex flex-wrap items-center gap-2">
            <Boxes size={14} className="text-ink-2" />
            {invQ.data ? (
              <>
                <span className="text-ink-2">In Inventory as</span>
                <Link to="/stock" className="font-medium text-accent hover:underline">
                  {invQ.data.model_code}
                </Link>
                <span className="text-ink-3">— {invQ.data.description}</span>
              </>
            ) : promoBlocked ? (
              <>
                <span className="text-ink-2">{promoBlocked}</span>
                <button className="text-accent hover:underline ml-auto" onClick={() => void runPromotion()}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <span className="text-ink-2">Not in Inventory yet.</span>
                <button className="text-accent hover:underline ml-auto" onClick={() => void runPromotion()}>
                  Add to Inventory
                </button>
              </>
            )}
          </div>
        )}

        {CRITERIA_GROUPS.map((group) => (
          <section key={group} className="card p-5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-2 mb-3">{group}</h2>
            <div className="flex flex-col gap-3">
              {CRITERIA.filter((c) => c.group === group).map((c) => {
                const value = scores[c.key];
                return (
                  <div key={c.key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-medium truncate">{c.name}</span>
                      <Tooltip content={`5 — ${c.anchors[5]}\n3 — ${c.anchors[3]}\n1 — ${c.anchors[1]}`}>
                        <Info size={13} className="text-ink-3 shrink-0" aria-label={`${c.name} scoring guide`} />
                      </Tooltip>
                      <span className="badge-outline shrink-0" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>
                        ×{c.weight}
                      </span>
                    </div>
                    <div className="inline-flex rounded border border-line bg-subtle p-0.5 gap-0.5" role="radiogroup" aria-label={c.name}>
                      {[1, 2, 3, 4, 5].map((v) => {
                        const on = value === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={locked}
                            onClick={() => setScore(c.key, v)}
                            className={`w-9 h-8 rounded text-[13px] font-medium tnum transition-colors disabled:cursor-not-allowed
                              ${on ? 'text-white' : 'text-ink-2 hover:text-ink-1 hover:bg-surface'}`}
                            style={on ? { background: segmentColorVar(v) } : undefined}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      className="col-span-2 bg-transparent text-[12px] text-ink-2 outline-none border-b border-transparent
                        focus:border-line placeholder:text-ink-3 disabled:opacity-60"
                      placeholder="Add a note (optional)…"
                      disabled={locked}
                      value={comments[c.key] ?? ''}
                      onChange={(e) => { setComments((m) => ({ ...m, [c.key]: e.target.value })); setDirty(true); }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {!locked && (
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={busy || !dirty} onClick={() => void doSaveScores()}>
              {busy ? 'Saving…' : 'Save scores'}
            </Button>
            <span className="text-[12px] text-ink-3 tnum">{count} of {CRITERIA.length} scored</span>
          </div>
        )}

        {/* ——— Decision ——— */}
        <section className="card p-5 flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold">Decision</h2>
          {locked ? (
            <div className="flex flex-col gap-2">
              <DecisionBadge status={saved!.decision_status} />
              <p className="text-[13px] text-ink-2 whitespace-pre-line">{saved?.decision_reason}</p>
              <p className="text-[12px] text-ink-3">Recorded by {decidedBy} · {fmtDate(saved?.evaluated_at)}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {DECISION_OPTIONS.map(({ status, icon: Icon, color, blurb }) => {
                  const on = decision === status;
                  const suggested = suggestion?.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDecision(status)}
                      className={`rounded-card border p-3 text-left transition-colors
                        ${on ? '' : 'border-line hover:border-ink-3'}`}
                      style={on ? {
                        borderColor: color,
                        background: `color-mix(in srgb, ${color} 8%, transparent)`,
                      } : undefined}
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color }}>
                        <Icon size={14} /> {DECISION_LABEL[status]}
                        {suggested && (
                          <span className="ml-auto text-[11px] font-normal text-accent">Suggested</span>
                        )}
                      </span>
                      <span className="block mt-0.5 text-[12px] text-ink-2">{blurb}</span>
                    </button>
                  );
                })}
              </div>
              <Textarea
                label="Decision reason" required
                placeholder="Why this decision? This becomes the Decision Log the team will read later."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div>
                <Button
                  variant="primary" size="lg"
                  disabled={busy || !decision || !reason.trim()}
                  onClick={() => void doRecord()}
                >
                  Record decision
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* ——— Sticky score summary ——— */}
      <aside className="card p-5 lg:sticky lg:top-6 flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-2">Overall score</h2>
          <Tooltip content={recommendationTable}>
            <Info size={13} className="text-ink-3" aria-label="How the suggestion works" />
          </Tooltip>
        </div>
        <div
          className="text-[40px] leading-none font-semibold tnum"
          style={live.value != null ? { color: scoreColorVar(live.value) } : { color: 'var(--text-3)' }}
        >
          {fmtScore(live.value)}
        </div>
        <p className="text-[12px] text-ink-3 tnum">
          {complete ? 'All criteria scored' : `${count} of ${CRITERIA.length} scored — provisional`}
        </p>

        <div className="border-t border-line" />

        {suggestion ? (
          <div>
            <p className="text-[12px] text-ink-2">Suggested</p>
            <div className="mt-1"><DecisionBadge status={suggestion.status} /></div>
            <p className="mt-1.5 text-[12px] text-ink-2">{suggestion.reason}</p>
            <p className="mt-2 text-[12px] text-ink-3">
              {margin != null
                ? <>Gross margin {fmtPercent(margin)} from the latest estimate.</>
                : <>No cost estimate yet — profitability can’t be checked.</>}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-ink-3">
            Score all {CRITERIA.length} criteria to see a suggested decision. The suggestion combines
            the score with gross margin from the Cost tab — the final call is always yours.
          </p>
        )}
      </aside>

      <ConfirmDialog
        open={confirmReopen}
        title="Reopen this decision?"
        body="This unlocks the recorded decision so scores and the outcome can be changed. The previous reasoning stays in the form until re-recorded."
        confirmLabel="Reopen"
        onConfirm={() => void doReopen()}
        onCancel={() => setConfirmReopen(false)}
      />
    </div>
  );
}

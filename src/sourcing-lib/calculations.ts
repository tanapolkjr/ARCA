import { CRITERIA, MARGIN_THRESHOLD, SUGGESTED_MARGIN, TOTAL_WEIGHT } from './constants';
import type { CriterionKey, Currency, DecisionStatus, ProductStatus, Scores } from './types';

/* ============================================================
 * Cost Calculator — Business Rules formulas, all per unit, THB.
 * ============================================================ */

export interface CostInputs {
  factoryPrice: number;        // in `currency`
  currency: Currency;
  exchangeRate: number;        // rate to THB; forced to 1 when currency = THB
  shippingCost: number;        // THB
  agencyCost: number;          // THB
  importDutyPercent: number;
  vatPercent: number;
  otherCosts: number;          // THB
  suggestedSellingPrice: number | null;
  actualSellingPrice: number | null;
}

export interface CostResults {
  factoryCostTHB: number;
  cifValue: number;
  importDuty: number;
  vat: number;
  landedCost: number;
  grossProfit: number | null;
  grossMargin: number | null;   // %
  netProfit: number | null;
  roi: number | null;           // %
  autoSuggestedPrice: number;   // Landed ÷ (1 − 40%)
  lossWarning: boolean;         // any selling price below landed cost
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateCosts(i: CostInputs): CostResults {
  const rate = i.currency === 'THB' ? 1 : i.exchangeRate;
  const factoryCostTHB = round2(i.factoryPrice * rate);
  const cifValue = round2(factoryCostTHB + i.shippingCost);
  const importDuty = round2(cifValue * (i.importDutyPercent / 100));
  const vat = round2((cifValue + importDuty) * (i.vatPercent / 100));
  const landedCost = round2(
    factoryCostTHB + i.shippingCost + i.agencyCost + importDuty + vat + i.otherCosts,
  );

  const ssp = i.suggestedSellingPrice;
  const asp = i.actualSellingPrice;

  const grossProfit = ssp != null && ssp > 0 ? round2(ssp - landedCost) : null;
  const grossMargin = ssp != null && ssp > 0 ? round2(((ssp - landedCost) / ssp) * 100) : null;
  const netProfit = asp != null && asp > 0 ? round2(asp - landedCost) : null;
  const roi = netProfit != null && landedCost > 0 ? round2((netProfit / landedCost) * 100) : null;

  return {
    factoryCostTHB, cifValue, importDuty, vat, landedCost,
    grossProfit, grossMargin, netProfit, roi,
    autoSuggestedPrice: round2(landedCost / (1 - SUGGESTED_MARGIN)),
    lossWarning:
      landedCost > 0 &&
      ((ssp != null && ssp > 0 && ssp < landedCost) || (asp != null && asp > 0 && asp < landedCost)),
  };
}

/* ============================================================
 * Overall Score — Σ(score × weight) ÷ Σ(weight), 1 decimal.
 * ============================================================ */

export function scoredCount(scores: Scores): number {
  return CRITERIA.filter((c) => isValidScore(scores[c.key])).length;
}

export function isComplete(scores: Scores): boolean {
  return scoredCount(scores) === CRITERIA.length;
}

function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Live score. While incomplete, this is a weighted average over the
 * criteria entered so far (provisional); once all 10 are scored it equals
 * the official formula Σ(score × weight) ÷ 22.
 */
export function overallScore(scores: Scores): { value: number | null; provisional: boolean } {
  let sum = 0;
  let weight = 0;
  for (const c of CRITERIA) {
    const s = scores[c.key];
    if (isValidScore(s)) {
      sum += s * c.weight;
      weight += c.weight;
    }
  }
  if (weight === 0) return { value: null, provisional: true };
  return { value: Math.round((sum / weight) * 10) / 10, provisional: weight < TOTAL_WEIGHT };
}

/* ============================================================
 * Recommendation Logic — suggestion only, never auto-applied.
 * ============================================================ */

export interface Recommendation {
  status: DecisionStatus;
  reason: string;
}

export function suggestRecommendation(
  score: number | null,
  grossMargin: number | null,
): Recommendation | null {
  if (score == null) return null;
  if (score >= 4.0) {
    if (grossMargin == null) {
      return { status: 'Approved', reason: 'Strong fit — add a cost estimate to confirm profitability' };
    }
    return grossMargin >= MARGIN_THRESHOLD
      ? { status: 'Approved', reason: 'Strong on both fit and profitability' }
      : { status: 'Waiting', reason: 'Good product — verify pricing / negotiate before committing' };
  }
  if (score >= 3.0) return { status: 'Interested', reason: 'Promising, worth pursuing further' };
  if (score >= 2.0) return { status: 'Waiting', reason: 'Borderline — worth a small real-world check' };
  return { status: 'Rejected', reason: 'Does not meet the bar' };
}

/* ============================================================
 * Pipeline status derivation — automation over manual updates
 * (project rule 4). Status is never edited by hand; it follows
 * from real facts about the product:
 *   Done             → a decision has been recorded
 *   Decision Pending → fully scored AND costed (ready to decide)
 *   Scored           → all 10 criteria scored
 *   Under Evaluation → work has started (hero image / cost / partial scores)
 *   Draft            → otherwise
 * ============================================================ */

export function deriveStatus(facts: {
  hasHero: boolean;
  hasCost: boolean;
  scores: Scores;
  decisionStatus: DecisionStatus;
}): ProductStatus {
  if (facts.decisionStatus !== 'Not Yet Evaluated') return 'Done';
  const complete = isComplete(facts.scores);
  if (complete && facts.hasCost) return 'Decision Pending';
  if (complete) return 'Scored';
  if (facts.hasHero && (facts.hasCost || scoredCount(facts.scores) > 0)) return 'Under Evaluation';
  return 'Draft';
}

/** Score color ramp = recommendation thresholds (spec §2). */
export function scoreColorVar(score: number): string {
  if (score >= 4.0) return 'var(--c-green)';
  if (score >= 3.0) return 'var(--c-blue)';
  if (score >= 2.0) return 'var(--c-amber)';
  return 'var(--c-red)';
}

/** 1–5 segment ramp for individual criterion selectors. */
export function segmentColorVar(value: number): string {
  if (value >= 4) return 'var(--c-green)';
  if (value === 3) return 'var(--c-blue)';
  if (value === 2) return 'var(--c-amber)';
  return 'var(--c-red)';
}

export const criterionByKey = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<
  CriterionKey,
  (typeof CRITERIA)[number]
>;

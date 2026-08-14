import { supabase } from '@/sourcing-lib/supabase';
import { isComplete, overallScore } from '@/sourcing-lib/calculations';
import type { CriterionComments, DecisionStatus, Evaluation, Scores } from '@/sourcing-lib/types';
import { refreshStatus } from './products';

export async function getEvaluation(productId: string): Promise<Evaluation | null> {
  const { data, error } = await supabase
    .from('evaluations').select('*').eq('product_id', productId).maybeSingle();
  if (error) throw error;
  return data as Evaluation | null;
}

/** One row per product (1:1) — upsert keyed on product_id. */
export async function saveScores(
  productId: string, scores: Scores, comments: CriterionComments, userId: string,
): Promise<Evaluation> {
  // Store the official overall score only when the scorecard is complete.
  const overall = isComplete(scores) ? overallScore(scores).value : null;
  const { data, error } = await supabase.from('evaluations').upsert(
    {
      product_id: productId,
      scores,
      comments,
      overall_score: overall,
      evaluated_by: userId,
      evaluated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' },
  ).select().single();
  if (error) throw error;
  await refreshStatus(productId);
  return data as Evaluation;
}

/** Decision Reason is required for any real status — validated here and in the UI. */
export async function recordDecision(
  productId: string, status: DecisionStatus, reason: string, userId: string,
): Promise<Evaluation> {
  if (status !== 'Not Yet Evaluated' && !reason.trim()) {
    throw new Error('A reason is required for the Decision Log.');
  }
  const { data, error } = await supabase.from('evaluations').upsert(
    {
      product_id: productId,
      decision_status: status,
      decision_reason: status === 'Not Yet Evaluated' ? null : reason.trim(),
      evaluated_by: userId,
      evaluated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' },
  ).select().single();
  if (error) throw error;
  // DB trigger syncs products.decision_status; we re-derive pipeline status.
  await refreshStatus(productId);
  return data as Evaluation;
}

/** Reopening returns the decision to "Not Yet Evaluated" so it can be re-recorded. */
export async function reopenDecision(productId: string, userId: string): Promise<Evaluation> {
  return recordDecision(productId, 'Not Yet Evaluated', '', userId);
}

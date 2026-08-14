import { CheckCircle2, CircleDashed, Clock, Star, XCircle, MinusCircle } from 'lucide-react';
import type { DecisionStatus, ProductStatus } from '@/sourcing-lib/types';
import { DECISION_LABEL } from '@/sourcing-lib/constants';

/* Two visually distinct badge families (spec §2):
   pipeline status = outline, decision status = solid soft-fill. */

const statusColor: Record<ProductStatus, string> = {
  Draft: 'var(--text-2)',
  'Under Evaluation': 'var(--c-blue)',
  Scored: 'var(--c-violet)',
  'Decision Pending': 'var(--c-amber)',
  Done: 'var(--c-green)',
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  const c = statusColor[status];
  return (
    <span className="badge-outline" style={{ color: c, borderColor: c }}>
      {status}
    </span>
  );
}

const decisionColor: Record<DecisionStatus, string> = {
  'Not Yet Evaluated': 'var(--text-2)',
  Approved: 'var(--c-green)',
  Interested: 'var(--c-blue)',
  Waiting: 'var(--c-amber)',
  Rejected: 'var(--c-red)',
};

const decisionIcon: Record<DecisionStatus, typeof Star> = {
  'Not Yet Evaluated': MinusCircle,
  Approved: CheckCircle2,
  Interested: Star,
  Waiting: Clock,
  Rejected: XCircle,
};

export function DecisionBadge({ status, size = 'md' }: { status: DecisionStatus; size?: 'sm' | 'md' }) {
  const c = decisionColor[status];
  const Icon = status === 'Not Yet Evaluated' ? CircleDashed : decisionIcon[status];
  return (
    <span
      className={`badge-fill ${size === 'sm' ? 'h-[20px] px-1.5 text-[11px]' : ''}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} calc(var(--tint) * 100%), transparent)` }}
    >
      <Icon size={size === 'sm' ? 11 : 12} />
      {DECISION_LABEL[status]}
    </span>
  );
}

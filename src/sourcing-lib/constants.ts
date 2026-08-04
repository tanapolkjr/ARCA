/**
 * Module identity inside ARCA. Every visible occurrence of the module name
 * reads from here — change these lines only.
 */
export const APP_NAME = 'Sourcing';
export const APP_TAGLINE = 'Product import decisions.';
/** Prefix for exported file names (CSV downloads). */
export const APP_SLUG = 'arca-sourcing';

import type {
  Category, Channel, CriterionKey, DecisionStatus, Platform, ProductStatus, ShippingMethod,
} from './types';

/** Fixed lists built into the schema (v2 decision: constrained values, not lookup tables). */

export const CATEGORIES: Category[] = [
  'Smart Lock', 'Hotel Lock', 'Mini Lock', 'Smart Switch', 'Normal Switch', 'Plug & Socket', 'Others',
];

/** Default seed only — the live list comes from channel_options (Settings). */
export const CHANNELS: Channel[] = [
  'Shopee', 'Lazada', 'Facebook', 'Real Estate Developers', 'Hotels', 'Commercial Projects', 'Government Projects',
];

/** Quick suggestions only — the field is free text since patch 0003. */
export const PLATFORMS: Platform[] = ['1688', 'Alibaba', 'Trade Show', 'Direct', 'Other'];

/** Quick presets — a custom method can be typed since patch 0003. */
export const SHIPPING_METHODS: ShippingMethod[] = ['Sea Freight', 'Air Freight', 'Express'];

export const PRODUCT_STATUSES: ProductStatus[] = [
  'Draft', 'Under Evaluation', 'Scored', 'Decision Pending', 'Done',
];

export const DECISION_STATUSES: DecisionStatus[] = [
  'Not Yet Evaluated', 'Approved', 'Interested', 'Waiting', 'Rejected',
];

/**
 * Display labels for decision statuses.
 * Business Rules v2 proposes renaming "Waiting" → "Testing"; that rename is
 * not yet approved, so the label matches the stored value. When approved,
 * change ONLY the 'Waiting' label here — storage keys stay stable.
 */
export const DECISION_LABEL: Record<DecisionStatus, string> = {
  'Not Yet Evaluated': 'Not Yet Evaluated',
  Approved: 'Approved',
  Interested: 'Interested',
  Waiting: 'Waiting',
  Rejected: 'Rejected',
};

/** Scoring criteria — Business Rules v2. Weights fixed; total = 22. */
export interface Criterion {
  key: CriterionKey;
  name: string;
  group: 'Commercial' | 'Product' | 'Logistics' | 'Business';
  weight: 1 | 2 | 3;
  /** Plain-language anchors, one hover away in the scorecard (spec §11). */
  anchors: { 5: string; 3: string; 1: string };
}

export const CRITERIA: Criterion[] = [
  {
    key: 'factory_price', name: 'Factory Price', group: 'Commercial', weight: 3,
    anchors: {
      5: 'Well below target cost, highly competitive',
      3: 'In line with market average',
      1: 'Well above target, erodes margin',
    },
  },
  {
    key: 'moq', name: 'MOQ', group: 'Commercial', weight: 2,
    anchors: {
      5: 'Low MOQ, easy to test with low risk',
      3: 'Moderate, manageable',
      1: 'Very high MOQ, large capital exposure',
    },
  },
  {
    key: 'lead_time', name: 'Lead Time', group: 'Commercial', weight: 2,
    anchors: {
      5: 'Fast (under 2 weeks)',
      3: 'Average (2–4 weeks)',
      1: 'Slow (over 6 weeks), risks missing market timing',
    },
  },
  {
    key: 'design', name: 'Design', group: 'Product', weight: 2,
    anchors: {
      5: 'Excellent, matches or leads current trend',
      3: 'Acceptable, average',
      1: 'Outdated or unappealing',
    },
  },
  {
    key: 'features', name: 'Features', group: 'Product', weight: 3,
    anchors: {
      5: 'Rich feature set, clear differentiator',
      3: 'Standard, meets baseline',
      1: 'Missing expected features',
    },
  },
  {
    key: 'quality', name: 'Quality', group: 'Product', weight: 3,
    anchors: {
      5: 'Excellent, verified via sample/certification',
      3: 'Acceptable, meets basic standard',
      1: 'Poor, quality or safety concerns',
    },
  },
  {
    key: 'shipping_available', name: 'International Shipping', group: 'Logistics', weight: 1,
    anchors: {
      5: 'Fully equipped, experienced exporter',
      3: 'Can ship but limited support',
      1: 'Cannot ship internationally without major extra arrangement',
    },
  },
  {
    key: 'agency_required', name: 'Agency Required', group: 'Logistics', weight: 1,
    anchors: {
      5: 'No agency required, straightforward import',
      3: 'Agency required but low cost / simple',
      1: 'Complex agency requirement, high extra cost or risk',
    },
  },
  {
    key: 'market_potential', name: 'Market Potential', group: 'Business', weight: 3,
    anchors: {
      5: 'Strong demand across multiple channels',
      3: 'Moderate demand in a few channels',
      1: 'Niche / limited demand',
    },
  },
  {
    key: 'competitive_advantage', name: 'Competitive Advantage', group: 'Business', weight: 2,
    anchors: {
      5: 'Clear, defensible advantage',
      3: 'On par with competitors',
      1: 'No differentiation, price-war risk',
    },
  },
];

export const CRITERIA_GROUPS = ['Commercial', 'Product', 'Logistics', 'Business'] as const;
export const TOTAL_WEIGHT = CRITERIA.reduce((s, c) => s + c.weight, 0); // 22

/** Default auto-suggested selling price margin: Landed ÷ (1 − 40%). */
export const SUGGESTED_MARGIN = 0.4;
/** Gross-margin threshold used by the recommendation logic. */
export const MARGIN_THRESHOLD = 30;

export const STORAGE_BUCKET = 'product-media';

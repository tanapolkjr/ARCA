/** Types mirror supabase/migrations/0001_init.sql — the v2 six-table design. */

export type Category =
  | 'Smart Lock' | 'Hotel Lock' | 'Mini Lock' | 'Smart Switch'
  | 'Normal Switch' | 'Plug & Socket' | 'Others';

/** Free text since patch 0003 — the old fixed list remains as quick suggestions. */
export type Platform = string;

/** Free text since patch 0003 — the list is managed in Settings (channel_options). */
export type Channel = string;

export type ProductStatus = 'Draft' | 'Under Evaluation' | 'Scored' | 'Decision Pending' | 'Done';

export type DecisionStatus = 'Not Yet Evaluated' | 'Approved' | 'Interested' | 'Waiting' | 'Rejected';

export type Currency = 'CNY' | 'USD' | 'THB';

/** Free text since patch 0003 — the three classics remain as quick presets. */
export type ShippingMethod = string;

export type CriterionKey =
  | 'factory_price' | 'moq' | 'lead_time'
  | 'design' | 'features' | 'quality'
  | 'shipping_available' | 'agency_required'
  | 'market_potential' | 'competitive_advantage';

export type Scores = Partial<Record<CriterionKey, number>>;
export type CriterionComments = Partial<Record<CriterionKey, string>>;

/** Mirrors the platform's public.users table (ARCA owns this table). */
export type PlatformRole = 'Super Admin' | 'Manager' | 'Sale' | 'PM' | 'Admin' | 'Store';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  is_active: boolean;
  created_at: string;
}

export interface Factory {
  id: string;
  name: string;
  platform: Platform | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  wechat_or_whatsapp: string | null;
  country: string | null;
  city: string | null;
  moq: number | null;
  lead_time: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FactoryFile {
  id: string;
  factory_id: string;
  file_url: string;   // path within the `product-media` bucket
  file_name: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ChannelOption {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  factory_id: string;
  name: string;
  model_number: string | null;
  source_url: string | null;
  product_notes: string | null;
  category: Category;
  custom_category_name: string | null;
  functions: string[];
  material: string | null;
  color: string[];
  certification: string[];
  warranty: string | null;
  ip_rating: string | null;        // e.g. IP65 — water/dust protection
  lead_time_days: number | null;
  smart_home_compatibility: string[];
  target_channels: Channel[];
  status: ProductStatus;
  decision_status: DecisionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string; // path within the `product-media` bucket
  is_hero: boolean;
  caption: string | null;
  sort_order: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ProductCost {
  id: string;
  product_id: string;
  currency: Currency;
  factory_price: number;
  exchange_rate: number;
  shipping_method: ShippingMethod | null;
  shipping_cost: number;                 // resolved THB amount (even when entered as %)
  shipping_is_percent: boolean;
  shipping_percent: number | null;       // % of factory cost, when entered as %
  agency_cost: number;                   // resolved THB amount (even when entered as %)
  agency_is_percent: boolean;
  agency_percent: number | null;
  import_duty_percent: number;
  vat_percent: number;
  other_costs: number;                   // resolved THB amount (even when entered as %)
  other_is_percent: boolean;
  other_percent: number | null;
  landed_cost: number;
  suggested_selling_price: number | null;
  lowest_selling_price: number | null;
  actual_selling_price: number | null;
  gross_profit: number | null;
  gross_margin: number | null;
  net_profit: number | null;
  roi: number | null;
  created_by: string | null;
  created_at: string;
}

export interface Evaluation {
  id: string;
  product_id: string;
  scores: Scores;
  comments: CriterionComments;
  overall_score: number | null;
  decision_status: DecisionStatus;
  decision_reason: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  updated_at: string;
}

/** Product joined with the summary data every list view needs. */
export interface ProductSummary extends Product {
  factory?: Pick<Factory, 'id' | 'name'>;
  hero_url?: string | null;
  latest_cost?: ProductCost | null;
  evaluation?: Evaluation | null;
}

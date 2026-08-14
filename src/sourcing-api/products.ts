import { supabase } from '@/sourcing-lib/supabase';
import { deriveStatus } from '@/sourcing-lib/calculations';
import type { Product, ProductSummary, Scores } from '@/sourcing-lib/types';

const SUMMARY_SELECT = `
  *,
  factory:factories(id,name),
  images:product_images(image_url,is_hero,sort_order),
  costs:product_costs(id,landed_cost,gross_margin,suggested_selling_price,roi,currency,factory_price,created_at),
  evaluation:evaluations(*)
`;

/* Supabase returns joined rows as arrays — flatten to the ProductSummary shape. */
function toSummary(row: any): ProductSummary {
  const images = (row.images ?? []) as { image_url: string; is_hero: boolean; sort_order: number }[];
  const hero = images.find((i) => i.is_hero) ?? [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
  const costs = ((row.costs ?? []) as any[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const evaluation = Array.isArray(row.evaluation) ? row.evaluation[0] ?? null : row.evaluation ?? null;
  const { images: _i, costs: _c, ...rest } = row;
  return { ...rest, hero_url: hero?.image_url ?? null, latest_cost: costs[0] ?? null, evaluation };
}

export async function listProductSummaries(): Promise<ProductSummary[]> {
  const { data, error } = await supabase
    .from('products').select(SUMMARY_SELECT).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as any[]).map(toSummary);
}

export async function getProductSummary(id: string): Promise<ProductSummary> {
  const { data, error } = await supabase.from('products').select(SUMMARY_SELECT).eq('id', id).single();
  if (error) throw error;
  return toSummary(data);
}

export type ProductInput = Pick<Product,
  'factory_id' | 'name' | 'model_number' | 'source_url' | 'product_notes' | 'category' |
  'custom_category_name' | 'functions' | 'material' | 'color' | 'certification' | 'warranty' |
  'ip_rating' | 'lead_time_days' | 'smart_home_compatibility' | 'target_channels'
>;

export async function createProduct(input: ProductInput, userId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products').insert({ ...input, created_by: userId }).select().single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const { data, error } = await supabase.from('products').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Product;
}

/** Draft-only delete — protects history once costing/evaluation has started. */
export async function deleteProduct(id: string): Promise<void> {
  const { data, error: getErr } = await supabase.from('products').select('status').eq('id', id).single();
  if (getErr) throw getErr;
  if (data.status !== 'Draft') {
    throw new Error('Only Draft products can be deleted — history is preserved once evaluation starts.');
  }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Re-derive and persist pipeline status from real facts (project rule 4:
 * automation over manual updates). Called after any image / cost /
 * evaluation change.
 */
export async function refreshStatus(productId: string): Promise<void> {
  const [{ data: imgs }, { count: costCount }, { data: evals }, { data: product }] = await Promise.all([
    supabase.from('product_images').select('id').eq('product_id', productId).eq('is_hero', true).limit(1),
    supabase.from('product_costs').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    supabase.from('evaluations').select('scores,decision_status').eq('product_id', productId).limit(1),
    supabase.from('products').select('status,decision_status').eq('id', productId).single(),
  ]);
  const evaluation = evals?.[0];
  const next = deriveStatus({
    hasHero: (imgs?.length ?? 0) > 0,
    hasCost: (costCount ?? 0) > 0,
    scores: (evaluation?.scores ?? {}) as Scores,
    decisionStatus: evaluation?.decision_status ?? product?.decision_status ?? 'Not Yet Evaluated',
  });
  if (product && product.status !== next) {
    await supabase.from('products').update({ status: next }).eq('id', productId);
  }
}

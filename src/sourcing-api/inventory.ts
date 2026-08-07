import { supabase } from '@/sourcing-lib/supabase';
import type { Product } from '@/sourcing-lib/types';

export interface InventoryLink {
  id: string;
  model_code: string;
  description: string | null;
  category: string | null;
  sale_price: number | null;
}

export type PromotionOutcome =
  /** A new SKU was inserted. */
  | { status: 'created'; item: InventoryLink }
  /** A SKU with this model number already existed and is now linked. */
  | { status: 'linked'; item: InventoryLink }
  /** This product was already in Inventory — nothing to do. */
  | { status: 'exists'; item: InventoryLink }
  /** Could not promote; `reason` is safe to show the user. */
  | { status: 'blocked'; reason: string };

/**
 * Field mapping agreed with the owner:
 *   Sourcing                       Inventory
 *   model_number  ───────────────▶ model_code
 *   name          ───────────────▶ description
 *   category      ───────────────▶ category
 *
 * "Others" carries a free-text name, which is the more useful label downstream.
 */
function categoryFor(product: Product): string {
  return product.category === 'Others' && product.custom_category_name?.trim()
    ? product.custom_category_name.trim()
    : product.category;
}

const LINK_SELECT = 'id, model_code, description, category, sale_price';

/**
 * ราคาขายที่แนะนำจากประมาณการต้นทุนล่าสุดของสินค้านี้
 * product_costs เป็น append-only ประวัติจึงเรียงตามเวลาแล้วเอาแถวล่าสุด
 */
async function suggestedPrice(productId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('product_costs')
    .select('suggested_selling_price')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = data?.suggested_selling_price;
  return v == null ? null : Number(v);
}

/** The SKU this product was promoted to, or null. */
export async function getInventoryLink(productId: string): Promise<InventoryLink | null> {
  const { data, error } = await supabase
    .from('stock_items').select(LINK_SELECT).eq('source_product_id', productId).maybeSingle();
  if (error) throw error;
  return (data as InventoryLink | null) ?? null;
}

/**
 * Create (or adopt) the Inventory SKU for an approved product.
 *
 * Never throws on a business problem — a failed promotion must not take the
 * decision down with it, since recording the decision is the more important
 * act. Real errors (network, RLS) still throw.
 */
export async function promoteToInventory(product: Product): Promise<PromotionOutcome> {
  const existing = await getInventoryLink(product.id);
  if (existing) return { status: 'exists', item: existing };

  const modelCode = product.model_number?.trim();
  if (!modelCode) {
    return {
      status: 'blocked',
      reason: 'Model number is empty. Inventory needs it as the Model Number — add one on the Info tab, then add this product to Inventory.',
    };
  }

  // A SKU with this model number may already exist — created by hand, by the
  // Excel import, or before this feature existed. Adopt it rather than
  // colliding with the unique constraint.
  const { data: byCode, error: byCodeError } = await supabase
    .from('stock_items').select('id, model_code, description, category, sale_price, source_product_id')
    .eq('model_code', modelCode).maybeSingle();
  if (byCodeError) throw byCodeError;

  if (byCode) {
    if (byCode.source_product_id) {
      return {
        status: 'blocked',
        reason: `Model Number "${modelCode}" is already in Inventory and linked to a different Sourcing product. Change the model number here, or unlink the other one first.`,
      };
    }
    // Link only. Existing description/category are left alone on purpose —
    // whoever created that row may have deliberate wording, and silently
    // rewriting live inventory data would be a nasty surprise.
    // เติมราคาขายให้เฉพาะกรณีที่ยังว่าง — ไม่ทับราคาที่คนตั้งไว้เอง
    const patch: Record<string, unknown> = { source_product_id: product.id };
    if (byCode.sale_price == null) {
      const p = await suggestedPrice(product.id);
      if (p != null) patch.sale_price = p;
    }
    const { data, error } = await supabase
      .from('stock_items')
      .update(patch)
      .eq('id', byCode.id)
      .select(LINK_SELECT).single();
    if (error) throw error;
    return { status: 'linked', item: data as InventoryLink };
  }

  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      model_code: modelCode,
      description: product.name,
      category: categoryFor(product),
      sale_price: await suggestedPrice(product.id),
      source_product_id: product.id,
    })
    .select(LINK_SELECT).single();
  if (error) throw error;
  return { status: 'created', item: data as InventoryLink };
}

import { supabase } from '@/sourcing-lib/supabase';
import { calculateCosts, type CostInputs } from '@/sourcing-lib/calculations';
import type { ProductCost } from '@/sourcing-lib/types';
import { refreshStatus } from './products';

export async function listCosts(productId: string): Promise<ProductCost[]> {
  const { data, error } = await supabase
    .from('product_costs').select('*').eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ProductCost[];
}

/** Append-only: every save is a new history row, never an overwrite. */
export interface CostEntryMeta {
  shippingIsPercent: boolean;
  shippingPercent: number | null;
  agencyIsPercent: boolean;
  agencyPercent: number | null;
  otherIsPercent: boolean;
  otherPercent: number | null;
  lowestSellingPrice: number | null;
}

export async function saveCostEstimate(
  productId: string,
  inputs: CostInputs & { shippingMethod: string | null } & CostEntryMeta,
  userId: string,
): Promise<ProductCost> {
  const r = calculateCosts(inputs);
  const { data, error } = await supabase.from('product_costs').insert({
    product_id: productId,
    currency: inputs.currency,
    factory_price: inputs.factoryPrice,
    exchange_rate: inputs.currency === 'THB' ? 1 : inputs.exchangeRate,
    shipping_method: inputs.shippingMethod,
    shipping_cost: inputs.shippingCost,
    shipping_is_percent: inputs.shippingIsPercent,
    shipping_percent: inputs.shippingIsPercent ? inputs.shippingPercent : null,
    agency_cost: inputs.agencyCost,
    agency_is_percent: inputs.agencyIsPercent,
    agency_percent: inputs.agencyIsPercent ? inputs.agencyPercent : null,
    import_duty_percent: inputs.importDutyPercent,
    vat_percent: inputs.vatPercent,
    other_costs: inputs.otherCosts,
    other_is_percent: inputs.otherIsPercent,
    other_percent: inputs.otherIsPercent ? inputs.otherPercent : null,
    landed_cost: r.landedCost,
    suggested_selling_price: inputs.suggestedSellingPrice,
    lowest_selling_price: inputs.lowestSellingPrice,
    actual_selling_price: inputs.actualSellingPrice,
    gross_profit: r.grossProfit,
    gross_margin: r.grossMargin,
    net_profit: r.netProfit,
    roi: r.roi,
    created_by: userId,
  }).select().single();
  if (error) throw error;
  await refreshStatus(productId);
  return data as ProductCost;
}

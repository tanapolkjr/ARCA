import { supabase } from '@/sourcing-lib/supabase';
import { STORAGE_BUCKET } from '@/sourcing-lib/constants';
import type { ProductImage } from '@/sourcing-lib/types';
import { refreshStatus } from './products';

export async function listImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('product_images').select('*').eq('product_id', productId).order('sort_order');
  if (error) throw error;
  return data as ProductImage[];
}

export async function uploadImage(
  productId: string, file: File, userId: string, makeHero: boolean,
): Promise<ProductImage> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  if (makeHero) await clearHero(productId);
  const { data: maxRow } = await supabase
    .from('product_images').select('sort_order').eq('product_id', productId)
    .order('sort_order', { ascending: false }).limit(1);
  const sort = (maxRow?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, image_url: path, is_hero: makeHero, sort_order: sort, uploaded_by: userId })
    .select().single();
  if (error) throw error;
  await refreshStatus(productId);
  return data as ProductImage;
}

async function clearHero(productId: string) {
  await supabase.from('product_images').update({ is_hero: false }).eq('product_id', productId).eq('is_hero', true);
}

/** Only one hero per product — application-layer rule from the DB design. */
export async function setHero(productId: string, imageId: string): Promise<void> {
  await clearHero(productId);
  const { error } = await supabase.from('product_images').update({ is_hero: true }).eq('id', imageId);
  if (error) throw error;
  await refreshStatus(productId);
}

export async function updateCaption(imageId: string, caption: string): Promise<void> {
  const { error } = await supabase.from('product_images').update({ caption }).eq('id', imageId);
  if (error) throw error;
}

export async function reorderImages(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, idx) =>
    supabase.from('product_images').update({ sort_order: idx }).eq('id', id),
  ));
}

export async function removeImage(img: ProductImage): Promise<void> {
  const { error } = await supabase.from('product_images').delete().eq('id', img.id);
  if (error) throw error;
  await supabase.storage.from(STORAGE_BUCKET).remove([img.image_url]);
  await refreshStatus(img.product_id);
}

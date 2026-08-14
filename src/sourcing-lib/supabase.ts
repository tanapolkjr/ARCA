/**
 * The Sourcing module does NOT create its own Supabase client.
 * Two clients would mean two auth sessions and two realtime sockets, so this
 * re-exports the platform's single client from src/lib/supabaseClient.js.
 */
import { supabase } from '../lib/supabaseClient.js';
import { STORAGE_BUCKET } from './constants';

export { supabase };

/** Public URL for an image path stored in product_images.image_url. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

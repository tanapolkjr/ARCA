import { supabase } from '@/sourcing-lib/supabase';
import type { UserRow } from '@/sourcing-lib/types';

/**
 * Read-only view of platform users, used to show who scored a product and who
 * recorded a decision.
 *
 * Creating and editing users belongs to the platform Settings page
 * (Super Admin only) — the standalone app's addUserProfile()/updateUser() were
 * dropped during the merge so there is only one place that writes this table.
 */
export async function listUsers(includeInactive = true): Promise<UserRow[]> {
  let q = supabase.from('users').select('*').order('created_at');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data as UserRow[];
}

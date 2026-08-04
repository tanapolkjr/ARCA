import { supabase } from '@/sourcing-lib/supabase';
import type { ChannelOption } from '@/sourcing-lib/types';

/** Target-market channels are editable in Settings (patch 0003). */
export async function listChannels(): Promise<ChannelOption[]> {
  const { data, error } = await supabase
    .from('channel_options').select('*').order('sort_order').order('name');
  if (error) throw error;
  return data as ChannelOption[];
}

export async function addChannel(name: string): Promise<ChannelOption> {
  const clean = name.trim();
  if (!clean) throw new Error('Channel name is required.');
  const { data: max } = await supabase
    .from('channel_options').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from('channel_options')
    .insert({ name: clean, sort_order: (max?.[0]?.sort_order ?? -1) + 1 })
    .select().single();
  if (error) throw error;
  return data as ChannelOption;
}

/** Removing an option doesn't rewrite products that already use the tag. */
export async function removeChannel(id: string): Promise<void> {
  const { error } = await supabase.from('channel_options').delete().eq('id', id);
  if (error) throw error;
}

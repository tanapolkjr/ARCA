import { supabase } from '@/sourcing-lib/supabase';
import { STORAGE_BUCKET } from '@/sourcing-lib/constants';
import type { Factory, FactoryFile } from '@/sourcing-lib/types';

export async function listFactories(): Promise<Factory[]> {
  const { data, error } = await supabase.from('factories').select('*').order('name');
  if (error) throw error;
  return data as Factory[];
}

export type FactoryInput = Omit<Factory, 'id' | 'created_at' | 'created_by'>;

export async function createFactory(input: FactoryInput, userId: string): Promise<Factory> {
  const { data, error } = await supabase
    .from('factories').insert({ ...input, created_by: userId }).select().single();
  if (error) throw error;
  return data as Factory;
}

export async function updateFactory(id: string, input: Partial<FactoryInput>): Promise<Factory> {
  const { data, error } = await supabase
    .from('factories').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Factory;
}

/** Application-layer guard mirrors the DB's ON DELETE RESTRICT with a clear message. */
export async function deleteFactory(id: string): Promise<void> {
  const { count, error: countErr } = await supabase
    .from('products').select('id', { count: 'exact', head: true }).eq('factory_id', id);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) throw new Error('Remove or reassign this factory’s products first.');
  const { error } = await supabase.from('factories').delete().eq('id', id);
  if (error) throw error;
}

/* ——— Factory files (catalogs, price lists, certificates) ——— */

export async function listFactoryFiles(factoryId: string): Promise<FactoryFile[]> {
  const { data, error } = await supabase
    .from('factory_files').select('*').eq('factory_id', factoryId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data as FactoryFile[];
}

export async function uploadFactoryFile(
  factoryId: string, file: File, userId: string,
): Promise<FactoryFile> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `factories/${factoryId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('factory_files')
    .insert({ factory_id: factoryId, file_url: path, file_name: file.name, uploaded_by: userId })
    .select().single();
  if (error) throw error;
  return data as FactoryFile;
}

export async function removeFactoryFile(f: FactoryFile): Promise<void> {
  const { error } = await supabase.from('factory_files').delete().eq('id', f.id);
  if (error) throw error;
  await supabase.storage.from(STORAGE_BUCKET).remove([f.file_url]);
}

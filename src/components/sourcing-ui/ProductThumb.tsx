import { Package } from 'lucide-react';
import { imageUrl } from '@/sourcing-lib/supabase';

/** Hero thumbnail with the gray package placeholder (spec §7). */
export function ProductThumb({ path, size = 40, alt = '' }: { path: string | null | undefined; size?: number; alt?: string }) {
  const url = imageUrl(path);
  return (
    <div
      className="shrink-0 rounded-card bg-subtle border border-line overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {url
        ? <img src={url} alt={alt} className="w-full h-full object-cover" loading="lazy" />
        : <Package size={Math.max(14, size / 3)} className="text-ink-3" />}
    </div>
  );
}

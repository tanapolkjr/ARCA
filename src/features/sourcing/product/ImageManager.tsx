import { useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2, UploadCloud } from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { listImages, removeImage, reorderImages, setHero, updateCaption, uploadImage } from '@/sourcing-api/images';
import { imageUrl } from '@/sourcing-lib/supabase';
import { Tooltip } from '@/components/sourcing-ui/Tooltip';
import { ConfirmDialog } from '@/components/sourcing-ui/ConfirmDialog';
import type { ProductImage } from '@/sourcing-lib/types';

/**
 * Hero + gallery manager (spec §9). The hero drop zone is the visual anchor
 * of the Info tab — for import decisions, seeing the product is step one.
 */
export function ImageManager({ productId, onChanged }: { productId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const userId = useUserId();
  const { data: images, refetch } = useQuery(() => listImages(productId), [productId]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ProductImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = images ?? [];
  const hero = list.find((i) => i.is_hero) ?? null;
  const gallery = list.filter((i) => !i.is_hero);

  const changed = () => { void refetch(); onChanged(); };

  const upload = async (files: FileList | File[]) => {
    const accepted = [...files].filter((f) => f.type.startsWith('image/'));
    if (!accepted.length) { toast('Only image files can be uploaded here.', 'error'); return; }
    setBusy(true);
    try {
      for (const [idx, file] of accepted.entries()) {
        // First image of an empty product automatically becomes the hero.
        await uploadImage(productId, file, userId, list.length === 0 && idx === 0);
      }
      toast(accepted.length === 1 ? 'Image uploaded.' : `${accepted.length} images uploaded.`);
      changed();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void upload(e.dataTransfer.files);
  };

  const makeHero = async (img: ProductImage) => {
    await setHero(productId, img.id);
    toast('Hero image updated.');
    changed();
  };

  const move = async (img: ProductImage, dir: -1 | 1) => {
    const ids = gallery.map((g) => g.id);
    const i = ids.indexOf(img.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderImages(ids);
    void refetch();
  };

  const remove = async (img: ProductImage) => {
    setConfirmRemove(null);
    try {
      await removeImage(img);
      toast('Image removed.');
      changed();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Remove failed.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => e.target.files && void upload(e.target.files)}
      />

      {/* Hero drop zone — 4:3 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={hero ? 'Replace images' : 'Upload the first photo'}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative w-full aspect-[4/3] max-w-[420px] rounded-card border overflow-hidden cursor-pointer
          flex items-center justify-center transition-colors
          ${dragOver ? 'border-accent bg-subtle' : hero ? 'border-line' : 'border-dashed border-line bg-subtle hover:border-ink-3'}`}
      >
        {hero ? (
          <>
            <img src={imageUrl(hero.image_url) ?? ''} alt={hero.caption ?? 'Hero image'} className="w-full h-full object-cover" />
            <span className="absolute top-2 left-2 badge-fill"
              style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)' }}>
              <Star size={11} /> Hero
            </span>
          </>
        ) : (
          <div className="text-center text-ink-2 p-6">
            <UploadCloud size={22} className="mx-auto" />
            <p className="mt-2 text-[13px] font-medium">Drop the first photo here</p>
            <p className="text-[12px] text-ink-3">or click to browse — a hero photo moves this product out of Draft</p>
          </div>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/20 flex items-center justify-center text-white text-[13px]">
            Uploading…
          </span>
        )}
      </div>

      {/* Gallery grid */}
      <div className="flex flex-wrap gap-2">
        {gallery.map((img, i) => (
          <figure key={img.id} className="group relative w-24">
            <div className="w-24 h-24 rounded-card border border-line overflow-hidden bg-subtle">
              <img src={imageUrl(img.image_url) ?? ''} alt={img.caption ?? ''} className="w-full h-full object-cover" />
            </div>
            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip content="Set as hero">
                <button onClick={() => void makeHero(img)} aria-label="Set as hero"
                  className="p-1 rounded bg-surface/90 border border-line text-ink-2 hover:text-accent">
                  <Star size={11} />
                </button>
              </Tooltip>
              <Tooltip content="Remove">
                <button onClick={() => setConfirmRemove(img)} aria-label="Remove image"
                  className="p-1 rounded bg-surface/90 border border-line text-ink-2 hover:text-[color:var(--c-red)]">
                  <Trash2 size={11} />
                </button>
              </Tooltip>
            </div>
            <div className="absolute bottom-7 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {i > 0 && (
                <button onClick={() => void move(img, -1)} aria-label="Move left"
                  className="p-1 rounded bg-surface/90 border border-line text-ink-2"><ArrowLeft size={10} /></button>
              )}
              {i < gallery.length - 1 && (
                <button onClick={() => void move(img, 1)} aria-label="Move right"
                  className="p-1 rounded bg-surface/90 border border-line text-ink-2"><ArrowRight size={10} /></button>
              )}
            </div>
            <figcaption>
              <input
                className="mt-1 w-24 bg-transparent text-[11px] text-ink-2 outline-none border-b border-transparent
                  focus:border-line placeholder:text-ink-3"
                placeholder="Caption…"
                defaultValue={img.caption ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (img.caption ?? '')) void updateCaption(img.id, v).then(() => refetch());
                }}
              />
            </figcaption>
          </figure>
        ))}
        {hero && (
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Add images"
            className="w-24 h-24 rounded-card border border-dashed border-line text-ink-3 hover:border-ink-3 hover:text-ink-1
              flex flex-col items-center justify-center gap-1 text-[11px]"
          >
            <ImagePlus size={16} /> Add
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove this image?"
        body="The image is deleted from storage. This can’t be undone."
        confirmLabel="Remove image"
        danger
        onConfirm={() => confirmRemove && void remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}

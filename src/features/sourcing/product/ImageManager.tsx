import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ChevronLeft, ChevronRight, Expand, ImagePlus, Star, Trash2, UploadCloud,
} from 'lucide-react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { listImages, removeImage, reorderImages, setHero, updateCaption, uploadImage } from '@/sourcing-api/images';
import { imageUrl } from '@/sourcing-lib/supabase';
import { Tooltip } from '@/components/sourcing-ui/Tooltip';
import { ConfirmDialog } from '@/components/sourcing-ui/ConfirmDialog';
import { Lightbox } from '@/components/sourcing-ui/Lightbox';
import type { ProductImage } from '@/sourcing-lib/types';

/**
 * Hero + gallery manager (spec §9). Seeing the product is step one of an
 * import decision, so the viewer is the visual anchor of the Info tab.
 *
 * Two rules drive the layout:
 *  • Never crop. Product photos arrive in wildly different aspect ratios
 *    (tall lock fronts, wide two-up renders) and a cropped photo hides exactly
 *    the detail someone is trying to judge. The frame is sized by the image,
 *    capped at 440px tall, rather than the image being squeezed into a fixed
 *    4:3 box.
 *  • Clicking a photo means "look at it", not "upload". Uploading has its own
 *    button, and drag-and-drop still works anywhere on the viewer.
 */
export function ImageManager({ productId, onChanged }: { productId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const userId = useUserId();
  const { data: images, refetch } = useQuery(() => listImages(productId), [productId]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ProductImage | null>(null);
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Hero first, then gallery order — the same order the lightbox pages through.
  const list = [...(images ?? [])].sort((a, b) => Number(b.is_hero) - Number(a.is_hero));
  const current = list[active] ?? null;
  // 0 or 1 in practice (one hero per product, app-enforced), but derived
  // rather than assumed so a product with no hero still behaves.
  const heroCount = list.filter((i) => i.is_hero).length;

  // Keep the selection valid when images are added or removed.
  useEffect(() => {
    if (active > 0 && active >= list.length) setActive(Math.max(0, list.length - 1));
  }, [list.length, active]);

  // Keep the selected thumbnail scrolled into view when moving with the arrows.
  useEffect(() => {
    stripRef.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [active]);

  const changed = () => { void refetch(); onChanged(); };
  const step = (dir: -1 | 1) => {
    if (list.length < 2) return;
    setActive((i) => (i + dir + list.length) % list.length);
  };

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
    setActive(0); // the new hero sorts to the front
    changed();
  };

  const move = async (img: ProductImage, dir: -1 | 1) => {
    // Hero is pinned to the front, so only the gallery tail is reorderable.
    const ids = list.filter((g) => !g.is_hero).map((g) => g.id);
    const i = ids.indexOf(img.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderImages(ids);
    // Follow the image that moved, wherever it landed — the user may have
    // reordered a thumbnail that wasn't the one on screen.
    setActive(heroCount + j);
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

  const dropProps = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop,
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => e.target.files && void upload(e.target.files)}
      />

      {list.length === 0 ? (
        /* Empty state — the whole box is the drop target. */
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload the first photo"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          {...dropProps}
          className={`relative w-full aspect-[4/3] max-w-[420px] rounded-card border border-dashed overflow-hidden
            cursor-pointer flex items-center justify-center transition-colors
            ${dragOver ? 'border-accent bg-subtle' : 'border-line bg-subtle hover:border-ink-3'}`}
        >
          <div className="text-center text-ink-2 p-6">
            <UploadCloud size={22} className="mx-auto" />
            <p className="mt-2 text-[13px] font-medium">Drop the first photo here</p>
            <p className="text-[12px] text-ink-3">or click to browse — a hero photo moves this product out of Draft</p>
          </div>
          {busy && (
            <span className="absolute inset-0 bg-black/20 flex items-center justify-center text-white text-[13px]">
              Uploading…
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-start" {...dropProps}>
          {/* Viewer — the frame hugs the photo instead of cropping it. */}
          <div
            /* min-* stops a small photo rendering as a tiny frame; the max-w
               cap gives the img's max-w-full a definite value to resolve against
               and keeps a very wide render from pushing the form sideways. */
            className={`relative inline-flex items-center justify-center rounded-card border overflow-hidden bg-subtle
              min-h-[220px] min-w-[220px] max-w-[min(560px,100%)] transition-colors
              ${dragOver ? 'border-accent' : 'border-line'}`}
          >
            <button
              type="button"
              onClick={() => setZoomed(active)}
              aria-label="View full size"
              className="block max-w-full cursor-zoom-in"
            >
              <img
                key={current?.id}
                src={imageUrl(current?.image_url) ?? ''}
                alt={current?.caption ?? 'Product image'}
                className="block max-h-[440px] max-w-full w-auto h-auto object-contain"
              />
            </button>

            {current?.is_hero && (
              <span
                className="absolute top-2 left-2 badge-fill pointer-events-none"
                style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)' }}
              >
                <Star size={11} /> Hero
              </span>
            )}

            <span
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/45 text-white pointer-events-none"
              aria-hidden
            >
              <Expand size={12} />
            </span>

            {list.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous image"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/45 text-white hover:bg-black/65"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/45 text-white hover:bg-black/65"
                >
                  <ChevronRight size={16} />
                </button>
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/45 text-white text-[11px] tnum">
                  {active + 1} / {list.length}
                </span>
              </>
            )}

            {busy && (
              <span className="absolute inset-0 bg-black/20 flex items-center justify-center text-white text-[13px]">
                Uploading…
              </span>
            )}
          </div>

          {/* Caption belongs to the image on screen, so it lives under the viewer. */}
          {current && (
            <input
              key={current.id}
              className="w-full max-w-[440px] bg-transparent text-[12px] text-ink-2 outline-none
                border-b border-transparent focus:border-line placeholder:text-ink-3 py-1"
              placeholder="Add a caption…"
              defaultValue={current.caption ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (current.caption ?? '')) void updateCaption(current.id, v).then(() => refetch());
              }}
            />
          )}

          {/* Thumbnail strip — scrolls sideways once there are more than a few. */}
          <div ref={stripRef} className="flex gap-2 overflow-x-auto max-w-full pb-1">
            {list.map((img, i) => (
              <div key={img.id} className="group relative shrink-0">
                <button
                  type="button"
                  data-active={i === active}
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === active}
                  className={`block w-[68px] h-[68px] rounded-card border overflow-hidden bg-subtle transition-all
                    ${i === active ? 'border-accent ring-2 ring-[color:var(--accent)]'
                                   : 'border-line opacity-60 hover:opacity-100'}`}
                >
                  <img
                    src={imageUrl(img.image_url) ?? ''}
                    alt={img.caption ?? ''}
                    className="w-full h-full object-cover"
                  />
                </button>

                {img.is_hero && (
                  <span className="absolute top-1 left-1 p-0.5 rounded bg-surface/90 text-[color:var(--accent)] pointer-events-none">
                    <Star size={9} />
                  </span>
                )}

                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!img.is_hero && (
                    <Tooltip content="Set as hero">
                      <button onClick={() => void makeHero(img)} aria-label="Set as hero"
                        className="p-1 rounded bg-surface/90 border border-line text-ink-2 hover:text-accent">
                        <Star size={10} />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content="Remove">
                    <button onClick={() => setConfirmRemove(img)} aria-label="Remove image"
                      className="p-1 rounded bg-surface/90 border border-line text-ink-2 hover:text-[color:var(--c-red)]">
                      <Trash2 size={10} />
                    </button>
                  </Tooltip>
                </div>

                {!img.is_hero && (
                  <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {i > heroCount && (
                      <button onClick={() => void move(img, -1)} aria-label="Move earlier"
                        className="p-1 rounded bg-surface/90 border border-line text-ink-2"><ChevronLeft size={10} /></button>
                    )}
                    {i < list.length - 1 && (
                      <button onClick={() => void move(img, 1)} aria-label="Move later"
                        className="p-1 rounded bg-surface/90 border border-line text-ink-2"><ChevronRight size={10} /></button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Add images"
              className="shrink-0 w-[68px] h-[68px] rounded-card border border-dashed border-line text-ink-3
                hover:border-ink-3 hover:text-ink-1 flex flex-col items-center justify-center gap-1 text-[11px]"
            >
              <ImagePlus size={15} /> Add
            </button>
          </div>
        </div>
      )}

      <Lightbox
        images={list.map((img) => ({
          src: imageUrl(img.image_url) ?? '',
          caption: img.caption,
          badge: img.is_hero ? 'Hero' : null,
        }))}
        index={zoomed}
        onIndexChange={(i) => { setZoomed(i); setActive(i); }}
        onClose={() => setZoomed(null)}
      />

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

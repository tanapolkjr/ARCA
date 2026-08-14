import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxImage {
  /** Full, resolved URL. */
  src: string;
  caption?: string | null;
  /** Shown as a small badge, e.g. "Hero". */
  badge?: string | null;
}

/**
 * Full-screen image viewer.
 *
 * The image is `object-contain` inside 92vw × 88vh, so nothing is ever cropped
 * — a tall product shot stays tall, a wide one stays wide.
 *
 * Keyboard: ← / → to move between images, Esc to close.
 */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  /** Index into `images`, or null when closed. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && index >= 0 && index < images.length;

  const step = useCallback(
    (dir: -1 | 1) => {
      if (index === null || images.length < 2) return;
      onIndexChange((index + dir + images.length) % images.length);
    },
    [index, images.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    // Stop the page behind from scrolling while the viewer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, step]);

  if (!open || index === null) return null;
  const current = images[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.caption ?? 'Image viewer'}
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center no-print"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close viewer"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Previous image"
            className="absolute left-3 sm:left-6 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next image"
            className="absolute right-3 sm:right-6 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {/* stopPropagation so clicking the photo itself doesn't close the viewer */}
      <figure className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.src}
          alt={current.caption ?? ''}
          className="max-w-[92vw] max-h-[80vh] object-contain rounded-card"
        />
        <figcaption className="text-center text-white/80 text-[13px] flex items-center gap-2">
          {current.badge && (
            <span className="px-1.5 py-0.5 rounded bg-white/15 text-white text-[11px]">{current.badge}</span>
          )}
          {current.caption}
          {images.length > 1 && (
            <span className="tnum text-white/50">
              {index + 1} / {images.length}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

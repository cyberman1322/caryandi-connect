import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type GalleryImage = { id: string; storage_path: string | null };
type PhotoProps = { path: string | null | undefined; alt: string; className?: string; eager?: boolean };

/**
 * Listing photo gallery: main photo with back / forward arrows, a "3 / 12" counter, thumbnails,
 * keyboard arrows (when the gallery has focus) and swipe on touch screens. Wraps around at both ends.
 */
export function PhotoGallery({
  images, Photo, alt, mainClassName, thumbClassName, thumbGridClassName, overlay,
}: {
  images: GalleryImage[];
  Photo: ComponentType<PhotoProps>;
  alt: string;
  mainClassName: string;
  thumbClassName: string;
  thumbGridClassName: string;
  overlay?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = images[index] ?? images[0];
  const many = count > 1;
  const thumbs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const userMoved = useRef(false);

  // If the photo list changes (e.g. after an edit), keep the index in range.
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);
  // Keep the active thumbnail visible when stepping through with the arrows.
  useEffect(() => {
    if (!userMoved.current) return;
    thumbs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  const go = (step: number) => {
    if (!many) return;
    userMoved.current = true;
    setIndex((i) => (i + step + count) % count);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  const arrow = 'absolute top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-md backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`Photos of ${alt}`}
        tabIndex={many ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipeStart.current = null; }}
        className="group relative touch-pan-y select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Photo path={current?.storage_path} alt={many ? `${alt} — photo ${index + 1} of ${count}` : alt} eager className={mainClassName} />
        {overlay}
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${arrow} left-3`}><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${arrow} right-3`}><ChevronRight className="size-5" /></button>
            <span aria-live="polite" className="absolute bottom-3 right-3 rounded-full bg-foreground/75 px-2.5 py-1 text-xs font-semibold text-background">{index + 1} / {count}</span>
          </>
        )}
      </div>
      {many && (
        <div className={`mt-3 ${thumbGridClassName}`}>
          {images.map((img, i) => (
            <button
              key={img.id}
              ref={(el) => { thumbs.current[i] = el; }}
              type="button"
              onClick={() => { userMoved.current = true; setIndex(i); }}
              aria-label={`Show photo ${i + 1} of ${count}`}
              aria-current={index === i}
              className={`overflow-hidden rounded-md border-2 ${index === i ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100'}`}
            >
              <Photo path={img.storage_path} alt="" className={thumbClassName} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

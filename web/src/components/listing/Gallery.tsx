"use client";

import { useRef, useState } from "react";

export type GalleryImage = { url: string; alt: string | null; type: string };

const TYPE_LABELS: Record<string, string> = {
  full: "Full item",
  barrel: "Barrel",
  end_cap: "End cap",
  knob: "Knob",
  markings: "Markings",
  damage: "Damage",
  front: "Front",
  back: "Back",
  detail: "Detail",
  label: "Label",
};

/** Listing photos: one large photo with thumbnails. Arrow keys, Home and End move between photos. */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!images.length) {
    return <div className="grid aspect-[4/3] place-items-center rounded-lg border border-line bg-surface text-ink-soft">No photos</div>;
  }

  const current = images[index];
  const altFor = (img: GalleryImage, i: number) => img.alt || `${title}, photo ${i + 1}${TYPE_LABELS[img.type] ? ` (${TYPE_LABELS[img.type]})` : ""}`;

  function go(next: number, focus = false) {
    const n = (next + images.length) % images.length;
    setIndex(n);
    if (focus) thumbs.current[n]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const keys: Record<string, () => number> = {
      ArrowRight: () => index + 1,
      ArrowDown: () => index + 1,
      ArrowLeft: () => index - 1,
      ArrowUp: () => index - 1,
      Home: () => 0,
      End: () => images.length - 1,
    };
    const target = keys[e.key];
    if (!target) return;
    e.preventDefault();
    go(target(), true);
  }

  return (
    <section aria-label="Photos" aria-roledescription="gallery" className="grid gap-3">
      <figure className="relative overflow-hidden rounded-lg border border-line bg-surface">
        {/* Listing photos come from Supabase Storage; next/image remote patterns are configured per environment. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={altFor(current, index)} className="aspect-[4/3] w-full object-contain" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-sm border-2 border-ink bg-surface/90 px-3 py-2 font-semibold"
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border-2 border-ink bg-surface/90 px-3 py-2 font-semibold"
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        )}
        <figcaption className="sr-only" aria-live="polite">
          Photo {index + 1} of {images.length}
        </figcaption>
      </figure>
      {images.length > 1 && (
        <div role="tablist" aria-label="Choose a photo" className="flex gap-2 overflow-x-auto pb-1" onKeyDown={onKeyDown}>
          {images.map((img, i) => (
            <button
              key={img.url + i}
              ref={(el) => {
                thumbs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1} of ${images.length}${TYPE_LABELS[img.type] ? `: ${TYPE_LABELS[img.type]}` : ""}`}
              tabIndex={i === index ? 0 : -1}
              onClick={() => go(i)}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded border-2 bg-surface ${i === index ? "border-ink" : "border-line"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

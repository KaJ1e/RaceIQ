import { useState } from "react";

/**
 * YouTube embeds are blocked or reset on mainland networks, and an <iframe> that
 * never connects leaves the surface blank and keeps a dead request open. Render a
 * play control first and only create the iframe when the user asks for it.
 */
export function LazyYouTube({ src, title, className }: { src: string; title: string; className?: string }) {
  const [active, setActive] = useState(false);
  if (active) {
    return (
      <iframe
        src={src}
        title={title}
        className={className}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      title={title}
      aria-label={title}
      className={`group relative flex items-center justify-center bg-black/70 ${className ?? ""}`}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black transition group-hover:scale-105"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>
  );
}
import { useEffect, useState } from "react";
import { shouldShowVideoFallback, youtubeWatchUrl } from "@raceiq/frontend-pure/video-embed";
import { useOnlineHealth } from "@/hooks/network-health";
import { m } from "@/paraglide/messages";

/** A clicked embed that stays blank for this long is treated as blocked. */
const LOAD_DEADLINE_MS = 6000;

/**
 * YouTube embeds are blocked or reset on mainland networks, and an <iframe> that
 * never connects leaves the surface blank and keeps a dead request open. Render a
 * play control first and only create the iframe when the user asks for it.
 *
 * The caller owns the media box (give it a size and `relative` or `absolute`);
 * this component fills it. When the embed stays blank — because the network is
 * known to be blocked or the load deadline passed — say so and offer a link that
 * opens the video outside the app instead of leaving a black rectangle.
 */
export function LazyYouTube({ src, title, className }: { src: string; title: string; className?: string }) {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const health = useOnlineHealth();
  const offline = health?.known === true && !health.reachable;

  useEffect(() => {
    if (!active || loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [active, loaded]);

  const showFallback = shouldShowVideoFallback({ activated: active, loaded, timedOut, offline });

  return (
    <div className={className}>
      {active ? (
        <iframe
          src={src}
          title={title}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          title={title}
          aria-label={title}
          className="group flex h-full w-full items-center justify-center bg-black/70"
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black transition group-hover:scale-105"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
      {showFallback && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-2 gap-y-1 bg-black/85 px-2 py-1.5 text-app-micro text-white"
        >
          <span className="min-w-0 flex-1">{m.video_embed_unavailable()}</span>
          <a
            href={youtubeWatchUrl(src)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium underline underline-offset-2"
          >
            {m.video_embed_open()}
          </a>
        </div>
      )}
    </div>
  );
}

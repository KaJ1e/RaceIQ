import { useEffect, useState } from "react";
import {
  VIDEO_LOAD_DEADLINE_MS,
  restartVideoAttempt,
  shouldShowVideoFallback,
  youtubeWatchUrl,
} from "@raceiq/frontend-pure/video-embed";
import { m } from "@/paraglide/messages";

/**
 * YouTube embeds are blocked or reset on mainland networks, and an <iframe> that
 * never connects leaves the surface blank and keeps a dead request open. Render a
 * play control first and only create the iframe when the user asks for it.
 *
 * The caller owns the media box (give it a size and `relative` or `absolute`);
 * this component fills it. A click always gets a full load window, and only an
 * embed still blank after it says so: the bar then offers a retry and a link that
 * opens the video outside the app instead of leaving a black rectangle.
 */
export function LazyYouTube({ src, title, className }: { src: string; title: string; className?: string }) {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Bumped on every attempt and on a new src so the iframe remounts; reusing the
  // same element after a blocked load may keep the dead connection.
  const [attempt, setAttempt] = useState(0);

  // A different video is a different attempt: the previous outcome must not hide
  // this embed's bar, and the deadline has to start from zero.
  useEffect(() => {
    setActive(false);
    setLoaded(false);
    setTimedOut(false);
    setAttempt((value) => value + 1);
  }, [src]);

  useEffect(() => {
    if (!active || loaded || timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), VIDEO_LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [active, loaded, timedOut, attempt]);

  const showFallback = shouldShowVideoFallback({ activated: active, loaded, timedOut });

  function retry() {
    const fresh = restartVideoAttempt();
    setLoaded(fresh.loaded);
    setTimedOut(fresh.timedOut);
    setAttempt((value) => value + 1);
  }

  return (
    <div className={className}>
      {active ? (
        <iframe
          key={attempt}
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
          <button
            type="button"
            onClick={retry}
            title={m.label_retry()}
            aria-label={m.label_retry()}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            {m.label_retry()}
          </button>
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

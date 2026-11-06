/**
 * Track-guide videos are YouTube embeds. On a restricted network the click
 * produces a black rectangle that never resolves, so the embed surface needs a
 * way to say "this did not load" and a link that leaves the app.
 */
export function youtubeWatchUrl(embedSrc: string): string {
  if (embedSrc === "") return "";
  try {
    const url = new URL(embedSrc);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "");
      return id ? `https://www.youtube.com/watch?v=${id}` : embedSrc;
    }
    if (url.hostname === "youtube.com" || url.hostname === "www.youtube.com" || url.hostname === "m.youtube.com") {
      const match = /^\/embed\/([\w-]+)/.exec(url.pathname);
      if (match) return `https://www.youtube.com/watch?v=${match[1]}`;
    }
  } catch {
    // Not an absolute URL; the caller keeps whatever it passed.
  }
  return embedSrc;
}

/**
 * How long a clicked embed gets to connect before anything is claimed about it.
 * A slow-but-working embed proves itself inside this window; only a miss past it
 * counts as "did not load".
 */
export const VIDEO_LOAD_DEADLINE_MS = 8000;

export type VideoFallbackState = {
  /** The user asked for the embed. */
  activated: boolean;
  /** The iframe fired its load event. */
  loaded: boolean;
  /** The load deadline elapsed without a load event. */
  timedOut: boolean;
};

/**
 * Only the deadline may claim failure: reachability of the other online sources
 * says nothing about a video, so it is not an input here.
 */
export function shouldShowVideoFallback(state: VideoFallbackState): boolean {
  return state.activated && !state.loaded && state.timedOut;
}

/**
 * The state a retry replaces: the failed attempt's outcome is cleared, so the
 * bar hides and the deadline starts over. Callers also remount the iframe,
 * because reusing the same element can keep the dead connection.
 */
export function restartVideoAttempt(): Pick<VideoFallbackState, "loaded" | "timedOut"> {
  return { loaded: false, timedOut: false };
}

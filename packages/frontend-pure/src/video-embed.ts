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

export type VideoFallbackState = {
  /** The user asked for the embed. */
  activated: boolean;
  /** The iframe fired its load event. */
  loaded: boolean;
  /** The load deadline elapsed without a load event. */
  timedOut: boolean;
  /** Online sources are known to be unreachable from this network. */
  offline: boolean;
};

export function shouldShowVideoFallback(state: VideoFallbackState): boolean {
  return state.activated && !state.loaded && (state.offline || state.timedOut);
}

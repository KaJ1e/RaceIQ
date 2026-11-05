/**
 * Reachability of the optional online content sources.
 *
 * RaceIQ works offline; only the update check, the community tunes catalogue and
 * the lap-time reference fetch the internet. Each one records its last outcome
 * here so the UI can tell the user "online content unavailable, using local data"
 * instead of silently showing a stale or empty list.
 */
export type OnlineSource = "update" | "tunes" | "laptimes";

type SourceState = {
  ok: boolean;
  at: number;
  detail?: string;
};

const state = new Map<OnlineSource, SourceState>();

export function recordOnlineSuccess(source: OnlineSource): void {
  state.set(source, { ok: true, at: Date.now() });
}

export function recordOnlineFailure(source: OnlineSource, detail?: string): void {
  state.set(source, { ok: false, at: Date.now(), detail: detail?.slice(0, 200) });
}

export type OnlineHealth = {
  reachable: boolean;
  /** True once any source has reported; before that the UI stays quiet. */
  known: boolean;
  sources: Array<{ source: OnlineSource; ok: boolean; at: number; detail?: string }>;
};

export function onlineHealth(): OnlineHealth {
  const sources = [...state.entries()]
    .map(([source, value]) => ({ source, ...value }))
    .sort((a, b) => a.source.localeCompare(b.source));
  return {
    reachable: sources.every((entry) => entry.ok),
    known: sources.length > 0,
    sources,
  };
}

/** Test seam: clear recorded state. */
export function resetOnlineHealth(): void {
  state.clear();
}

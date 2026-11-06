// The ambient `*.json.gz` declaration is global; only a triple-slash reference
// carries it into projects that reach this module transitively.
// oxlint-disable-next-line typescript/triple-slash-reference -- no import form exists for a global declaration.
/// <reference path="./seed-assets.d.ts" />
import { z } from "zod";
import type { GameId } from "@raceiq/shared/games/ids";
import { loadSettings } from "../runtime/config/settings";
import { recordOnlineFailure, recordOnlineSuccess } from "../runtime/network-health";
import accSeedPath from "./seed/acc.json.gz" with { type: "file" };
import acEvoSeedPath from "./seed/ac-evo.json.gz" with { type: "file" };
import forzaSeedPath from "./seed/forza.json.gz" with { type: "file" };

/**
 * Community leaderboard CDN sync.
 *
 * Fetches the per-game leaderboard files published alongside community tunes
 * on the Cloudflare Pages deployment — flat lists of best-known lap times per
 * car/track from the community hotlap spreadsheets. Purely reference datasets
 * shown standalone in the UI; never joined onto individual tunes (car/track
 * name matching between the two sources isn't reliable enough for that).
 * Cached in memory only — a restart just re-fetches once.
 *
 * See docs/integrations/community-tunes.md.
 */

const DEFAULT_BASE_URL = "https://speedhq-tunes.pages.dev";
const MANIFEST_PATH = "/manifest.json";
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Maps a RaceIQ gameId to the key the CDN manifest uses under `laptimes`.
 * The manifest also publishes `lmu` (Le Mans Ultimate), which RaceIQ doesn't
 * support — so it's absent here and simply never fetched.
 */
const MANIFEST_KEY_BY_GAME: Partial<Record<GameId, string>> = {
  "fm-2023": "forza",
  acc: "acc",
  "ac-evo": "ac-evo",
};

const MANIFEST_ENTRIES = Object.entries(MANIFEST_KEY_BY_GAME) as Array<
  [GameId, string]
>;

/**
 * Reference leaderboards shipped with the app. They are only loaded when the
 * first sync fails and the cache is empty, so a blocked network still shows the
 * community lap-time lists instead of nothing. A successful sync replaces them.
 *
 * Snapshots ship gzip-compressed and are imported as plain paths
 * (`with { type: "file" }`), so importing this module neither inflates nor
 * parses them; the online path never touches them at all. Bun embeds the
 * referenced files in `bun build --compile` output, and `Bun.file(path)` reads
 * the embedded copy back. Decompressed bytes are pinned by
 * apps/backend/test/sync/seed-snapshots.test.ts.
 */
const SEED_PATHS: Partial<Record<GameId, string>> = {
  acc: accSeedPath,
  "ac-evo": acEvoSeedPath,
  "fm-2023": forzaSeedPath,
};
const SEED_VERSION = "seed:2026-11-05";

function baseUrl(): string {
  if (process.env.COMMUNITY_TUNES_URL) return process.env.COMMUNITY_TUNES_URL;
  try {
    const configured = loadSettings().communityTunesUrl;
    if (configured) return configured;
  } catch {
    // Unreadable settings must not break sync; fall through to the default.
  }
  return DEFAULT_BASE_URL;
}

const ManifestSchema = z.object({
  version: z.string(),
  laptimes: z
    .record(z.string(), z.object({ count: z.number().optional(), path: z.string() }))
    .optional(),
});

const LaptimeEntrySchema = z.object({
  track: z.string(),
  carClass: z.string().optional().default(""),
  car: z.string(),
  driver: z.string().optional().default(""),
  laptime: z.string(),
});

type LaptimeEntry = z.infer<typeof LaptimeEntrySchema>;
type LaptimeManifest = z.infer<typeof ManifestSchema>;
type LaptimeSyncResult = {
  synced: boolean;
  count: number;
  version: string | null;
};

const cache = new Map<GameId, LaptimeEntry[]>();
let cachedVersion: string | null = null;
let syncInProgress = false;

export function getLaptimes(gameId: GameId): LaptimeEntry[] {
  return cache.get(gameId) ?? [];
}

function resolveManifestUrl(base: string): string {
  return `${base}${MANIFEST_PATH}`;
}

function resolveLaptimeUrl(base: string, path: string): string {
  return new URL(path, `${base}/`).toString();
}

function skippedResult(version: string | null): LaptimeSyncResult {
  return { synced: false, count: totalCached(), version };
}

async function fetchManifest(): Promise<LaptimeManifest | null> {
  const manifestRes = await fetch(resolveManifestUrl(baseUrl()), {
    // A blocked or stalled mirror must not leave the sync pending forever.
    signal: AbortSignal.timeout(10_000),
  });
  if (!manifestRes.ok) {
    console.warn(`[Laptimes] manifest fetch failed: HTTP ${manifestRes.status}`);
    // A captive portal or a filtered mirror answers with an error instead of
    // timing out; record it so the UI still reports online content unavailable.
    recordOnlineFailure("laptimes", `manifest HTTP ${manifestRes.status}`);
    return null;
  }
  return ManifestSchema.parse(await manifestRes.json());
}

async function fetchGamePayload(
  manifestKey: string,
  path: string,
): Promise<{ value: unknown } | null> {
  const laptimesUrl = resolveLaptimeUrl(baseUrl(), path);
  const res = await fetch(laptimesUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    console.warn(`[Laptimes] ${manifestKey} fetch failed: HTTP ${res.status}; keeping cache`);
    recordOnlineFailure("laptimes", `${manifestKey} HTTP ${res.status}`);
    return null;
  }
  return { value: await res.json() };
}

function parseLaptimeRows(manifestKey: string, raw: unknown): LaptimeEntry[] | null {
  if (!Array.isArray(raw)) {
    console.warn(`[Laptimes] ${manifestKey} payload is not an array; keeping cache`);
    return null;
  }

  const rows: LaptimeEntry[] = [];
  let skipped = 0;
  for (const item of raw) {
    const parsed = LaptimeEntrySchema.safeParse(item);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    rows.push(parsed.data);
  }
  if (skipped > 0) {
    console.warn(`[Laptimes] ${manifestKey}: skipped ${skipped} invalid row(s)`);
  }

  return rows;
}

async function readSeedSnapshot(path: string): Promise<unknown> {
  const compressed = await Bun.file(path).arrayBuffer();
  return JSON.parse(
    new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(compressed))),
  );
}

/**
 * Load the bundled reference leaderboards. First run only: once a real sync has
 * populated the cache, the snapshot is never reloaded for this process.
 */
async function applySeedLaptimes(): Promise<LaptimeSyncResult> {
  let total = 0;
  for (const [gameId, path] of Object.entries(SEED_PATHS) as Array<[GameId, string]>) {
    const rows = parseLaptimeRows(
      MANIFEST_KEY_BY_GAME[gameId] ?? gameId,
      await readSeedSnapshot(path),
    );
    if (!rows || rows.length === 0) continue;
    cache.set(gameId, rows);
    total += rows.length;
  }
  if (total === 0) return skippedResult(cachedVersion);
  cachedVersion = SEED_VERSION;
  console.log(`[Laptimes] offline: loaded bundled snapshot (${total} entries, ${SEED_VERSION})`);
  return { synced: false, count: total, version: SEED_VERSION };
}

/**
 * Run one sync pass across every game the CDN publishes leaderboards for.
 * Skips re-fetching when the manifest version is unchanged, unless `force`
 * is set. Per-game failures are isolated: a bad payload for one game keeps
 * that game's existing cache and doesn't abort the others.
 */
export async function syncLaptimes(
  options: { force?: boolean } = {},
): Promise<LaptimeSyncResult> {
  if (syncInProgress) {
    return skippedResult(cachedVersion);
  }
  syncInProgress = true;
  try {
    const manifest = await fetchManifest();
    if (!manifest) {
      if (cache.size === 0) return await applySeedLaptimes();
      return skippedResult(cachedVersion);
    }

    if (!options.force && manifest.version === cachedVersion) {
      return skippedResult(cachedVersion);
    }

    let total = 0;
    for (const [gameId, manifestKey] of MANIFEST_ENTRIES) {
      const entry = manifest.laptimes?.[manifestKey];
      if (!entry) {
        console.warn(`[Laptimes] manifest has no leaderboard entry for "${manifestKey}"`);
        continue;
      }

      const payload = await fetchGamePayload(manifestKey, entry.path);
      if (!payload) {
        continue;
      }

      const rows = parseLaptimeRows(manifestKey, payload.value);
      if (!rows) {
        continue;
      }

      cache.set(gameId, rows);
      total += rows.length;
      console.log(`[Laptimes] synced ${rows.length} entry(ies) for ${gameId}`);
    }

    recordOnlineSuccess("laptimes");
    cachedVersion = manifest.version;
    console.log(
      `[Laptimes] sync complete: ${total} total entry(ies) at version ${manifest.version}`,
    );
    return { synced: true, count: total, version: manifest.version };
  } catch (err) {
    recordOnlineFailure("laptimes", err instanceof Error ? err.message : String(err));
    if (cache.size === 0) return await applySeedLaptimes();
    console.warn("[Laptimes] sync failed; keeping existing cache:", err instanceof Error ? err.message : err);
    return skippedResult(cachedVersion);
  } finally {
    syncInProgress = false;
  }
}

function totalCached(): number {
  let n = 0;
  for (const rows of cache.values()) n += rows.length;
  return n;
}

let refreshTimer: Timer | null = null;
let laptimesReady = false;
let initialSyncPromise: Promise<void> | null = null;

function scheduleLaptimeRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void syncLaptimes().finally(() => {
      scheduleLaptimeRefresh();
    });
  }, SYNC_INTERVAL_MS);
  refreshTimer.unref?.();
}

/**
 * Load laptimes on first game-scoped request, then schedule six-hour refreshes.
 * Concurrent first requests share one sync pass.
 */
export async function ensureLaptimesReady(): Promise<void> {
  if (laptimesReady) return;
  if (!initialSyncPromise) {
    initialSyncPromise = syncLaptimes()
      .then(() => {
        if (cachedVersion !== null) {
          laptimesReady = true;
          scheduleLaptimeRefresh();
        }
      })
      .finally(() => {
        initialSyncPromise = null;
      });
  }
  await initialSyncPromise;
}

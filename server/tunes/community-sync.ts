import { z } from "zod";
import fm2023Tunes from "./seed/fm-2023-tunes.json";
import { loadSettings } from "../runtime/config/settings";
import { recordOnlineFailure, recordOnlineSuccess } from "../runtime/network-health";
import {
  getCommunityTunesSyncState,
  setCommunityTunesSyncState,
} from "../runtime/config/settings";
import {
  replaceCommunityTunes,
  type CommunityTuneRow,
} from "../db/community-tune-queries";

/**
 * Community-tunes CDN sync.
 *
 * Fetches a manifest + per-game tune payload from the Cloudflare Pages
 * deployment and mirrors it into the local `community_tunes` table via a
 * transactional replace-all. The cache is persistent and never expires: any
 * network or validation failure leaves the previously-synced rows in place.
 *
 * See docs/integrations/community-tunes.md.
 */

const DEFAULT_BASE_URL = "https://speedhq-tunes.pages.dev";
const MANIFEST_PATH = "manifest.json";
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Games the CDN publishes today. Built-in catalog is FM-only, matching this. */
const SYNCED_GAME_IDS = ["fm-2023"] as const;

/**
 * Snapshot shipped with the app. Used only when the catalogue has never synced
 * (first run on a blocked network), so an offline user still sees community
 * tunes instead of an empty list. A successful sync replaces it.
 */
const SEED_SNAPSHOTS: Partial<Record<(typeof SYNCED_GAME_IDS)[number], unknown>> = {
  "fm-2023": fm2023Tunes,
};
const SEED_VERSION = "seed:2026-11-05";

function getCommunityTunesBaseUrl(): string {
  // Explicit environment override wins (mirrors, tests), then the value stored in
  // settings, then the public host.
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
  generatedAt: z.string().optional(),
  games: z.record(
    z.string(),
    z.object({ count: z.number().optional(), path: z.string() }),
  ),
});

// Incoming CatalogTune rows. We validate structure but only persist the columns
// the community_tunes table carries; extra fields (strengths, weaknesses, …)
// are accepted and dropped.
const CdnTuneSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  carId: z.string().min(1).optional(),
  trackId: z.string().nullable().optional(),
  // Legacy CDN ordinal properties are read only at this external source boundary.
  carOrdinal: z.number().int().optional(),
  trackOrdinal: z.number().int().nullable().optional(),
  name: z.string().min(1),
  author: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional().default(""),
  sourceName: z.string().optional().default(""),
  settings: z.record(z.string(), z.unknown()),
});

type Manifest = z.infer<typeof ManifestSchema>;

interface SyncResult {
  synced: boolean;
  count: number;
  version: string | null;
}

let syncInProgress = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function resolveCommunityTunesUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function syncSkippedResult(storedVersion: string | null): SyncResult {
  return { synced: false, count: 0, version: storedVersion };
}

async function fetchManifest(): Promise<Manifest | null> {
  const manifestRes = await fetch(
    `${getCommunityTunesBaseUrl()}/${MANIFEST_PATH}`,
    // A blocked or slow mirror must not stall the sync loop; the cached copy stays.
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!manifestRes.ok) {
    console.warn(
      `[CommunityTunes] manifest fetch failed: HTTP ${manifestRes.status}`,
    );
    // A captive portal or a filtered mirror answers with an error instead of
    // timing out; record it so the UI still reports online content unavailable.
    recordOnlineFailure("tunes", `manifest HTTP ${manifestRes.status}`);
    return null;
  }
  return ManifestSchema.parse(await manifestRes.json());
}

async function fetchCommunityTuneRows(
  gameId: string,
  path: string,
): Promise<CommunityTuneRow[] | null> {
  const tunesUrl = resolveCommunityTunesUrl(getCommunityTunesBaseUrl(), path);
  const tunesRes = await fetch(tunesUrl, { signal: AbortSignal.timeout(10_000) });
  if (!tunesRes.ok) {
    console.warn(
      `[CommunityTunes] tunes fetch failed for ${gameId}: HTTP ${tunesRes.status}; keeping cache`,
    );
    recordOnlineFailure("tunes", `${gameId} HTTP ${tunesRes.status}`);
    return null;
  }

  return toCommunityTuneRows(gameId, await tunesRes.json());
}

function toCommunityTuneRows(
  gameId: string,
  raw: unknown,
): CommunityTuneRow[] | null {
  if (!Array.isArray(raw)) {
    console.warn(
      `[CommunityTunes] tunes payload for ${gameId} is not an array; keeping cache`,
    );
    return null;
  }

  const rows: CommunityTuneRow[] = [];
  let skipped = 0;
  for (const item of raw) {
    const parsed = CdnTuneSchema.safeParse(item);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const t = parsed.data;
    const carId = t.carId ?? (t.carOrdinal != null ? String(t.carOrdinal) : null);
    if (carId == null) { skipped++; continue; }
    rows.push({
      id: t.id,
      gameId: t.gameId,
      carId,
      trackId: t.trackId ?? (t.trackOrdinal != null ? String(t.trackOrdinal) : null),
      name: t.name,
      author: t.author,
      category: t.category,
      description: t.description,
      sourceName: t.sourceName,
      settings: JSON.stringify(t.settings),
    });
  }

  if (skipped > 0) {
    console.warn(`[CommunityTunes] ${gameId}: skipped ${skipped} invalid row(s)`);
  }
  if (rows.length === 0) {
    console.warn(
      `[CommunityTunes] ${gameId}: zero valid rows — treating as full takedown`,
    );
  }

  return rows;
}

/**
 * Load the bundled snapshot into the catalogue. Only used on a first run that
 * cannot reach the CDN — once a real sync succeeds, the snapshot is never used
 * again for that install.
 */
async function applySeedSnapshot(): Promise<SyncResult> {
  let total = 0;
  for (const gameId of SYNCED_GAME_IDS) {
    const raw = SEED_SNAPSHOTS[gameId];
    if (!raw) continue;
    const rows = toCommunityTuneRows(gameId, raw);
    if (!rows || rows.length === 0) continue;
    total += await replaceCommunityTunes(gameId, rows);
  }
  if (total === 0) return { synced: false, count: 0, version: null };
  setCommunityTunesSyncState(SEED_VERSION);
  console.log(
    `[CommunityTunes] offline: loaded bundled snapshot (${total} tunes, ${SEED_VERSION})`,
  );
  return { synced: false, count: total, version: SEED_VERSION };
}

/**
 * Run one sync pass. Returns `{synced:false}` when the manifest version matches
 * the stored version (no work done) or when a failure keeps the existing cache.
 *
 * Pass `{ force: true }` to re-fetch and replace even when the manifest version
 * is unchanged — used by the manual "Refresh" endpoint so it always pulls the
 * latest, and to recover when the stored version drifts out of sync with the
 * actually-persisted rows.
 */
export async function syncCommunityTunes(
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  const stored = getCommunityTunesSyncState();
  if (syncInProgress) {
    return syncSkippedResult(stored.version);
  }

  syncInProgress = true;
  try {
    const manifest = await fetchManifest();
    if (!manifest) {
      if (!stored.version) return applySeedSnapshot();
      return syncSkippedResult(stored.version);
    }

    if (!options.force && manifest.version === stored.version) {
      return syncSkippedResult(stored.version);
    }

    let total = 0;
    for (const gameId of SYNCED_GAME_IDS) {
      const entry = manifest.games[gameId];
      if (!entry) {
        // Game absent from manifest → treat as full takedown for that game.
        console.warn(
          `[CommunityTunes] manifest has no entry for ${gameId}; clearing its rows`,
        );
        await replaceCommunityTunes(gameId, []);
        continue;
      }

      const rows = await fetchCommunityTuneRows(gameId, entry.path);
      if (!rows) {
        return syncSkippedResult(stored.version);
      }

      const written = await replaceCommunityTunes(gameId, rows);
      total += written;
    }

    setCommunityTunesSyncState(manifest.version);
    recordOnlineSuccess("tunes");
    console.log(
      `[CommunityTunes] synced ${total} tune(s) at version ${manifest.version}`,
    );
    return { synced: true, count: total, version: manifest.version };
  } catch (err) {
    recordOnlineFailure("tunes", err instanceof Error ? err.message : String(err));
    console.warn(
      "[CommunityTunes] sync failed; keeping existing cache:",
      err instanceof Error ? err.message : err,
    );
    // First run on a blocked network: fall back to the snapshot shipped with the
    // app so the catalogue is never empty. Later failures keep the synced rows.
    if (!stored.version) return applySeedSnapshot();
    return syncSkippedResult(stored.version);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Kick off a non-blocking startup sync and schedule the recurring 6h refresh.
 * Safe to call once during server bootstrap.
 */
export function startCommunityTunesSync(): void {
  void syncCommunityTunes();
  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      void syncCommunityTunes();
    }, SYNC_INTERVAL_MS);
  }
}

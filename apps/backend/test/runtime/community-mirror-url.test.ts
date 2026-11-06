import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { loadSettings, saveSettings } from "@raceiq/backend-core/runtime/config/settings";
import { syncCommunityTunes } from "@raceiq/backend-core/tunes/community-sync";
import { syncLaptimes } from "@raceiq/backend-core/sync/laptimes";

// Follows DATA_DIR so this never mutates the real dev settings.json —
// `bun run test` isolates DATA_DIR to a throwaway directory (see package.json).
const SETTINGS_PATH = `${process.env.DATA_DIR ?? "./data"}/settings.json`;

const realFetch = globalThis.fetch;
const ENV_MIRROR = "https://env-mirror.example.com";
const SETTINGS_MIRROR = "https://settings-mirror.example.com/tunes";
// Matches the stored sync state below, so the manifest-version check stops the
// pass before any payload fetch — no database writes, no network.
const STORED_VERSION = "mirror-resolution-test";

/** Record every URL the sync asks for; answer with the stored manifest version. */
function captureSyncUrls(): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return {
      ok: true,
      status: 200,
      json: async () => ({ version: STORED_VERSION, games: {} }),
    } as Response;
  }) as unknown as typeof fetch;
  return urls;
}

let savedSettings: string | null = null;

beforeEach(() => {
  savedSettings = existsSync(SETTINGS_PATH) ? readFileSync(SETTINGS_PATH, "utf-8") : null;
  saveSettings({
    ...loadSettings(),
    communityTunesUrl: SETTINGS_MIRROR,
    communityTunesVersion: STORED_VERSION,
  });
  delete process.env.COMMUNITY_TUNES_URL;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.COMMUNITY_TUNES_URL;
  rmSync(`${SETTINGS_PATH}.tmp`, { recursive: true, force: true });
  if (savedSettings === null) rmSync(SETTINGS_PATH, { force: true });
  else writeFileSync(SETTINGS_PATH, savedSettings);
});

describe("community mirror base URL resolution", () => {
  test("COMMUNITY_TUNES_URL wins over settings.communityTunesUrl for tune sync", async () => {
    process.env.COMMUNITY_TUNES_URL = ENV_MIRROR;
    const urls = captureSyncUrls();

    await syncCommunityTunes();

    expect(urls).toEqual([`${ENV_MIRROR}/manifest.json`]);
  });

  test("tune sync uses settings.communityTunesUrl when the env override is absent", async () => {
    const urls = captureSyncUrls();

    await syncCommunityTunes();

    expect(urls).toEqual([`${SETTINGS_MIRROR}/manifest.json`]);
  });

  test("laptime sync resolves the same base URL (env wins, settings otherwise)", async () => {
    process.env.COMMUNITY_TUNES_URL = ENV_MIRROR;
    const envUrls = captureSyncUrls();
    await syncLaptimes({ force: true });
    expect(envUrls).toEqual([`${ENV_MIRROR}/manifest.json`]);

    delete process.env.COMMUNITY_TUNES_URL;
    const settingsUrls = captureSyncUrls();
    await syncLaptimes({ force: true });
    expect(settingsUrls).toEqual([`${SETTINGS_MIRROR}/manifest.json`]);
  });
});

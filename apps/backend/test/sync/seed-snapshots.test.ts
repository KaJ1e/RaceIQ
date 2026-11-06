import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  getLaptimes,
  resetLaptimesStateForTest,
  syncLaptimes,
} from "@raceiq/backend-core/sync/laptimes";

/**
 * Pins the bundled offline snapshots.
 *
 * The seeds ship gzip-compressed; `sha256` below is the hash of the
 * *decompressed* bytes, i.e. the exact JSON that used to be committed as
 * `.json`. Regenerating a snapshot changes that hash on purpose, so an
 * accidental edit cannot silently change what an offline user sees.
 */
const REPO_ROOT = resolve(import.meta.dir, "../../../..");

interface SnapshotPin {
  /** Path relative to the repo root. */
  path: string;
  /** sha256 of the decompressed JSON bytes. */
  sha256: string;
  count: number;
  /** sha256 of `JSON.stringify(rows[0])` — the whole row, value for value. */
  firstRowSha256: string;
  /** sha256 of `JSON.stringify(rows[count - 1])`. */
  lastRowSha256: string;
  /** Human-readable spot check of the first row. */
  firstRow: Record<string, unknown>;
}

const SNAPSHOTS: SnapshotPin[] = [
  {
    path: "server/tunes/seed/fm-2023-tunes.json.gz",
    sha256: "fd6fcc2c04b5e6627a39ff04af3a1ed0695db77b4cee6ac3475c77bd1923efa9",
    count: 171,
    firstRowSha256: "41bb1aff72b18a939c98ea7e1484e9542cc723ef920942a8564afcae10903fa2",
    lastRowSha256: "244ff04ba95ad5ff9fb33c16f4f86d758d8609029333471236364cfcb48dad0a",
    firstRow: {
      id: "community-1380866448448290816",
      name: "Porsche 911 GT3 R — aradenox",
      author: "aradenox",
      carOrdinal: 3951,
      category: "circuit",
      gameId: "fm-2023",
    },
  },
  {
    path: "server/sync/seed/forza.json.gz",
    sha256: "7c71a2fbeb68a7f94db347658aeb3408fabd83fab2540c322b463f7950bd4950",
    count: 2704,
    firstRowSha256: "34cdaedc0b384df62099bb69fee2f089dcd9023d5de2e197e08c2819387ffd35",
    lastRowSha256: "7993c9235196607ddcddb8cf1a997153b0aa6a6c029e3bac8682173dc7e6514c",
    firstRow: {
      track: "Circuit de Barcelona Catalunya",
      carClass: "LMP1",
      car: "Audi #2 R18 e-tron quattro",
      driver: "LES KNN",
      laptime: "01:25.499",
    },
  },
  {
    path: "server/sync/seed/ac-evo.json.gz",
    sha256: "3918bf980a83327b0e5204fc9fe0f7c1660d8fd14df116b9003cb349e755cd8a",
    count: 1466,
    firstRowSha256: "813b5df4f73f3913d0a79cdfaeb10fc3ef04ae272aa23e7f1da2cdf137a38b50",
    lastRowSha256: "912d9147899fd4d92ed29a07f485459ee21a6b8ca1ee8ef6a83cfbbbdf8f1aa3",
    firstRow: {
      track: "Bathurst",
      carClass: "Ferrari F1 F2004",
      car: "Ferrari F1 F2004",
      driver: "",
      laptime: "1:31.161",
    },
  },
  {
    path: "server/sync/seed/acc.json.gz",
    sha256: "633563864a221c19200b9276551f762a647a3ecff92e15cb51cc121a310eaddf",
    count: 614,
    firstRowSha256: "4706539fba16fcc2e801784011ad7a6b4f62394de15edffee7b59bd09a054ded",
    lastRowSha256: "e34dfffdd38c2357ac035bc763fe6b37a27a9acb9a29115f6653d7ac5fa3b5f5",
    firstRow: {
      track: "Autodromo Enzo e Dino Ferrari",
      carClass: "",
      car: "Ford Mustang GT3 (2024)",
      driver: "Sam Gaskell",
      laptime: "01:38.842",
    },
  },
];

const SEED_VERSION = "seed:2026-11-05";
const realFetch = globalThis.fetch;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readSnapshot(pin: SnapshotPin) {
  const decompressed = gunzipSync(readFileSync(resolve(REPO_ROOT, pin.path)));
  return {
    bytes: decompressed,
    rows: JSON.parse(decompressed.toString("utf8")) as Record<string, unknown>[],
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// Every test file in one `bun test` invocation shares a single module instance.
// Reset the leaderboard cache so rows another file synced cannot hide the seed
// path, and so this file leaves no synced rows behind either.
beforeEach(() => {
  resetLaptimesStateForTest();
});

describe("bundled seed snapshots", () => {
  for (const pin of SNAPSHOTS) {
    describe(pin.path, () => {
      test("decompresses to the pinned JSON bytes", () => {
        const { bytes } = readSnapshot(pin);
        expect(sha256(bytes)).toBe(pin.sha256);
      });

      test("holds the pinned rows", () => {
        const { rows } = readSnapshot(pin);
        expect(rows.length).toBe(pin.count);
        expect(sha256(JSON.stringify(rows[0]))).toBe(pin.firstRowSha256);
        expect(sha256(JSON.stringify(rows[rows.length - 1]))).toBe(pin.lastRowSha256);
        expect(rows[0]).toMatchObject(pin.firstRow);
      });
    });
  }

  test("offline fallback loads the snapshots lazily through syncLaptimes", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const result = await syncLaptimes();

    expect(result).toEqual({
      synced: false,
      count: SNAPSHOTS.filter((p) => p.path.startsWith("server/sync/")).reduce(
        (sum, p) => sum + p.count,
        0,
      ),
      version: SEED_VERSION,
    });
    for (const [gameId, path] of [
      ["fm-2023", "server/sync/seed/forza.json.gz"],
      ["acc", "server/sync/seed/acc.json.gz"],
      ["ac-evo", "server/sync/seed/ac-evo.json.gz"],
    ] as const) {
      const pin = SNAPSHOTS.find((p) => p.path === path)!;
      const rows = getLaptimes(gameId);
      expect(rows.length).toBe(pin.count);
      expect(rows[0] as unknown as Record<string, unknown>).toMatchObject(pin.firstRow);
    }
  });
});

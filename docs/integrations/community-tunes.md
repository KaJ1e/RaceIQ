# Community Tunes

RaceIQ synchronizes community-published Forza Motorsport tunes from a static CDN and merges them with the built-in catalog.

## Publisher contract

RaceIQ consumes two HTTP resources from the configured base URL:

- `GET /manifest.json`
- `GET /fm-2023/tunes.json`

The manifest provides a content `version`, generation time, and game entries containing count and payload path. The payload contains RaceIQ-ready catalog tune records for game ID `fm-2023`, with stable community IDs, source metadata, author information, and normalized settings. The version changes only when payload content changes.

Publisher conversion and validation happen before deployment. RaceIQ does not scrape or reinterpret publisher source data.

## Consumer behavior

`server/tunes/community-sync.ts` performs synchronization:

1. Fetch the manifest.
2. Compare its version with stored sync state.
3. Fetch and validate the game payload when content changed.
4. Replace that game's `community_tunes` rows transactionally.
5. Store the new manifest version and sync time only after success.

Synchronization runs at server startup, on its configured interval, and when a manual refresh is requested. Catalog queries merge database rows with built-in tunes for the game selected through `X-Game-Id`.

## Failure contract

The local cache does not expire. Network, manifest, payload, or validation failures preserve the previously synchronized rows. A valid zero-row payload is treated as an intentional removal. Invalid individual records are reported according to current sync validation behavior; the active cache is never partially replaced.

## Configuration

The base URL resolves in this order: `COMMUNITY_TUNES_URL` from the environment, then
`communityTunesUrl` in `settings.json`, then the public host. Both overrides must expose the
contract above and should use immutable content deployment with a content-derived manifest
version. A trailing slash is stripped, and a value that is not an absolute `http(s)` URL is
rejected when settings are saved.

## Offline and restricted networks

Every request is bounded by a 10 second timeout and a failure never replaces the cached
catalogue, so a blocked or stalled CDN costs one failed sync instead of hanging startup or
breaking the picker. To run fully local, point the base URL at any static host serving the
same files (a directory server is enough) and leave it configured; the cache then survives
network outages without further configuration.

## Ownership

Publisher maintainers own source collection, conversion, validation, and deployment. RaceIQ owns manifest consumption, persistence, refresh behavior, and catalog presentation. Changes to payload shape or identity rules require coordinated updates on both sides.

See `server/tunes/community-sync.ts`, `server/db/community-tune-queries.ts`, and
`apps/backend/test/setups/tuning/community-tunes-sync.test.ts` for current implementation
details.

# Restricted and mainland-China networks

RaceIQ is local-first: telemetry capture, storage, replay, analysis and the
charts run on the machine. Only five things ever leave the computer, and each
one degrades without breaking the app.

| Surface | Host | Behaviour when unreachable |
| --- | --- | --- |
| AI provider | the provider the user picked (DeepSeek is reachable without a proxy) | request fails with the provider's error; DeepSeek stays the recommended choice |
| Update check | `api.github.com` | 5 s timeout, silent, banner reports online content unavailable |
| Community tunes | `speedhq-tunes.pages.dev` | 10 s timeout; first run loads the bundled snapshot (171 tunes), later runs keep the last sync |
| Lap-time reference | `speedhq-tunes.pages.dev` | 10 s timeout; first run loads the bundled snapshot (4,784 entries), later runs keep the cache |
| Track guide videos | `www.youtube.com` | embeds load only after a click, so a blocked host never stalls a page; an embed that stays blank says so and links out to YouTube |

## What "offline" looks like

- The catalogue and the lap-time reference are never empty: a fresh install
  seeds them from data shipped inside the binary.
- A banner appears once a source has actually failed: "Online content is
  unavailable — showing local data." It is dismissible and never appears on a
  healthy connection.
- Nothing waits on the network during startup; every fetch runs in the
  background with a hard deadline.
- An AI request that cannot reach the provider reports that in plain language
  ("Cannot reach the AI provider…") instead of the transport error underneath
  it. Answers the provider itself returned — a bad key, an unknown model, a
  rate limit — are shown exactly as it wrote them.

## Pointing the catalogue at a mirror

Set it in **Settings → Connection → Community data mirror**, in
`settings.json`, or with an environment variable. The base URL resolves in this
order:

1. `COMMUNITY_TUNES_URL` environment variable,
2. `communityTunesUrl` in `settings.json`,
3. the public host.

The field accepts an absolute `http(s)` URL and strips a trailing slash; leave
it empty to use the public host. The setting is applied by the next sync, so the
catalogue keeps working while you change it.

A mirror only has to serve the same files (`manifest.json`, `<game>/tunes.json`,
`laptimes/<game>.json`) from any static host. A trailing slash is stripped, and
values that are not absolute `http(s)` URLs are rejected when settings are saved.

## Verifying the fallback

Point the base at a blackhole host and start with a fresh data directory:

```shell
COMMUNITY_TUNES_URL=http://10.255.255.1:9 DATA_DIR=... raceiq.exe
```

The log shows a 10 s timeout followed by `loaded bundled snapshot` for both the
tunes and the lap-time reference, and `GET /api/network-health` reports
`reachable: false` with the failing sources.

/**
 * Ambient declaration for the bundled seed snapshots.
 *
 * `import path from "./seed/x.json.gz" with { type: "file" }` resolves to the
 * asset's path instead of its contents. Bun keeps the file on disk in dev,
 * embeds it in `bun build --compile` output, and `Bun.file(path)` reads it back
 * either way.
 *
 * Declared once for the whole `@raceiq/backend-core` package: both seed owners
 * (`sync/` and `tunes/`) import snapshots this way. The consumers name this file
 * with a triple-slash reference so the declaration also loads in projects that
 * only reach them through imports (for example `packages/game-lmu/test`).
 */
declare module "*.json.gz" {
  const path: string;
  export default path;
}

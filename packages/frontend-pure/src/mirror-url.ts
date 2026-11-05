/**
 * The community tunes and lap-time catalogue can be served from a mirror, so a
 * network that cannot reach the public host still gets fresh data.
 *
 * The rule lives here rather than only in the server schema so the settings
 * field can reject a bad value before a round trip. It mirrors
 * `communityTunesUrl` in server/runtime/config/settings.ts: empty means "use the
 * built-in host", otherwise an absolute http(s) URL with no trailing slash.
 */
const HTTP_URL = /^https?:\/\/[^\s]+$/i;

export type MirrorUrlValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "not-http-url" };

export function normalizeMirrorUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return trimmed.replace(/\/+$/, "");
}

export function validateMirrorUrl(input: string): MirrorUrlValidation {
  const value = normalizeMirrorUrl(input);
  if (value === "") return { ok: true, value: "" };
  if (!HTTP_URL.test(value)) return { ok: false, reason: "not-http-url" };
  return { ok: true, value };
}

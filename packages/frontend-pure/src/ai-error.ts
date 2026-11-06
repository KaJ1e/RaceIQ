/**
 * Transport failures leak out of AI SDKs as raw runtime text ("fetch failed",
 * "ECONNRESET", an undici timeout). Those strings are useless to a driver who
 * never chose a socket, so the UI groups them and speaks in its own language.
 *
 * Anything the provider actually answered (bad key, unknown model, rate limit,
 * content policy) is left untouched: that text is the provider's to write.
 */
export type AiErrorKind = "network" | "timeout";

const TIMEOUT_PATTERNS: readonly RegExp[] = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/,
];

const NETWORK_PATTERNS: readonly RegExp[] = [
  /fetch failed/i,
  /failed to fetch/i,
  /load failed/i,
  /network connection lost/i,
  /socket hang up/i,
  /upstream connect error/i,
  /disconnect\/reset/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /EPIPE/,
  /UND_ERR_SOCKET/,
];

export function classifyAiError(message: string): AiErrorKind | null {
  if (!message) return null;
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(message))) return "timeout";
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(message))) return "network";
  return null;
}

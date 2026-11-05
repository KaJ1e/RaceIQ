import { classifyAiError } from "@raceiq/frontend-pure/ai-error";
import { m } from "@/paraglide/messages";

/**
 * Turn the transport noise an AI provider leaks into an error message into
 * something a driver can act on. Answers the provider actually wrote — bad key,
 * unknown model, rate limit — are returned unchanged.
 */
export function friendlyAiErrorMessage(message: string): string {
  const kind = classifyAiError(message);
  if (kind === "timeout") return m.ai_error_timeout();
  if (kind === "network") return m.ai_error_network();
  return message;
}

import { describe, expect, test } from "bun:test";
import { friendlyAiErrorMessage } from "../src/lib/ai-error";
import { m } from "../src/paraglide/messages";

describe("friendlyAiErrorMessage", () => {
  test("replaces transport failures with copy a driver can act on", () => {
    expect(friendlyAiErrorMessage("fetch failed")).toBe(m.ai_error_network());
    expect(friendlyAiErrorMessage("connect ECONNRESET 104.18.0.1:443")).toBe(m.ai_error_network());
  });

  test("names a deadline as a deadline", () => {
    expect(friendlyAiErrorMessage("UND_ERR_CONNECT_TIMEOUT")).toBe(m.ai_error_timeout());
  });

  test("keeps the provider's own answer verbatim", () => {
    expect(friendlyAiErrorMessage("401 Unauthorized: invalid api key")).toBe("401 Unauthorized: invalid api key");
    expect(friendlyAiErrorMessage("model not found")).toBe("model not found");
  });
});

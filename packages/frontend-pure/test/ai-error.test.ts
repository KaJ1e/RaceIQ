import { describe, test, expect } from "bun:test";
import { classifyAiError } from "@raceiq/frontend-pure/ai-error";

describe("classifyAiError", () => {
  test("recognises transport failures", () => {
    for (const message of [
      "fetch failed",
      "TypeError: fetch failed",
      "connect ECONNREFUSED 127.0.0.1:443",
      "read ECONNRESET",
      "getaddrinfo ENOTFOUND api.deepseek.com",
      "socket hang up",
      "Network connection lost.",
      "Failed to fetch",
      "Load failed",
      "upstream connect error or disconnect/reset before headers",
    ]) {
      expect(classifyAiError(message)).toBe("network");
    }
  });

  test("recognises deadlines", () => {
    for (const message of [
      "Connect Timeout Error",
      "UND_ERR_CONNECT_TIMEOUT",
      "The operation was aborted due to timeout",
      "Headers Timeout Error",
      "connect ETIMEDOUT 104.18.0.1:443",
    ]) {
      expect(classifyAiError(message)).toBe("timeout");
    }
  });

  test("leaves answers from the provider untouched", () => {
    for (const message of [
      "401 Unauthorized: invalid api key",
      "model not found",
      "DeepSeek API key not set.",
      "upstream 429 rate limit",
      "No response body",
      "",
    ]) {
      expect(classifyAiError(message)).toBeNull();
    }
  });
});

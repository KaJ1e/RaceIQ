import { describe, test, expect } from "bun:test";
import { normalizeMirrorUrl, validateMirrorUrl } from "@raceiq/frontend-pure/mirror-url";

describe("normalizeMirrorUrl", () => {
  test("trims and drops trailing slashes so requests stay predictable", () => {
    expect(normalizeMirrorUrl(" https://mirror.example.com/tunes/ ")).toBe("https://mirror.example.com/tunes");
    expect(normalizeMirrorUrl("https://mirror.example.com///")).toBe("https://mirror.example.com");
    expect(normalizeMirrorUrl("http://10.0.0.5:8080/raceiq")).toBe("http://10.0.0.5:8080/raceiq");
  });

  test("keeps the empty value empty", () => {
    expect(normalizeMirrorUrl("")).toBe("");
    expect(normalizeMirrorUrl("   ")).toBe("");
  });
});

describe("validateMirrorUrl", () => {
  test("accepts an empty value, which means the built-in host", () => {
    expect(validateMirrorUrl("")).toEqual({ ok: true, value: "" });
    expect(validateMirrorUrl("  ")).toEqual({ ok: true, value: "" });
  });

  test("accepts absolute http(s) URLs and returns them normalized", () => {
    expect(validateMirrorUrl("https://mirror.example.com/raceiq/")).toEqual({
      ok: true,
      value: "https://mirror.example.com/raceiq",
    });
    expect(validateMirrorUrl("http://192.168.1.20:9000")).toEqual({
      ok: true,
      value: "http://192.168.1.20:9000",
    });
  });

  test("rejects anything that is not an absolute http(s) URL", () => {
    for (const value of ["ftp://mirror.example.com", "mirror.example.com", "https://", "https://exa mple.com", "not a url"]) {
      expect(validateMirrorUrl(value).ok).toBe(false);
    }
  });
});

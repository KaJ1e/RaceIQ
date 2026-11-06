import { describe, test, expect } from "bun:test";
import {
  VIDEO_LOAD_DEADLINE_MS,
  restartVideoAttempt,
  shouldShowVideoFallback,
  youtubeWatchUrl,
} from "@raceiq/frontend-pure/video-embed";

describe("youtubeWatchUrl", () => {
  test("turns an embed URL into its watch URL", () => {
    expect(youtubeWatchUrl("https://www.youtube.com/embed/8eNe6VacNbQ")).toBe(
      "https://www.youtube.com/watch?v=8eNe6VacNbQ",
    );
    expect(youtubeWatchUrl("https://www.youtube.com/embed/8eNe6VacNbQ?start=30")).toBe(
      "https://www.youtube.com/watch?v=8eNe6VacNbQ",
    );
  });

  test("keeps short links working", () => {
    expect(youtubeWatchUrl("https://youtu.be/8eNe6VacNbQ")).toBe("https://www.youtube.com/watch?v=8eNe6VacNbQ");
  });

  test("passes anything it does not recognise through unchanged", () => {
    expect(youtubeWatchUrl("https://vimeo.com/123")).toBe("https://vimeo.com/123");
    expect(youtubeWatchUrl("")).toBe("");
  });
});

describe("shouldShowVideoFallback", () => {
  const idle = { activated: false, loaded: false, timedOut: false };

  test("stays quiet before the user asks for the video", () => {
    expect(shouldShowVideoFallback({ ...idle, timedOut: true })).toBe(false);
  });

  test("stays quiet while the embed is still loading", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true })).toBe(false);
  });

  test("stays quiet once the embed loaded", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true, loaded: true })).toBe(false);
  });

  test("speaks up only after the deadline passed without a load", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true, timedOut: true })).toBe(true);
  });

  test("waits a full 8 s before claiming failure", () => {
    expect(VIDEO_LOAD_DEADLINE_MS).toBe(8000);
  });

  test("retrying clears the failure so the deadline runs again", () => {
    const failed = { ...idle, activated: true, timedOut: true };
    expect(shouldShowVideoFallback(failed)).toBe(true);
    expect(shouldShowVideoFallback({ ...failed, ...restartVideoAttempt() })).toBe(false);
  });
});

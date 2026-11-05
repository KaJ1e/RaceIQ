import { describe, test, expect } from "bun:test";
import { shouldShowVideoFallback, youtubeWatchUrl } from "@raceiq/frontend-pure/video-embed";

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
  const idle = { activated: false, loaded: false, timedOut: false, offline: false };

  test("stays quiet before the user asks for the video", () => {
    expect(shouldShowVideoFallback({ ...idle, timedOut: true, offline: true })).toBe(false);
  });

  test("stays quiet once the embed loaded", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true, loaded: true })).toBe(false);
  });

  test("speaks up when the network is known to be blocked", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true, offline: true })).toBe(true);
  });

  test("speaks up when the embed never loads", () => {
    expect(shouldShowVideoFallback({ ...idle, activated: true, timedOut: true })).toBe(true);
  });
});

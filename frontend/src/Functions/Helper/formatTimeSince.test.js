import { describe, expect, it } from "vitest";
import { formatTimeSince } from "./numberParser";

const NOW = Date.parse("2026-09-17T12:00:00Z");

describe("how long ago a moment was", () => {
  it("names the largest unit that has passed", () => {
    expect(
      formatTimeSince(NOW - 4 * 60_000, { now: NOW, locale: "en-US" }),
    ).toBe("4 minutes ago");
    expect(
      formatTimeSince(NOW - 3 * 3_600_000, { now: NOW, locale: "en-US" }),
    ).toBe("3 hours ago");
    expect(
      formatTimeSince(NOW - 2 * 86_400_000, { now: NOW, locale: "en-US" }),
    ).toBe("2 days ago");
  });

  it("says a moment inside the last minute is now", () => {
    expect(formatTimeSince(NOW - 20_000, { now: NOW, locale: "en-US" })).toBe(
      "this minute",
    );
  });

  // A cache entry written a moment after the clock this render read is seconds in the future, and
  // "in 0 minutes" would be an odd way to say "just now".
  it("does not count forwards", () => {
    expect(formatTimeSince(NOW + 5_000, { now: NOW, locale: "en-US" })).toBe(
      "this minute",
    );
  });

  it("has nothing to say about a time it was not given", () => {
    expect(formatTimeSince(undefined, { now: NOW })).toBe("");
    expect(formatTimeSince(0, { now: NOW })).toBe("");
    expect(formatTimeSince(Number.NaN, { now: NOW })).toBe("");
  });
});

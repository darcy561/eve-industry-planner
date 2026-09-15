import { describe, expect, it } from "vitest";
import { cacheControlFor } from "./server.js";

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=3600, stale-while-revalidate=86400";

describe("cacheControlFor", () => {
  // Real names from a `vite build` of this SPA: the hashes are base64url, so a hex-only match
  // classifies every one of them as unversioned.
  it.each([
    "index-Dq5mesET.js",
    "Accounts-BmMQUZRD.js",
    "ArchivedItemBreakdown-Be9H_qHD.js",
    "ArchivedJobsPage-AZuyC9i_.js",
    "index-C1nGBqLk.css",
  ])("caches %s immutably", (fileName) => {
    expect(cacheControlFor(fileName)).toBe(IMMUTABLE);
  });

  it("never caches env.js immutably, as the container rewrites it at every start", () => {
    expect(cacheControlFor("env.js")).toBe(SHORT);
  });

  it.each(["index.html", "health.json", "manifest.webmanifest"])(
    "keeps %s revalidating",
    (fileName) => {
      expect(cacheControlFor(fileName)).toBe(SHORT);
    },
  );

  it.each(["favicon.ico", "android-chrome-512x512.png", "logo.svg"])(
    "caches %s immutably by extension",
    (fileName) => {
      expect(cacheControlFor(fileName)).toBe(IMMUTABLE);
    },
  );
});

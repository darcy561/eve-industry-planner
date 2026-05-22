import { describe, it, expect, vi, afterEach } from "vitest";
import {
  apiRateLimitRetryConfig,
  getRetryDelayMs,
  mergeApiRetryOptions,
  withRequestRetries,
} from "../src/Functions/Endpoints/withRequestRetries.js";

describe("getRetryDelayMs", () => {
  it("uses linear backoff for non-429 responses", () => {
    const res = new Response(null, { status: 500 });
    expect(getRetryDelayMs(res, 2, 350)).toBe(700);
  });

  it("waits until X-RateLimit-Reset on 429", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T01:00:00.000Z"));
    const resetSec = Math.floor(Date.now() / 1000) + 45;
    const res = new Response(null, {
      status: 429,
      headers: { "X-RateLimit-Reset": String(resetSec) },
    });
    expect(getRetryDelayMs(res, 1, 350)).toBe(45100);
    vi.useRealTimers();
  });

  it("honors Retry-After seconds on 429", () => {
    const res = new Response(null, {
      status: 429,
      headers: { "Retry-After": "30" },
    });
    expect(getRetryDelayMs(res, 1, 350)).toBe(30100);
  });
});

describe("mergeApiRetryOptions", () => {
  it("returns apiRateLimitRetryConfig by default", () => {
    expect(mergeApiRetryOptions(undefined)).toEqual({
      ...apiRateLimitRetryConfig,
    });
  });

  it("merges overrides", () => {
    expect(mergeApiRetryOptions({ maxAttempts: 8 })).toEqual({
      ...apiRateLimitRetryConfig,
      maxAttempts: 8,
    });
  });

  it("returns false when disabled", () => {
    expect(mergeApiRetryOptions(false)).toBe(false);
  });
});

describe("withRequestRetries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries 429 after Go Retry-After seconds delay", async () => {
    vi.useFakeTimers();
    let calls = 0;

    const promise = withRequestRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("Limit exceeded", {
            status: 429,
            headers: { "Retry-After": "30" },
          });
        }
        return new Response(null, { status: 204 });
      },
      apiRateLimitRetryConfig
    );

    await vi.advanceTimersByTimeAsync(30100);
    const res = await promise;
    expect(res.status).toBe(204);
    expect(calls).toBe(2);
  });

  it("retries 429 after X-RateLimit-Reset delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T01:00:00.000Z"));
    const resetSec = Math.floor(Date.now() / 1000) + 2;
    let calls = 0;

    const promise = withRequestRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("Limit exceeded", {
            status: 429,
            headers: { "X-RateLimit-Reset": String(resetSec) },
          });
        }
        return new Response(null, { status: 204 });
      },
      { maxAttempts: 3, baseDelayMs: 350 }
    );

    await vi.advanceTimersByTimeAsync(2100);
    const res = await promise;
    expect(res.status).toBe(204);
    expect(calls).toBe(2);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { queryClient } from "../../queryClient.js";
import { TRANQUILITY_SERVER_STATUS_QUERY_KEY } from "../../Hooks/React Query/tranquilityServerStatus.js";
import { shouldDeferAuthRefreshDueToTranquilityOffline } from "./authRefreshTranquilityGate.js";

// The gate decides whether any auth refresh is attempted at all, so both of its
// wrong answers are expensive: deferring on a stale or absent reading stops a
// session ever rotating, and not deferring keeps a dead Tranquility under load.
// It reads the real query cache, so these drive that cache rather than mock it.

/** Puts a settled successful reading in the cache, as a completed fetch would. */
function cacheReading(online) {
  queryClient.setQueryData(TRANQUILITY_SERVER_STATUS_QUERY_KEY, { online });
}

beforeEach(() => {
  queryClient.clear();
});

describe("deferring an auth refresh while Tranquility is down", () => {
  it("defers when the last successful fetch said offline", () => {
    cacheReading(false);

    expect(shouldDeferAuthRefreshDueToTranquilityOffline()).toBe(true);
  });

  it("does not defer when the last successful fetch said online", () => {
    cacheReading(true);

    expect(shouldDeferAuthRefreshDueToTranquilityOffline()).toBe(false);
  });

  // Before the first fetch lands there is nothing to go on, and refusing to
  // refresh would mean a tab that opened during an outage could never recover.
  it("does not defer before anything has been fetched", () => {
    expect(shouldDeferAuthRefreshDueToTranquilityOffline()).toBe(false);
  });

  // A query that has only ever failed says nothing about Tranquility — the
  // failure may be the client's own network — so it is not read as offline.
  it("does not defer on a reading that never succeeded", () => {
    queryClient.setQueryData(TRANQUILITY_SERVER_STATUS_QUERY_KEY, undefined);

    expect(shouldDeferAuthRefreshDueToTranquilityOffline()).toBe(false);
  });

  // `online` absent is not `online: false`: a reading whose shape changed must
  // not be read as an outage.
  it("does not defer on a reading with no online flag", () => {
    queryClient.setQueryData(TRANQUILITY_SERVER_STATUS_QUERY_KEY, {});

    expect(shouldDeferAuthRefreshDueToTranquilityOffline()).toBe(false);
  });

  // The parameter exists so call sites can pass Zustand's `get` unchanged; it is
  // deliberately unused, and passing one must not change the answer.
  it("ignores the getter a caller passes", () => {
    cacheReading(false);

    expect(
      shouldDeferAuthRefreshDueToTranquilityOffline(() => {
        throw new Error("the gate read the store");
      }),
    ).toBe(true);
  });
});

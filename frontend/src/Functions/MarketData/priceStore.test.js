// A real IndexedDB, because what this module owns is the round trip through one:
// jsdom has none, and a hand-written stand-in would prove only that the stand-in
// behaves as written.
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Set to make every call into storage fail, as a blocked browser does. */
let storageFailure = null;

/** Set to make storage neither answer nor fail, as a blocked open request does. */
let storageHang = false;

/** Set to make storage answer, but slowly. */
let storageDelayMs = 0;

vi.mock("idb-keyval", async (importOriginal) => {
  const real = await importOriginal();
  const guard =
    (fn) =>
    (...args) => {
      if (storageFailure) throw storageFailure;
      if (storageHang) return new Promise(() => {});
      if (storageDelayMs > 0) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(fn(...args)), storageDelayMs);
        });
      }
      return fn(...args);
    };

  return {
    ...real,
    get: guard(real.get),
    set: guard(real.set),
    del: guard(real.del),
  };
});

const { clear, get, keys, set } = await import("idb-keyval");
const { readStoredPrice, resetPriceStore, writeStoredPrice } =
  await import("./priceStore.js");

const row = (overrides = {}) => ({
  buy: 9,
  sell: 10,
  buyP95: 9,
  sellP05: 10,
  refreshedAt: 1757000000000,
  ...overrides,
});

beforeEach(async () => {
  storageFailure = null;
  storageHang = false;
  storageDelayMs = 0;
  resetPriceStore();
  await clear();
});

afterEach(() => {
  storageFailure = null;
});

describe("keeping a reader's own market between visits", () => {
  it("reads back what it was given", async () => {
    await writeStoredPrice("saved-station", 34, row());

    expect(await readStoredPrice("saved-station", 34)).toMatchObject({
      sell: 10,
      refreshedAt: 1757000000000,
    });
  });

  it("holds nothing for a type it was never given", async () => {
    expect(await readStoredPrice("saved-station", 34)).toBeUndefined();
  });

  // One row per type per market, the same unit the cache above holds.
  it("keeps one market's rows apart from another's", async () => {
    await writeStoredPrice("saved-station", 34, row({ sell: 10 }));
    await writeStoredPrice("another-station", 34, row({ sell: 20 }));

    expect((await readStoredPrice("saved-station", 34)).sell).toBe(10);
    expect((await readStoredPrice("another-station", 34)).sell).toBe(20);
  });

  it("stores nothing for a row that is not there", async () => {
    await writeStoredPrice("saved-station", 34, null);

    expect(await keys()).toHaveLength(0);
  });
});

describe("a row whose book has expired", () => {
  const expiring = row({ expiresAt: 2000 });

  it("is not offered", async () => {
    await writeStoredPrice("saved-station", 34, expiring);

    expect(await readStoredPrice("saved-station", 34, 2001)).toBeUndefined();
  });

  it("is still offered right up to its expiry", async () => {
    await writeStoredPrice("saved-station", 34, expiring);

    expect(await readStoredPrice("saved-station", 34, 1999)).toBeDefined();
  });

  // Reading is the only moment anything knows a row is finished with, so it is
  // also the eviction: nothing sweeps, and nothing has to.
  it("is dropped as it is found, not left to be found again", async () => {
    await writeStoredPrice("saved-station", 34, expiring);

    await readStoredPrice("saved-station", 34, 2001);

    expect(await keys()).toHaveLength(0);
  });

  it("is kept where the source stated no expiry", async () => {
    await writeStoredPrice("saved-station", 34, row());

    expect(await readStoredPrice("saved-station", 34, 9e12)).toBeDefined();
  });
});

// A reader in a private window, or one who has blocked site data, still gets
// prices — they are simply fetched every time. Storage failing must never reach
// a surface as a missing figure or an error.
describe("when storage cannot be used at all", () => {
  it("answers a read as nothing held", async () => {
    await writeStoredPrice("saved-station", 34, row());
    storageFailure = new Error("IndexedDB is not available");

    expect(await readStoredPrice("saved-station", 34)).toBeUndefined();
  });

  it("lets a write pass without throwing", async () => {
    storageFailure = new Error("QuotaExceededError");

    await expect(
      writeStoredPrice("saved-station", 34, row()),
    ).resolves.toBeUndefined();
  });
});

// A version bump changes the key a row is addressed under, so nothing reads the
// old ones again — which also means the per-row eviction can never reach them.
describe("rows left behind by an earlier row shape", () => {
  const abandoned = "price|v0|saved-station|34";

  it("are removed rather than left on the reader's device", async () => {
    await set(abandoned, row());

    await writeStoredPrice("saved-station", 35, row());
    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
  });

  it("do not take the current shape's rows with them", async () => {
    await set(abandoned, row());
    await writeStoredPrice("saved-station", 34, row({ sell: 42 }));

    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
    expect((await readStoredPrice("saved-station", 34)).sell).toBe(42);
  });

  // Whatever else is in the reader's IndexedDB is not this module's to clear.
  it("leave anything that is not a price alone", async () => {
    await set("something-else", { kept: true });

    await writeStoredPrice("saved-station", 34, row());
    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());

    expect(await get("something-else")).toEqual({ kept: true });
  });
});

// A store request can hang rather than fail: an open request that fires
// `blocked` settles nothing, and WebKit can close a connection without saying
// so. Nothing above this reports a hang, so a reader would simply watch a figure
// never arrive — which is why waiting is bounded rather than trusted.
describe("when storage never answers at all", () => {
  it("gives up and reports nothing held", async () => {
    vi.useFakeTimers();
    try {
      storageHang = true;

      const reading = readStoredPrice("saved-station", 34);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(reading).resolves.toBeUndefined();
    } finally {
      storageHang = false;
      vi.useRealTimers();
    }
  });

  // Real timers, because the budget must not fire against a store that is simply
  // taking its time — a slow disk is not a wedged one.
  it("does not give up on a store that is merely slow", async () => {
    await writeStoredPrice("saved-station", 34, row());
    storageDelayMs = 50;

    await expect(readStoredPrice("saved-station", 34)).resolves.toBeDefined();
  });
});

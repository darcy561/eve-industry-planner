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
const {
  deferMarket,
  readMarketCharacter,
  readMarketFreshness,
  readStoredPrice,
  replaceStoredPrices,
  resetPriceStore,
  writeMarketCharacter,
} = await import("./priceStore.js");

/** Holds one row, the way a read of that market's whole set does. */
const hold = (sourceID, typeID, entry) =>
  replaceStoredPrices(sourceID, new Map([[String(typeID), entry]]), {
    refreshedAt: entry.refreshedAt,
    ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
  });

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
    await hold("saved-station", 34, row());

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
    await hold("saved-station", 34, row({ sell: 10 }));
    await hold("another-station", 34, row({ sell: 20 }));

    expect((await readStoredPrice("saved-station", 34)).sell).toBe(10);
    expect((await readStoredPrice("another-station", 34)).sell).toBe(20);
  });
});

describe("a row whose prices have expired", () => {
  const expiring = row({ expiresAt: 2000 });

  it("is not offered", async () => {
    await hold("saved-station", 34, expiring);

    expect(await readStoredPrice("saved-station", 34, 2001)).toBeUndefined();
  });

  it("is still offered right up to its expiry", async () => {
    await hold("saved-station", 34, expiring);

    expect(await readStoredPrice("saved-station", 34, 1999)).toBeDefined();
  });

  // Reading is the only moment anything knows a row is finished with, so it is
  // also the eviction: nothing sweeps, and nothing has to.
  it("is dropped as it is found, not left to be found again", async () => {
    await hold("saved-station", 34, expiring);

    await readStoredPrice("saved-station", 34, 2001);

    expect(await readStoredPrice("saved-station", 34, 2001)).toBeUndefined();
    expect((await keys()).filter((key) => key.startsWith("price|"))).toEqual(
      [],
    );
  });

  it("is kept where the source stated no expiry", async () => {
    await hold("saved-station", 34, row());

    expect(await readStoredPrice("saved-station", 34, 9e12)).toBeDefined();
  });
});

// A reader in a private window, or one who has blocked site data, still gets
// prices — they are simply fetched every time. Storage failing must never reach
// a surface as a missing figure or an error.
describe("when storage cannot be used at all", () => {
  it("answers a read as nothing held", async () => {
    await hold("saved-station", 34, row());
    storageFailure = new Error("IndexedDB is not available");

    expect(await readStoredPrice("saved-station", 34)).toBeUndefined();
  });

  it("lets a write pass without throwing", async () => {
    storageFailure = new Error("QuotaExceededError");

    await expect(hold("saved-station", 34, row())).resolves.toBeUndefined();
  });
});

// A version bump changes the key a row is addressed under, so nothing reads the
// old ones again — which also means the per-row eviction can never reach them.
describe("rows left behind by an earlier row shape", () => {
  const abandoned = "price|v0|saved-station|34";

  it("are removed rather than left on the reader's device", async () => {
    await set(abandoned, row());

    await hold("saved-station", 35, row());
    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
  });

  it("do not take the current shape's rows with them", async () => {
    await set(abandoned, row());
    await hold("saved-station", 34, row({ sell: 42 }));

    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
    expect((await readStoredPrice("saved-station", 34)).sell).toBe(42);
  });

  // Whatever else is in the reader's IndexedDB is not this module's to clear.
  it("leave anything that is not a price alone", async () => {
    // The abandoned key is what tells us the prune has run at all: without one
    // to wait on, this asserts against a sweep that may not have happened.
    await set(abandoned, row());
    await set("something-else", { kept: true });

    await hold("saved-station", 34, row());
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
    await hold("saved-station", 34, row());
    storageDelayMs = 50;

    await expect(readStoredPrice("saved-station", 34)).resolves.toBeDefined();
  });
});

describe("replacing everything held for one market", () => {
  // A walk of a whole market says what is on it. A type it does not
  // mention is one nobody trades there now, and a row kept for it would show a
  // price for something that cannot be bought — and never expire, because
  // nothing would refresh it.
  it("removes a type the new read does not mention", async () => {
    const freshness = { refreshedAt: 1000, expiresAt: 9_000_000_000_000 };
    await replaceStoredPrices(
      "market-1",
      new Map([
        ["34", { buy: 5, sell: 6 }],
        ["35", { buy: 7, sell: 8 }],
      ]),
      freshness,
    );
    expect(await readStoredPrice("market-1", "35")).toMatchObject({ buy: 7 });

    await replaceStoredPrices(
      "market-1",
      new Map([["34", { buy: 9 }]]),
      freshness,
    );

    expect(await readStoredPrice("market-1", "34")).toMatchObject({ buy: 9 });
    expect(await readStoredPrice("market-1", "35")).toBeUndefined();
  });

  // Each market is walked on its own, so one replacing its rows says nothing
  // about another's.
  it("leaves another market's rows alone", async () => {
    const freshness = { refreshedAt: 1000, expiresAt: 9_000_000_000_000 };
    await replaceStoredPrices(
      "market-1",
      new Map([["34", { buy: 5 }]]),
      freshness,
    );
    await replaceStoredPrices(
      "market-2",
      new Map([["99", { buy: 3 }]]),
      freshness,
    );

    await replaceStoredPrices(
      "market-1",
      new Map([["34", { buy: 6 }]]),
      freshness,
    );

    expect(await readStoredPrice("market-2", "99")).toMatchObject({ buy: 3 });
  });

  // The rows carry the read's clocks rather than their own: they were all read
  // at one moment, and a reader comparing two of them is comparing one walk.
  it("stamps every row with the read's own clocks", async () => {
    await replaceStoredPrices("market-1", new Map([["34", { buy: 5 }]]), {
      refreshedAt: 4242,
      expiresAt: 9_000_000_000_000,
    });

    expect(await readStoredPrice("market-1", "34")).toMatchObject({
      refreshedAt: 4242,
      expiresAt: 9_000_000_000_000,
    });
  });
});

// Which character could read a market is worth exactly one avoided walk across
// every character the account has, so it is kept beside that market's rows.
describe("the character that read a market", () => {
  it("reads back what it was given", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");

    expect(await readMarketCharacter("saved-citadel")).toBe("hash-main");
  });

  it("holds nothing for a market nothing has read", async () => {
    expect(await readMarketCharacter("saved-citadel")).toBeUndefined();
  });

  it("keeps one market's character apart from another's", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");
    await writeMarketCharacter("another-citadel", "hash-alt");

    expect(await readMarketCharacter("saved-citadel")).toBe("hash-main");
    expect(await readMarketCharacter("another-citadel")).toBe("hash-alt");
  });

  it("replaces the one held when a different character reads it", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");
    await writeMarketCharacter("saved-citadel", "hash-alt");

    expect(await readMarketCharacter("saved-citadel")).toBe("hash-alt");
  });

  // The record is not a price, so a read of the whole market — which removes
  // every row it did not mention — must not take it with them.
  it("survives the market's rows being replaced", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");
    await replaceStoredPrices(
      "saved-citadel",
      new Map([["34", { buy: 5, sell: 6 }]]),
      { refreshedAt: 1000 },
    );

    expect(await readMarketCharacter("saved-citadel")).toBe("hash-main");
    expect(await readStoredPrice("saved-citadel", "34")).toMatchObject({
      sell: 6,
    });
  });

  it("answers as nothing held when storage cannot be used", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");
    storageFailure = new Error("IndexedDB is not available");

    expect(await readMarketCharacter("saved-citadel")).toBeUndefined();
  });

  it("lets a write pass without throwing", async () => {
    storageFailure = new Error("QuotaExceededError");

    await expect(
      writeMarketCharacter("saved-citadel", "hash-main"),
    ).resolves.toBeUndefined();
  });

  it("is removed when it was written under an earlier shape", async () => {
    await set("market-character|v0|saved-citadel", "hash-old");

    await writeMarketCharacter("another-citadel", "hash-main");
    await vi.waitFor(async () =>
      expect(await get("market-character|v0|saved-citadel")).toBeUndefined(),
    );
  });
});

// A rotation that could not read a market changes only when it is worth trying
// again — what is held for it is as good or as bad as it was.
describe("putting a market's turn back", () => {
  it("moves when it is next due without touching its rows", async () => {
    await hold("saved-citadel", 34, row({ expiresAt: 9_000_000_000_000 }));

    await deferMarket("saved-citadel", 5000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      expiresAt: 5000,
    });
    expect(await readStoredPrice("saved-citadel", 34)).toMatchObject({
      sell: 10,
    });
  });

  it("keeps the moment the market was last read", async () => {
    await hold("saved-citadel", 34, row());

    await deferMarket("saved-citadel", 5000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      refreshedAt: 1757000000000,
    });
  });

  it("puts off a market nothing has read yet", async () => {
    await deferMarket("never-read", 5000);

    expect(await readMarketFreshness("never-read")).toMatchObject({
      expiresAt: 5000,
    });
  });
});

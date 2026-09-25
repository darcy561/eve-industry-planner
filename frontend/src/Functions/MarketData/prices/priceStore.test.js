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

/** Set to `{key, run}` to interleave a write just before that key is read. */
let beforeReadOf = null;

/** Set to a key whose write fails, as a quota reached partway through does. */
let failWriteOf = null;

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

  const readGuard = (fn) => {
    const guarded = guard(fn);
    return async (key, ...rest) => {
      if (beforeReadOf?.key === key) {
        const { run } = beforeReadOf;
        beforeReadOf = null;
        await run();
      }
      return guarded(key, ...rest);
    };
  };

  return {
    ...real,
    get: readGuard(real.get),
    set: guard((key, ...rest) => {
      if (key === failWriteOf) throw new Error("QuotaExceededError");
      return real.set(key, ...rest);
    }),
    del: guard(real.del),
  };
});

const { clear, get, set } = await import("idb-keyval");
const {
  deferMarket,
  readMarketCharacter,
  readMarketFreshness,
  dropUnreadMarkets,
  readStoredOrders,
  readStoredPrice,
  replaceStoredOrders,
  replaceStoredPrices,
  UNREAD_MARKET_MS,
  resetPriceStore,
  writeMarketCharacter,
} = await import("./priceStore.js");
const { MARKET_READ_OUTCOME } = await import("../registry/marketReadOutcome");

/** The prefixes the store writes under now, so a version bump moves these with it. */
const { STORE_VERSION } = await import("./priceStore.js");
const rowKey = (marketLocation, typeID) =>
  `price|v${STORE_VERSION}|${marketLocation}|${typeID}`;
const readKey = (marketLocation) =>
  `market-read|v${STORE_VERSION}|${marketLocation}`;

/** Holds one row, the way a read of that market's whole set does. */
const hold = (marketLocation, typeID, entry) =>
  replaceStoredPrices(marketLocation, new Map([[String(typeID), entry]]), {
    refreshedAt: entry.refreshedAt,
    expiresAt: entry.refreshedAt + 60 * 60 * 1000,
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
  beforeReadOf = null;
  failWriteOf = null;
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

  // Every row carries the moment of the read rather than one of its own: they
  // were all read at once, and a reader comparing two of them is comparing one
  // walk. When the market is next due is the market's own affair, so it is
  // recorded once for the market rather than on four hundred rows.
  it("stamps every row with the moment the market was read", async () => {
    await replaceStoredPrices("market-1", new Map([["34", { buy: 5 }]]), {
      refreshedAt: 4242,
      expiresAt: 9_000_000_000_000,
    });

    expect(await readStoredPrice("market-1", "34")).toEqual({
      buy: 5,
      refreshedAt: 4242,
    });
    expect(await readMarketFreshness("market-1")).toMatchObject({
      expiresAt: 9_000_000_000_000,
    });
  });
});

// A write reaches storage a row at a time and can give out partway through: a
// quota reached, a tab closed. What must not survive it is a market saying it
// holds a read it does not.
describe("a write that gives out partway through", () => {
  it("leaves the market due rather than claiming the read it did not finish", async () => {
    await replaceStoredPrices("half-written", new Map([["34", { buy: 5 }]]), {
      refreshedAt: 1_000,
      expiresAt: 2_000,
    });

    failWriteOf = rowKey("half-written", 35);
    await replaceStoredPrices(
      "half-written",
      new Map([
        ["34", { buy: 9 }],
        ["35", { buy: 9 }],
      ]),
      { refreshedAt: 500_000, expiresAt: 600_000 },
    );

    // The turn that brought the read about, not the one it would have written.
    expect(await readMarketFreshness("half-written")).toMatchObject({
      expiresAt: 2_000,
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

  // The record is not a price, so a read of the whole market — which clears
  // every row held for it — must not take the record with them.
  it("survives the market's rows being replaced", async () => {
    await writeMarketCharacter("saved-citadel", "hash-main");
    await replaceStoredPrices(
      "saved-citadel",
      new Map([["34", { buy: 5, sell: 6 }]]),
      { refreshedAt: 1000, expiresAt: 9_000_000_000_000 },
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

  // A record left behind under an earlier shape states no moment this device
  // read the market,
  // and a market the reader has since removed is never read again — so nothing
  // would ever give it one, and the sweep could not reach the markets it is for.
  it("abandons a market whose record was written under an earlier shape", async () => {
    await set("market-read|v0|gone-citadel", {
      refreshedAt: 1_000_000,
      expiresAt: 2_000_000,
    });
    await set("price|v0|gone-citadel|34", { buy: 9, sell: 10 });

    await writeMarketCharacter("another-citadel", "hash-main");

    await vi.waitFor(async () => {
      expect(await get("market-read|v0|gone-citadel")).toBeUndefined();
      expect(await get("price|v0|gone-citadel|34")).toBeUndefined();
    });
  });
});

// A rotation that could not read a market changes only when it is worth trying
// again — what is held for it is as good or as bad as it was.
describe("putting a market's turn back", () => {
  it("moves when it is next due without touching its rows", async () => {
    await hold("saved-citadel", 34, row());

    await deferMarket("saved-citadel", 5000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      expiresAt: 5000,
    });
    expect(await readStoredPrice("saved-citadel", 34)).toMatchObject({
      sell: 10,
    });
  });

  // Moving it forward would keep a market nobody can reach alive against the
  // day-old sweep for as long as it went on failing, which is precisely the
  // market the sweep is for.
  it("does not move when the market was last read", async () => {
    const before = Date.now();
    await hold("saved-citadel", 34, row());

    await deferMarket("saved-citadel", 5000);

    const { readAt } = await readMarketFreshness("saved-citadel");
    expect(readAt).toBeGreaterThanOrEqual(before);
    expect(readAt).toBeLessThanOrEqual(Date.now());
  });

  it("puts off a market nothing has read yet", async () => {
    await deferMarket("never-read", 5000);

    expect(await readMarketFreshness("never-read")).toMatchObject({
      expiresAt: 5000,
    });
  });

  // Why the turn was put back is the only thing a panel can say about a market
  // whose figures never arrive, so it is kept beside when it is due again.
  it("keeps what the attempt settled on", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });
  });

  // A caller that deferred for its own reasons has established nothing new, so
  // the market keeps the last answer it did get rather than losing it.
  it("leaves what it settled on alone when the caller names nothing", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);
    await deferMarket("saved-citadel", 9000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      expiresAt: 9000,
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });
  });

  // Prices arriving disproves whatever the last turn could not do, so the
  // reason must not outlive the read: a market the reader has just regained
  // access to would otherwise go on saying they cannot see it.
  it("stops saying a market was refused once it reads", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);

    await hold("saved-citadel", 34, row());

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      outcome: MARKET_READ_OUTCOME.READ,
    });
  });
});

// What bounds the tier. A market is refreshed because the reader still has it
// saved, so one they have removed, or one no character can reach any more,
// simply stops being refreshed — and this is the only thing that then throws it
// away.
describe("a market nothing has read in a day", () => {
  const DAY = UNREAD_MARKET_MS;

  /** Holds one row for a market read at a given moment. */
  async function readAt(marketLocation, moment) {
    vi.setSystemTime(moment);
    await hold(marketLocation, 34, row());
    vi.useRealTimers();
  }

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("has everything held for it thrown away", async () => {
    await readAt("gone-citadel", 1_000_000);

    expect(await dropUnreadMarkets(1_000_000 + DAY + 1)).toBe(1);

    expect(await readStoredPrice("gone-citadel", 34)).toBeUndefined();
    expect(await readMarketFreshness("gone-citadel")).toBeUndefined();
  });

  // The record is what says the market may be asked again at all, so a sweep
  // that took the rows and left it would leave a market claiming a read it no
  // longer holds anything from.
  it("loses the character that read it along with its rows", async () => {
    await readAt("gone-citadel", 1_000_000);
    await writeMarketCharacter("gone-citadel", "hash-main");

    await dropUnreadMarkets(1_000_000 + DAY + 1);

    expect(await readMarketCharacter("gone-citadel")).toBeUndefined();
  });

  it("is kept right up to the day", async () => {
    await readAt("busy-citadel", 1_000_000);

    expect(await dropUnreadMarkets(1_000_000 + DAY)).toBe(0);
    expect(await readStoredPrice("busy-citadel", 34)).toBeDefined();
  });

  it("leaves a market still being read alone", async () => {
    await readAt("gone-citadel", 1_000_000);
    await readAt("busy-citadel", 1_000_000 + DAY);

    expect(await dropUnreadMarkets(1_000_000 + DAY + 1)).toBe(1);

    expect(await readStoredPrice("gone-citadel", 34)).toBeUndefined();
    expect(await readStoredPrice("busy-citadel", 34)).toBeDefined();
  });

  // Its record is what paces the attempts, and it holds no rows to throw away.
  // Taking it would make the market due at once, and it would be walked again
  // on every probe — a refusal per character, which ESI charges at five times a
  // hit.
  it("keeps the record putting off a market never read successfully", async () => {
    await deferMarket("refusing-citadel", 1_000_000);

    expect(await dropUnreadMarkets(1_000_000 + DAY + 1)).toBe(0);
    expect(await readMarketFreshness("refusing-citadel")).toMatchObject({
      expiresAt: 1_000_000,
    });
  });

  // The tick, a sign-in and a panel asking for a price are three chains with
  // nothing between them, and the scan is as long as the reader has markets. A
  // sweep that decided about every market first and deleted afterwards threw
  // away one refreshed while it was still walking — losing the walk that had
  // just been paid for, and sending the next reader to fetch it again.
  it("leaves alone a market read again while the sweep was walking", async () => {
    await readAt("first-citadel", 1_000_000);
    await readAt("second-citadel", 1_000_000);

    // As the scan reaches the second market, the first is read again — a panel
    // asking for a price on it, or a sign-in landing mid-tick. The names carry
    // the order: a scan walks the keys as storage returns them, in ascending
    // order, so this is the market the scan has already passed.
    beforeReadOf = {
      key: readKey("second-citadel"),
      run: () => readAt("first-citadel", 1_000_000 + DAY + 1),
    };

    expect(await dropUnreadMarkets(1_000_000 + DAY + 1)).toBe(2);

    expect(await readStoredPrice("first-citadel", 34)).toBeDefined();
    expect(await readMarketFreshness("first-citadel")).toBeDefined();
    expect(await readStoredPrice("second-citadel", 34)).toBeUndefined();
  });

  it("answers as nothing swept when storage cannot be used", async () => {
    storageFailure = new Error("IndexedDB is not available");

    expect(await dropUnreadMarkets()).toBe(0);
  });
});

// ESI has no per-type form of a structure's market, so a reader who wants one
// type has already asked for every order. Keeping them is what stops the next
// question costing another read.
describe("a market's orders, as they were read", () => {
  const orders = [
    { order_id: 1, type_id: 34, price: 5, is_buy_order: false },
    { order_id: 2, type_id: 34, price: 4, is_buy_order: true },
  ];

  it("hands the orders back with the moment they were read", async () => {
    await replaceStoredOrders("saved-citadel", orders, 1700);

    expect(await readStoredOrders("saved-citadel")).toEqual({
      orders,
      refreshedAt: 1700,
    });
  });

  // A read of a structure is a statement about all of its orders: one filled
  // since the last one is gone rather than stale, and merging would leave it.
  it("replaces them rather than adding to them", async () => {
    await replaceStoredOrders("saved-citadel", orders, 1700);
    await replaceStoredOrders("saved-citadel", [orders[0]], 1800);

    expect((await readStoredOrders("saved-citadel")).orders).toHaveLength(1);
  });

  it("answers nothing for a market nothing has read here", async () => {
    expect(await readStoredOrders("never-read")).toBeUndefined();
  });

  // The prices a job is costed against are derived and stored separately, so a
  // write that could not land costs the reader a browse and not a price.
  it("is dropped with the market when it goes unread", async () => {
    await hold("saved-citadel", 34, row());
    await replaceStoredOrders("saved-citadel", orders, 1700);
    vi.setSystemTime(Date.now() + UNREAD_MARKET_MS + 1);

    await dropUnreadMarkets();

    expect(await readStoredOrders("saved-citadel")).toBeUndefined();
  });
});

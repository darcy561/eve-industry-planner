import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let storageFailure = null;

let storageHang = false;

let storageDelayMs = 0;

let beforeReadOf = null;

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

const { STORE_VERSION } = await import("./priceStore.js");
const rowKey = (marketLocation, typeID) =>
  `price|v${STORE_VERSION}|${marketLocation}|${typeID}`;
const readKey = (marketLocation) =>
  `market-read|v${STORE_VERSION}|${marketLocation}`;

const hold = (marketLocation, typeID, entry) =>
  replaceStoredPrices(marketLocation, new Map([[String(typeID), entry]]), {
    refreshedAt: entry.refreshedAt,
    expiresAt: entry.refreshedAt + 60 * 60 * 1000,
  });

const typePrice = (overrides = {}) => ({
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
    await hold("saved-station", 34, typePrice());

    expect(await readStoredPrice("saved-station", 34)).toMatchObject({
      sell: 10,
      refreshedAt: 1757000000000,
    });
  });

  it("holds nothing for a type it was never given", async () => {
    expect(await readStoredPrice("saved-station", 34)).toBeUndefined();
  });

  it("keeps one market's prices apart from another's", async () => {
    await hold("saved-station", 34, typePrice({ sell: 10 }));
    await hold("another-station", 34, typePrice({ sell: 20 }));

    expect((await readStoredPrice("saved-station", 34)).sell).toBe(10);
    expect((await readStoredPrice("another-station", 34)).sell).toBe(20);
  });
});

describe("when storage cannot be used at all", () => {
  it("answers a read as nothing held", async () => {
    await hold("saved-station", 34, typePrice());
    storageFailure = new Error("IndexedDB is not available");

    expect(await readStoredPrice("saved-station", 34)).toBeUndefined();
  });

  it("lets a write pass without throwing", async () => {
    storageFailure = new Error("QuotaExceededError");

    await expect(
      hold("saved-station", 34, typePrice()),
    ).resolves.toBeUndefined();
  });
});

describe("prices left behind by an earlier shape", () => {
  const abandoned = "price|v0|saved-station|34";

  it("are removed rather than left on the reader's device", async () => {
    await set(abandoned, typePrice());

    await hold("saved-station", 35, typePrice());
    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
  });

  it("do not take the current shape's prices with them", async () => {
    await set(abandoned, typePrice());
    await hold("saved-station", 34, typePrice({ sell: 42 }));

    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());
    expect((await readStoredPrice("saved-station", 34)).sell).toBe(42);
  });

  it("leave anything that is not a price alone", async () => {
    await set(abandoned, typePrice());
    await set("something-else", { kept: true });

    await hold("saved-station", 34, typePrice());
    await vi.waitFor(async () => expect(await get(abandoned)).toBeUndefined());

    expect(await get("something-else")).toEqual({ kept: true });
  });
});

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

  it("does not give up on a store that is merely slow", async () => {
    await hold("saved-station", 34, typePrice());
    storageDelayMs = 50;

    await expect(readStoredPrice("saved-station", 34)).resolves.toBeDefined();
  });
});

describe("replacing everything held for one market", () => {
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

  it("leaves another market's prices alone", async () => {
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

  it("stamps every price with the moment the market was read", async () => {
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

    expect(await readMarketFreshness("half-written")).toMatchObject({
      expiresAt: 2_000,
    });
  });
});

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

  it("survives the market's prices being replaced", async () => {
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

describe("putting a market's turn back", () => {
  it("moves when it is next due without touching its prices", async () => {
    await hold("saved-citadel", 34, typePrice());

    await deferMarket("saved-citadel", 5000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      expiresAt: 5000,
    });
    expect(await readStoredPrice("saved-citadel", 34)).toMatchObject({
      sell: 10,
    });
  });

  it("does not move when the market was last read", async () => {
    const before = Date.now();
    await hold("saved-citadel", 34, typePrice());

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

  it("keeps what the attempt settled on", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });
  });

  it("leaves what it settled on alone when the caller names nothing", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);
    await deferMarket("saved-citadel", 9000);

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      expiresAt: 9000,
      outcome: MARKET_READ_OUTCOME.REFUSED,
    });
  });

  it("stops saying a market was refused once it reads", async () => {
    await deferMarket("saved-citadel", 5000, MARKET_READ_OUTCOME.REFUSED);

    await hold("saved-citadel", 34, typePrice());

    expect(await readMarketFreshness("saved-citadel")).toMatchObject({
      outcome: MARKET_READ_OUTCOME.READ,
    });
  });
});

describe("a market nothing has read in a day", () => {
  const DAY = UNREAD_MARKET_MS;

  async function readAt(marketLocation, moment) {
    vi.setSystemTime(moment);
    await hold(marketLocation, 34, typePrice());
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

  it("loses the character that read it along with its prices", async () => {
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

  it("keeps the record putting off a market never read successfully", async () => {
    await deferMarket("refusing-citadel", 1_000_000);

    expect(await dropUnreadMarkets(1_000_000 + DAY + 1)).toBe(0);
    expect(await readMarketFreshness("refusing-citadel")).toMatchObject({
      expiresAt: 1_000_000,
    });
  });

  it("leaves alone a market read again while the sweep was walking", async () => {
    await readAt("first-citadel", 1_000_000);
    await readAt("second-citadel", 1_000_000);

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

  it("replaces them rather than adding to them", async () => {
    await replaceStoredOrders("saved-citadel", orders, 1700);
    await replaceStoredOrders("saved-citadel", [orders[0]], 1800);

    expect((await readStoredOrders("saved-citadel")).orders).toHaveLength(1);
  });

  it("answers nothing for a market nothing has read here", async () => {
    expect(await readStoredOrders("never-read")).toBeUndefined();
  });

  it("is dropped with the market when it goes unread", async () => {
    await hold("saved-citadel", 34, typePrice());
    await replaceStoredOrders("saved-citadel", orders, 1700);
    vi.setSystemTime(Date.now() + UNREAD_MARKET_MS + 1);

    await dropUnreadMarkets();

    expect(await readStoredOrders("saved-citadel")).toBeUndefined();
  });
});

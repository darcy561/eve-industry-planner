import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const readCitadelPrices = vi.fn();
vi.mock("./citadelPrices", () => ({
  readCitadelPrices: (...args) => readCitadelPrices(...args),
}));

const replaceStoredPrices = vi.fn();
vi.mock("./priceStore", () => ({
  replaceStoredPrices: (...args) => replaceStoredPrices(...args),
  readStoredPrice: vi.fn(),
}));

const AZBEL = 1035466617946;
const ASTRAHUS = 1035466617947;

// Two saved citadels, because the unit a read covers is the market: wants at
// one market share a read and wants at two do not.
vi.mock("./marketSources", async () => {
  const { marketSourcesWith, savedCitadel } =
    await import("../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    savedCitadel({ id: "azbel", name: "Perimeter Azbel", structureID: AZBEL }),
    savedCitadel({
      id: "astrahus",
      name: "A second one",
      structureID: ASTRAHUS,
    }),
  );
});

const {
  requestMarketRead,
  requestPrice,
  resetPriceLoader,
  setClockMovedListener,
} = await import("./priceLoader.js");
const { readSourceClock, recordSourceClock, resetSourceClocks } =
  await import("./sourceClocks.js");

const priced = (rows, extra = {}) => ({
  rows: new Map(rows),
  refreshedAt: 1757000000000,
  ...extra,
});

beforeEach(() => {
  fetchMarketPricesQuery.mockResolvedValue({ sources: {}, adjusted: null });
  readCitadelPrices.mockResolvedValue(priced([["34", { sell: 10, buy: 9 }]]));
});

afterEach(() => {
  resetPriceLoader();
  resetSourceClocks();
  setClockMovedListener(null);
  vi.clearAllMocks();
});

describe("a tick wanting prices at a citadel", () => {
  it("reads the market rather than asking this server", async () => {
    const row = await requestPrice(34, "azbel");

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(readCitadelPrices.mock.calls[0][0]).toMatchObject({
      structureID: AZBEL,
    });
    expect(fetchMarketPricesQuery).not.toHaveBeenCalled();
    expect(row).toMatchObject({ sell: 10, refreshedAt: 1757000000000 });
  });

  // The whole point of the kind: one read answers every want at that market,
  // however many types a panel asked for.
  it("reads it once however many types were wanted", async () => {
    readCitadelPrices.mockResolvedValue(
      priced([
        ["34", { sell: 10 }],
        ["35", { sell: 20 }],
      ]),
    );

    const [first, second] = await Promise.all([
      requestPrice(34, "azbel"),
      requestPrice(35, "azbel"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(first.sell).toBe(10);
    expect(second.sell).toBe(20);
  });

  it("reads two markets apart from each other", async () => {
    readCitadelPrices.mockImplementation(async (source) =>
      priced([["34", { sell: source.structureID === AZBEL ? 10 : 20 }]]),
    );

    const [azbel, astrahus] = await Promise.all([
      requestPrice(34, "azbel"),
      requestPrice(34, "astrahus"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
    expect(azbel.sell).toBe(10);
    expect(astrahus.sell).toBe(20);
  });

  // The same answer a hub gives by leaving the row out, rather than a price of
  // zero, which is a figure and a wrong one.
  it("settles as nothing for a type the market holds no order for", async () => {
    expect(await requestPrice(99, "azbel")).toBeNull();
  });
});

describe("what a read is kept as", () => {
  // A read of a whole market is a statement about every type on it, so what is
  // kept is the set — a type that stopped trading goes, and the next reader to
  // want any type already has it without a second read.
  it("is the whole market, not the types this tick wanted", async () => {
    const rows = new Map([
      ["34", { sell: 10 }],
      ["35", { sell: 20 }],
    ]);
    readCitadelPrices.mockResolvedValue(
      priced(rows, { refreshedAt: 42, expiresAt: 99 }),
    );

    await requestPrice(34, "azbel");

    expect(replaceStoredPrices).toHaveBeenCalledWith("azbel", rows, {
      refreshedAt: 42,
      expiresAt: 99,
    });
  });

  // When the market is next due is the market's own affair, recorded once for
  // it; a row carries only the moment the walk that read it was current.
  it("carries the moment of the read on the row, and no expiry", async () => {
    readCitadelPrices.mockResolvedValue(
      priced([["34", { sell: 10 }]], { refreshedAt: 42, expiresAt: 99 }),
    );

    expect(await requestPrice(34, "azbel")).toEqual({
      sell: 10,
      refreshedAt: 42,
    });
  });

  // Announcing the move drops this market's held rows and wakes every surface
  // reading them — and what they read through is the store. Announcing first
  // sends them to the rows this read is about to replace, and they would hold
  // those until something else moved the market.
  it("is written to the device before the market is said to have moved", async () => {
    let finishWriting;
    replaceStoredPrices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWriting = resolve;
        }),
    );
    const moved = vi.fn();
    setClockMovedListener(moved);
    recordSourceClock("azbel", 1);

    const asked = requestPrice(34, "azbel");
    await vi.waitFor(() => expect(replaceStoredPrices).toHaveBeenCalled());

    // Written, not merely started: a surface woken by the move reads the store,
    // so the rows have to be in it by the time the move is announced.
    expect(moved).not.toHaveBeenCalled();

    finishWriting();
    await asked;

    expect(moved).toHaveBeenCalledTimes(1);
  });

  it("is held under the reader's own id for the market", async () => {
    await requestPrice(34, "azbel");

    expect(replaceStoredPrices.mock.calls[0][0]).toBe("azbel");
    expect(readSourceClock("azbel")).toBe(1757000000000);
    expect(readSourceClock(String(AZBEL))).toBeUndefined();
  });

  // A market read again is a market whose held rows are superseded, and the
  // cache above only learns that from this.
  it("reports the market as moved when it has been read again", async () => {
    const moved = vi.fn();
    setClockMovedListener(moved);

    await requestPrice(34, "azbel");
    resetPriceLoader();
    readCitadelPrices.mockResolvedValue(
      priced([["34", { sell: 11 }]], { refreshedAt: 1757003600000 }),
    );
    await requestPrice(34, "azbel");

    expect(moved).toHaveBeenCalledTimes(1);
    expect(moved).toHaveBeenCalledWith({
      sources: ["azbel"],
      adjusted: false,
    });
  });

  it("says nothing moved on the first read of a market", async () => {
    const moved = vi.fn();
    setClockMovedListener(moved);

    await requestPrice(34, "azbel");

    expect(moved).not.toHaveBeenCalled();
  });
});

describe("a citadel that cannot be read", () => {
  it("fails its own wants rather than settling them as nothing", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));

    await expect(requestPrice(34, "azbel")).rejects.toThrow(
      /nobody can dock there/,
    );
  });

  it("keeps nothing for a market it could not read", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));

    await expect(requestPrice(34, "azbel")).rejects.toThrow();

    expect(replaceStoredPrices).not.toHaveBeenCalled();
  });

  // The two transports are independent: a market nobody can see must not take
  // the tick's hub prices with it.
  it("does not take the hub prices in the same tick with it", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } } },
      adjusted: null,
    });

    const [citadel, hub] = await Promise.allSettled([
      requestPrice(34, "azbel"),
      requestPrice(34, "jita"),
    ]);

    expect(citadel.status).toBe("rejected");
    expect(hub.status).toBe("fulfilled");
    expect(hub.value.sell).toBe(5);
  });
});

// A rotation and a panel are set off by the same thing — this market having
// gone stale — so wanting it at the same moment is ordinary, not a corner.
describe("a rotation and a reader wanting the same market", () => {
  /**
   * A read that does not settle until it is let go.
   *
   * Without this the two never overlap: a mocked read settles before the second
   * asker has been scheduled, and the test would pass on a guard that does
   * nothing.
   */
  function heldOpen({ failing = false } = {}) {
    let release;
    readCitadelPrices.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          release = () =>
            failing
              ? reject(new Error("nobody can dock there"))
              : resolve(priced([["34", { sell: 10 }]]));
        }),
    );
    return () => release();
  }

  it("share one read and one write between them", async () => {
    const finish = heldOpen();

    const both = Promise.all([
      requestPrice(34, "azbel"),
      new Promise((resolve) => setTimeout(resolve, 0)).then(() =>
        requestMarketRead("azbel"),
      ),
    ]);
    await vi.waitFor(() => expect(readCitadelPrices).toHaveBeenCalled());
    finish();
    await both;

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(replaceStoredPrices).toHaveBeenCalledTimes(1);
  });

  it("do not join work at another market", async () => {
    await Promise.all([
      requestMarketRead("azbel"),
      requestMarketRead("astrahus"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
  });

  // The sharing lasts as long as the work and not a moment longer, which is
  // what makes a market refreshable at all.
  it("are not answered from work that has already finished", async () => {
    await requestMarketRead("azbel");
    await requestMarketRead("azbel");

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
  });

  it("share a failure rather than each paying for one", async () => {
    const fail = heldOpen({ failing: true });

    const settled = Promise.allSettled([
      requestPrice(34, "azbel"),
      new Promise((resolve) => setTimeout(resolve, 0)).then(() =>
        requestMarketRead("azbel"),
      ),
    ]);
    await vi.waitFor(() => expect(readCitadelPrices).toHaveBeenCalled());
    fail();
    const [want, rotation] = await settled;

    expect(want.status).toBe("rejected");
    expect(rotation.status).toBe("rejected");
    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
  });
});

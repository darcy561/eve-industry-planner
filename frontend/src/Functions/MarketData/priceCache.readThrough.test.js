import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPrice = vi.fn();
const requestAdjustedPrice = vi.fn();
const requestMarketRead = vi.fn();
vi.mock("./priceLoader", () => ({
  requestPrice: (...args) => requestPrice(...args),
  requestAdjustedPrice: (...args) => requestAdjustedPrice(...args),
  requestMarketRead: (...args) => requestMarketRead(...args),
  setClockMovedListener: () => {},
}));

const readStoredPrice = vi.fn();
const readMarketFreshness = vi.fn();
const deferMarket = vi.fn();
vi.mock("./priceStore", () => ({
  readStoredPrice: (...args) => readStoredPrice(...args),
  readMarketFreshness: (...args) => readMarketFreshness(...args),
  deferMarket: (...args) => deferMarket(...args),
}));

// One market of each kind an account can save: a station this server prices as
// it prices a hub, and a citadel the browser reads itself.
vi.mock("./marketSources", async () => {
  const { marketSourcesWith, savedStation, savedCitadel } =
    await import("../../tests/marketSourceFixtures.js");
  return marketSourcesWith(savedStation(), savedCitadel());
});

const { queryClient } = await import("../../queryClient.js");
const {
  expireSavedSourceRows,
  fetchPrices,
  readPrice,
  rotateSelfReadMarkets,
  revalidateSourceClocks,
} = await import("./priceCache.js");
const { readSourceClock, resetSourceClocks } =
  await import("./sourceClocks.js");
const { PRICE_ROTATION_MS } = await import("./citadelPrices.js");

const row = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
  refreshedAt: 1757000000000,
});

beforeEach(() => {
  queryClient.clear();
  resetSourceClocks();
  vi.clearAllMocks();
  readStoredPrice.mockResolvedValue(undefined);
  readMarketFreshness.mockResolvedValue(undefined);
  requestPrice.mockResolvedValue(null);
  requestMarketRead.mockResolvedValue(null);
  deferMarket.mockResolvedValue(undefined);
});

// Rows are kept on a reader's device only where they cost that reader
// something to get. A hub and a saved station are priced by this server and are
// one request away after a reload, so neither touches the tier beneath.
describe("a market this server prices", () => {
  it("is fetched without consulting the tier beneath", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "jita" },
        { typeID: 34, sourceID: "saved-station" },
      ],
    });

    expect(readStoredPrice).not.toHaveBeenCalled();
    expect(readPrice(34, "jita").sell).toBe(10);
    expect(readPrice(34, "saved-station").sell).toBe(10);
  });

  // A market the server walks states its own clock, and a stale row served
  // from disk would sit in front of a figure the server has already replaced.
  it("is asked for again after a reload rather than restored", async () => {
    readStoredPrice.mockResolvedValue(row(7));
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(requestPrice).toHaveBeenCalledWith(34, "saved-station");
    expect(readPrice(34, "saved-station").sell).toBe(10);
  });

  // Nothing of theirs is held, so the sweep that retires stored rows has
  // nothing to retire and asks nobody.
  it("has nothing for the retirement sweep to drop", async () => {
    // With an expiry of its own, so this fails if a station is ever classed as
    // a market the reader keeps rather than passing for want of one.
    requestPrice.mockResolvedValue({ ...row(10), expiresAt: 2000 });

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(expireSavedSourceRows(2001)).toBe(0);
    expect(readPrice(34, "saved-station").sell).toBe(10);
  });
});

// The accessor above must not be able to tell where a row came from.
describe("every market", () => {
  const READ_BY_SURFACES = ["buy", "sell", "buyP95", "sellP05", "refreshedAt"];

  it("answers every field a surface reads", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "saved-station" },
        { typeID: 34, sourceID: "jita" },
      ],
    });

    const saved = readPrice(34, "saved-station");
    const hub = readPrice(34, "jita");

    for (const field of READ_BY_SURFACES) {
      expect(saved[field]).toBe(hub[field]);
    }
  });
});

// The tier exists for the one market kind a reader pays for themselves: a
// citadel's whole market is read on their own token, so losing those rows means
// paying for all of them again to price one type.
describe("a market the reader reads themselves", () => {
  it("is served from the reader's device without asking for it again", async () => {
    readStoredPrice.mockResolvedValue(row(7));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-citadel" }] });

    expect(readStoredPrice).toHaveBeenCalledWith("saved-citadel", 34);
    expect(requestPrice).not.toHaveBeenCalled();
    expect(readPrice(34, "saved-citadel").sell).toBe(7);
  });

  // The one kind the retirement sweep is for: its rows state when they lapse,
  // and nothing goes back to the market until a reader asks again.
  it("has its expired rows retired by the sweep", async () => {
    readStoredPrice.mockResolvedValue(undefined);
    requestPrice.mockResolvedValue({ ...row(10), expiresAt: 2000 });

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-citadel" }] });
    expect(readPrice(34, "saved-citadel")).toBeDefined();

    expect(expireSavedSourceRows(2001)).toBe(1);
    expect(readPrice(34, "saved-citadel")).toBeUndefined();
  });

  it("falls through to the read when nothing is held for it", async () => {
    readStoredPrice.mockResolvedValue(undefined);
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-citadel" }] });

    expect(requestPrice).toHaveBeenCalledWith(34, "saved-citadel");
    expect(readPrice(34, "saved-citadel").sell).toBe(10);
  });
});

// A reload empties the clock record and leaves the rows on disk, and a market
// whose clock is unknown cannot be seen to move — so the read that replaces
// those rows would look like the market's first and drop nothing.
describe("a market whose rows come back from the reader's device", () => {
  // Both halves in one test on purpose: the clock not moving is what the second
  // asserts, which a cache that recorded nothing at all would also satisfy.
  it("has its clock restored from the row, and never dragged backwards", async () => {
    readStoredPrice.mockResolvedValue({
      ...row(7),
      refreshedAt: 1757003600000,
    });
    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-citadel" }] });

    expect(readSourceClock("saved-citadel")).toBe(1757003600000);

    // Rows outlive the tab, so a row on disk can be older than one already read.
    readStoredPrice.mockResolvedValue({
      ...row(6),
      refreshedAt: 1757000000000,
    });
    await fetchPrices({ wants: [{ typeID: 35, sourceID: "saved-citadel" }] });

    expect(readSourceClock("saved-citadel")).toBe(1757003600000);
  });
});

// Asking a market the reader reads themselves for one type reads the whole
// market, because that is the only form its orders come in — so the probe that
// costs one row everywhere else would cost a walk here, every time it ran.
describe("the probe and a market the reader reads themselves", () => {
  it("leaves it alone while asking the markets this server prices", async () => {
    requestPrice.mockResolvedValue(row(10));
    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "jita" },
        { typeID: 34, sourceID: "saved-citadel" },
      ],
    });
    requestPrice.mockClear();

    await revalidateSourceClocks();

    expect(requestPrice).toHaveBeenCalledWith("34", "jita");
    expect(requestPrice).not.toHaveBeenCalledWith("34", "saved-citadel");
  });
});

// A market this server prices is re-asked one type at a time, so letting the
// next reader pay costs them a row. A citadel's orders only come whole, so the
// same wait is the whole market — which is what this reads ahead of them.
describe("rotating a market the reader reads themselves", () => {
  // Read from the device, not from what is held: the cache lets a row nothing
  // is watching go within minutes, so a rotation paced by it would stop
  // rotating the moment a reader looked away.
  it("reads a market whose turn has come round", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 1000,
      expiresAt: 2000,
    });

    expect(await rotateSelfReadMarkets(2001)).toBe(1);
    expect(requestMarketRead).toHaveBeenCalledWith("saved-citadel");
  });

  it("asks nothing of a market whose turn has not come", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 1000,
      expiresAt: 9000,
    });

    expect(await rotateSelfReadMarkets(2001)).toBe(0);
    expect(requestMarketRead).not.toHaveBeenCalled();
  });

  // A market is saved because the reader means to price against it, so one
  // nothing has read yet is due now rather than never — refreshing only what has
  // been asked for leaves prices fresh where a reader has been and stale
  // everywhere else.
  it("reads a market nothing has ever read", async () => {
    readMarketFreshness.mockResolvedValue(undefined);

    expect(await rotateSelfReadMarkets(9e12)).toBe(1);
    expect(requestMarketRead).toHaveBeenCalledWith("saved-citadel");
  });

  // A market nobody can reach any more would otherwise be walked on every
  // probe, and every walk is a refusal per character.
  it("puts a market it could not read back to its full turn", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 1000,
      expiresAt: 2000,
    });
    const refusal = new Error("nobody can dock there");
    refusal.permanent = true;
    requestMarketRead.mockRejectedValue(refusal);

    expect(await rotateSelfReadMarkets(2001)).toBe(1);

    expect(deferMarket).toHaveBeenCalledWith(
      "saved-citadel",
      2001 + PRICE_ROTATION_MS,
    );
  });

  it("leaves a market it did read where the read put it", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 1000,
      expiresAt: 2000,
    });

    await rotateSelfReadMarkets(2001);

    expect(deferMarket).not.toHaveBeenCalled();
  });

  // This server states a clock rather than a turn, and the probe is what asks
  // it — rotating one of these would be a request nobody needed.
  it("leaves the markets this server prices alone", async () => {
    readMarketFreshness.mockResolvedValue({
      refreshedAt: 1000,
      expiresAt: 2000,
    });

    await rotateSelfReadMarkets(2001);

    expect(readMarketFreshness).toHaveBeenCalledTimes(1);
    expect(readMarketFreshness).toHaveBeenCalledWith("saved-citadel");
  });
});

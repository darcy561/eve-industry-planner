import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

// The registry is the seam a reader-saved market joins at, so two stations
// exist here the way an account's saved markets exist for a reader.
const THE_FORGE = 10000002;
const JITA_4_4 = 60003760;
const RENS = 60004588;

/** Set to make reading the registry throw, as a stored one could. */
let registryFailure = null;

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedStation } =
    await import("../../../tests/marketSourceFixtures.js");

  return marketSourcesWith(() => {
    if (registryFailure) throw registryFailure;

    return [
      savedStation({ regionID: THE_FORGE, stationID: JITA_4_4 }),
      savedStation({
        id: "another-station",
        name: "Another station the reader saved",
        regionID: THE_FORGE,
        stationID: RENS,
      }),
      savedStation({
        id: "same-station-again",
        name: "The same station, saved twice",
        regionID: THE_FORGE,
        stationID: JITA_4_4,
      }),
    ];
  });
});

const { requestPrice, resetPriceLoader } = await import("./priceLoader.js");
const { resetSourceClocks, readSourceClock } =
  await import("./sourceClocks.js");

beforeEach(() => {
  registryFailure = null;
  fetchMarketPricesQuery.mockResolvedValue({ sources: {}, adjusted: null });
});

afterEach(() => {
  resetPriceLoader();
  resetSourceClocks();
  vi.clearAllMocks();
});

describe("a want for a station the reader saved", () => {
  // This server prices a market an account registered, and a station id is what
  // it was registered by — the reader's own id for it means nothing there.
  it("is asked of this server by the station it sits at", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { [JITA_4_4]: { refreshedAt: 7, prices: { 34: { sell: 10 } } } },
      adjusted: null,
    });

    const row = await requestPrice(34, "saved-station");

    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: String(JITA_4_4) },
    ]);
    expect(row.sell).toBe(10);
  });

  // Every row, key and clock in the cache is held under the reader's id, so an
  // answer keyed by a station has to come back to it.
  it("holds the clock under the reader's own id for the market", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        [JITA_4_4]: { refreshedAt: 99, prices: { 34: { sell: 10 } } },
      },
      adjusted: null,
    });

    await requestPrice(34, "saved-station");

    expect(readSourceClock("saved-station")).toBe(99);
    expect(readSourceClock(String(JITA_4_4))).toBeUndefined();
  });

  // The same answer a hub gives by leaving the row out, rather than a price of
  // zero, which is a figure and a wrong one.
  it("settles as nothing where the market holds no order", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { [JITA_4_4]: { refreshedAt: 7, prices: {} } },
      adjusted: null,
    });

    expect(await requestPrice(34, "saved-station")).toBeNull();
  });
});

// Nothing stops an account saving one station twice, under two names. They are
// asked for under the same id, so a clock kept per answered market rather than
// per want would leave one of them serving a superseded price with nothing to
// tell it otherwise.
describe("two markets an account saved at one station", () => {
  it("each hold the clock under their own id", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        [JITA_4_4]: { refreshedAt: 42, prices: { 34: { sell: 10 } } },
      },
      adjusted: null,
    });

    const [first, second] = await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "same-station-again"),
    ]);

    expect(first.sell).toBe(10);
    expect(second.sell).toBe(10);
    expect(readSourceClock("saved-station")).toBe(42);
    expect(readSourceClock("same-station-again")).toBe(42);
  });

  it("are asked for once, not once each", async () => {
    await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "same-station-again"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: String(JITA_4_4) },
      { typeID: "34", marketLocation: String(JITA_4_4) },
    ]);
  });
});

describe("a tick naming hubs and saved markets together", () => {
  // One transport now answers both, so they travel as one request rather than
  // two — and each source is named by what this server knows it as.
  it("asks for them in one request", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } },
        [RENS]: { refreshedAt: 1, prices: { 34: { sell: 6 } } },
      },
      adjusted: null,
    });

    const [hub, saved] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "another-station"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: "jita" },
      { typeID: "34", marketLocation: String(RENS) },
    ]);
    expect(hub.sell).toBe(5);
    expect(saved.sell).toBe(6);
  });

  it("fails both when this server cannot be reached", async () => {
    fetchMarketPricesQuery.mockRejectedValue(new Error("offline"));

    const [hub, saved] = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(hub.status).toBe("rejected");
    expect(saved.status).toBe("rejected");
  });
});

describe("a market the registry cannot name", () => {
  // The absence of anywhere to ask, which is not the same as a market holding
  // no order — a reader whose saved market has gone needs the difference.
  it("fails rather than settling as nothing held", async () => {
    await expect(requestPrice(34, "a-market-nobody-saved")).rejects.toThrow(
      /no market source named/,
    );
  });

  it("fails every want in the tick when the registry itself throws", async () => {
    registryFailure = new Error("the registry is unreadable");

    await expect(requestPrice(34, "jita")).rejects.toThrow(
      /the registry is unreadable/,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const ordersByRegionAndType = vi.fn();
vi.mock("./fetchStationBook", () => ({
  ordersByRegionAndType: (...args) => ordersByRegionAndType(...args),
}));

// The registry is the seam a reader-saved market joins at, so a station exists
// for these tests the way Stage F will make one exist for a reader.
const THE_FORGE = 10000002;

/** Set to make reading the registry throw, as a stored one could. */
let registryFailure = null;

vi.mock("./marketSources", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    allMarketSources: () => {
      if (registryFailure) throw registryFailure;
      return [
        ...real.allMarketSources(),
        {
          id: "saved-station",
          name: "A station the reader saved",
          regionID: THE_FORGE,
          stationID: 60003760,
          kind: real.SOURCE_KIND.STATION,
        },
        {
          id: "another-station",
          name: "Another station in the same region",
          regionID: THE_FORGE,
          stationID: 60004588,
          kind: real.SOURCE_KIND.STATION,
        },
      ];
    },
  };
});

const { requestPrice, resetPriceLoader } = await import("./priceLoader.js");
const { resetSourceClocks } = await import("./sourceClocks.js");

const order = (price, locationID, isBuy = false) => ({
  price,
  location_id: locationID,
  is_buy_order: isBuy,
});

const book = (orders) => ({ orders, etag: "", expiresAt: undefined });

beforeEach(() => {
  registryFailure = null;
  fetchMarketPricesQuery.mockResolvedValue({ sources: {}, adjusted: null });
  ordersByRegionAndType.mockResolvedValue(book([]));
});

afterEach(() => {
  resetPriceLoader();
  resetSourceClocks();
  vi.clearAllMocks();
});

describe("a want for a station the reader saved", () => {
  it("is read from the region's book rather than asked of this server", async () => {
    ordersByRegionAndType.mockResolvedValue(
      book([order(10, 60003760), order(8, 60003760, true)]),
    );

    const row = await requestPrice(34, "saved-station");

    expect(ordersByRegionAndType).toHaveBeenCalledWith({
      regionID: THE_FORGE,
      typeID: "34",
    });
    expect(fetchMarketPricesQuery).not.toHaveBeenCalled();
    expect(row.sell).toBe(10);
    expect(row.buy).toBe(8);
  });

  // A region's orders carry every station in it, so a station that filtered
  // nothing would price against its neighbours' orders.
  it("counts only the orders at that station", async () => {
    ordersByRegionAndType.mockResolvedValue(
      book([order(10, 60003760), order(1, 60004588)]),
    );

    const row = await requestPrice(34, "saved-station");

    expect(row.sell).toBe(10);
  });

  // The same answer a hub gives by leaving the row out, rather than a price of
  // zero, which is a figure and a wrong one.
  it("settles as nothing where the station holds no order", async () => {
    ordersByRegionAndType.mockResolvedValue(book([order(1, 60004588)]));

    expect(await requestPrice(34, "saved-station")).toBeNull();
  });

  it("carries the moment the browser read it", async () => {
    ordersByRegionAndType.mockResolvedValue(book([order(10, 60003760)]));

    const row = await requestPrice(34, "saved-station");

    expect(row.refreshedAt).toBeGreaterThan(0);
  });
});

describe("two transports in one tick", () => {
  // The whole reason the loader splits. Sent as one request they were not
  // independent: this server answers 400 for the entire request when it sees a
  // source it does not price, so one station want took every hub price with it.
  it("asks each of them for only its own wants", async () => {
    await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", sourceID: "jita" },
    ]);
    expect(ordersByRegionAndType).toHaveBeenCalledTimes(1);
  });

  it("keeps a hub price when the station's book cannot be read", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } } },
      adjusted: null,
    });
    ordersByRegionAndType.mockRejectedValue(new Error("esi is down"));

    const [hub, station] = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(hub.status).toBe("fulfilled");
    expect(hub.value.sell).toBe(5);
    expect(station.status).toBe("rejected");
  });

  it("keeps a station price when this server cannot be reached", async () => {
    fetchMarketPricesQuery.mockRejectedValue(new Error("offline"));
    ordersByRegionAndType.mockResolvedValue(book([order(10, 60003760)]));

    const [hub, station] = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(hub.status).toBe("rejected");
    expect(station.status).toBe("fulfilled");
    expect(station.value.sell).toBe(10);
  });
});

// One read of a region's book answers every station in it, which is what makes
// a second saved station in the same region cost nothing.
describe("two stations in one region", () => {
  it("share one read of the book they both need", async () => {
    ordersByRegionAndType.mockResolvedValue(
      book([order(10, 60003760), order(20, 60004588)]),
    );

    const [first, second] = await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "another-station"),
    ]);

    expect(ordersByRegionAndType).toHaveBeenCalledTimes(1);
    expect(first.sell).toBe(10);
    expect(second.sell).toBe(20);
  });

  it("read the book once per type, not once per station and type", async () => {
    await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "another-station"),
      requestPrice(35, "saved-station"),
    ]);

    expect(ordersByRegionAndType).toHaveBeenCalledTimes(2);
  });
});

// A stored choice can outlive the market it named. Nothing can answer for it,
// which is not the same fact as a market holding no order.
describe("a source the registry does not carry", () => {
  it("fails its own want and nothing else", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } } },
      adjusted: null,
    });

    const [hub, gone] = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "a-market-that-was-removed"),
    ]);

    expect(hub.status).toBe("fulfilled");
    expect(gone.status).toBe("rejected");
    expect(gone.reason.message).toMatch(/a-market-that-was-removed/);
  });

  it("is never offered to either transport", async () => {
    await Promise.allSettled([requestPrice(34, "a-market-that-was-removed")]);

    expect(fetchMarketPricesQuery).not.toHaveBeenCalled();
    expect(ordersByRegionAndType).not.toHaveBeenCalled();
  });
});

// The loader runs from a timer, so a throw outside the two transports would be
// reported nowhere. A want that never settles leaves the cache entry above it
// waiting for ever, which a reader sees as a figure that never arrives and no
// error anywhere — strictly worse than a failure.
describe("something outside either transport failing", () => {
  it("fails every want in the tick rather than leaving them unsettled", async () => {
    registryFailure = new Error("the saved markets could not be read");

    const settled = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(settled.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(settled[0].reason.message).toMatch(/saved markets/);
    // Nothing was asked of anything: the sorting is what failed, so neither
    // transport was ever told what it was meant to fetch.
    expect(fetchMarketPricesQuery).not.toHaveBeenCalled();
    expect(ordersByRegionAndType).not.toHaveBeenCalled();
  });
});

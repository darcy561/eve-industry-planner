import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketLocations = vi.fn();
vi.mock("../../Endpoints/Private/marketLocations.js", () => ({
  fetchMarketLocations: (...args) => fetchMarketLocations(...args),
}));

const { queryClient } = await import("../../../queryClient.js");
const {
  MARKET_LOCATIONS_QUERY_KEY,
  marketLocationsChanged,
  readMarketLocations,
  refreshMarketLocations,
  refreshMarketLocationsAfterWrite,
  seedMarketLocations,
} = await import("./marketLocations.js");

const azbel = { id: "market-1", name: "Perimeter Azbel", structureID: 1 };

beforeEach(() => {
  queryClient.removeQueries({ queryKey: MARKET_LOCATIONS_QUERY_KEY });
  fetchMarketLocations.mockReset().mockResolvedValue([azbel]);
});

describe("the markets an account may price against", () => {
  it("is nothing at all until something has read it", () => {
    expect(readMarketLocations()).toBeUndefined();
  });

  it("is what a sign-in carried, without asking again", () => {
    seedMarketLocations([azbel]);

    expect(readMarketLocations()).toEqual([azbel]);
    expect(fetchMarketLocations).not.toHaveBeenCalled();
  });

  it("holds nothing when a sign-in carried no answer", () => {
    seedMarketLocations(undefined);

    expect(readMarketLocations()).toBeUndefined();
  });

  it("holds an account that genuinely has none", () => {
    seedMarketLocations([]);

    expect(readMarketLocations()).toEqual([]);
  });

  it("is read again rather than merged into", async () => {
    seedMarketLocations([]);

    await refreshMarketLocations();

    expect(fetchMarketLocations).toHaveBeenCalledTimes(1);
    expect(readMarketLocations()).toEqual([azbel]);
  });
});

describe("holding the set for the session", () => {
  it("is not collected while nothing is watching it", () => {
    seedMarketLocations([azbel]);

    const [entry] = queryClient
      .getQueryCache()
      .findAll({ queryKey: MARKET_LOCATIONS_QUERY_KEY });

    expect(entry?.gcTime).toBe(Infinity);
  });
});

describe("reading the set again once a change has been written", () => {
  const rens = { id: "market-2", name: "Rens VI", stationID: 60004588 };

  it("reads nothing when no market has changed", async () => {
    seedMarketLocations([azbel]);

    await refreshMarketLocationsAfterWrite();

    expect(fetchMarketLocations).not.toHaveBeenCalled();
  });

  it("reads the set again once a market has changed", async () => {
    seedMarketLocations([azbel]);
    fetchMarketLocations.mockResolvedValue([azbel, rens]);

    marketLocationsChanged();
    await refreshMarketLocationsAfterWrite();

    expect(readMarketLocations()).toEqual([azbel, rens]);
  });

  it("reads once for a change recorded more than once", async () => {
    seedMarketLocations([azbel]);

    marketLocationsChanged();
    marketLocationsChanged();
    await refreshMarketLocationsAfterWrite();
    await refreshMarketLocationsAfterWrite();

    expect(fetchMarketLocations).toHaveBeenCalledTimes(1);
  });

  it("keeps the change recorded when the read fails", async () => {
    seedMarketLocations([azbel]);
    fetchMarketLocations.mockRejectedValueOnce(new Error("offline"));

    marketLocationsChanged();
    await refreshMarketLocationsAfterWrite();
    expect(readMarketLocations()).toEqual([azbel]);

    fetchMarketLocations.mockResolvedValue([azbel, rens]);
    await refreshMarketLocationsAfterWrite();

    expect(readMarketLocations()).toEqual([azbel, rens]);
  });
});

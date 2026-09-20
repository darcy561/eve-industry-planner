import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPrice = vi.fn();
const requestAdjustedPrice = vi.fn();
vi.mock("./priceLoader", () => ({
  requestPrice: (...args) => requestPrice(...args),
  requestAdjustedPrice: (...args) => requestAdjustedPrice(...args),
  setClockMovedListener: () => {},
}));

const readStoredPrice = vi.fn();
const writeStoredPrice = vi.fn();
vi.mock("./priceStore", () => ({
  readStoredPrice: (...args) => readStoredPrice(...args),
  writeStoredPrice: (...args) => writeStoredPrice(...args),
}));

// A market an account saved, which this server prices exactly as it prices a
// hub — the registry is what says so, and the tier follows from the kind.
vi.mock("./marketSources", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    allMarketSources: () => [
      ...real.allMarketSources(),
      {
        id: "saved-station",
        name: "A station the reader saved",
        regionID: 10000002,
        stationID: 60003760,
        kind: real.SOURCE_KIND.STATION,
      },
    ],
  };
});

const { queryClient } = await import("../../queryClient.js");
const { expireSavedSourceRows, fetchPrices, readPrice } = await import(
  "./priceCache.js"
);

const row = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
  refreshedAt: 1757000000000,
});

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  readStoredPrice.mockResolvedValue(undefined);
  requestPrice.mockResolvedValue(null);
});

// Rows are kept on a reader's device only where they cost that reader
// something to get. Every kind there is today is priced by this server and is
// one request away after a reload, so none of them touches the tier beneath.
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
    expect(writeStoredPrice).not.toHaveBeenCalled();
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
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(expireSavedSourceRows()).toBe(0);
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

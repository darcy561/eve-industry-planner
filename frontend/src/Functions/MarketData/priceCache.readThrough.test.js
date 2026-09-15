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

// The registry is what says which tier a source belongs to, so a saved station
// exists here the way Stage F will make one exist for a reader.
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
const { expireSavedSourceRows, fetchPrices, readPrice } =
  await import("./priceCache.js");

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

// The hubs are shared infrastructure and cheap to ask for again, so nothing of
// theirs is written to the reader's device.
describe("a hub", () => {
  it("is fetched without consulting the tier beneath", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    expect(readStoredPrice).not.toHaveBeenCalled();
    expect(writeStoredPrice).not.toHaveBeenCalled();
    expect(readPrice(34, "jita").sell).toBe(10);
  });
});

describe("a market the reader saved", () => {
  it("is served from disk without being fetched", async () => {
    readStoredPrice.mockResolvedValue(row(7));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(requestPrice).not.toHaveBeenCalled();
    expect(readPrice(34, "saved-station").sell).toBe(7);
  });

  it("falls through to the network when disk holds nothing", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(requestPrice).toHaveBeenCalledWith(34, "saved-station");
    expect(writeStoredPrice).toHaveBeenCalledWith(
      "saved-station",
      34,
      expect.objectContaining({ sell: 10 }),
    );
    expect(readPrice(34, "saved-station").sell).toBe(10);
  });

  // "This market holds no order for this type" is the cheapest fact to learn
  // again, and keeping it would hold a reader at no-price for as long as it
  // survived.
  it("keeps nothing when the market holds no order", async () => {
    requestPrice.mockResolvedValue(null);

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(writeStoredPrice).not.toHaveBeenCalled();
  });

  // A reader with no usable storage prices from the network every time rather
  // than seeing an error, which is the tier being optional by design.
  it("still prices when the tier beneath cannot answer", async () => {
    readStoredPrice.mockResolvedValue(undefined);
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "saved-station" }] });

    expect(readPrice(34, "saved-station").sell).toBe(10);
  });
});

// The accessor above must not be able to tell which tier answered. A row off
// disk really does carry one field a hub row never has — the expiry its book
// came with — so this checks that every field a reader is shown agrees, rather
// than comparing two fixtures that happen to have been written alike.
describe("whichever tier answered", () => {
  const READ_BY_SURFACES = ["buy", "sell", "buyP95", "sellP05", "refreshedAt"];

  it("answers every field a surface reads", async () => {
    readStoredPrice.mockResolvedValue({ ...row(10), expiresAt: 9e12 });
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "saved-station" },
        { typeID: 34, sourceID: "jita" },
      ],
    });

    const fromDisk = readPrice(34, "saved-station");
    const fromNetwork = readPrice(34, "jita");

    for (const field of READ_BY_SURFACES) {
      expect(fromDisk[field]).toBe(fromNetwork[field]);
    }
  });

  // The expiry is the store's own bookkeeping — it decides whether a row may be
  // served after a reload — and no surface reads it. It rides along on a row
  // that has one rather than being stripped, because stripping it here would
  // mean writing it back separately when the row is stored.
  it("carries the expiry only where the source states one", async () => {
    readStoredPrice.mockResolvedValue({ ...row(10), expiresAt: 9e12 });
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "saved-station" },
        { typeID: 34, sourceID: "jita" },
      ],
    });

    expect(readPrice(34, "saved-station").expiresAt).toBe(9e12);
    expect(readPrice(34, "jita").expiresAt).toBeUndefined();
  });
});

// A hub is asked where its book has got to, because only the server knows. A
// saved market already said, on the rows it produced — so retiring those costs
// nothing and asks nobody.
describe("retiring what a reader-saved market has finished with", () => {
  const priced = async (expiresAt) => {
    readStoredPrice.mockResolvedValue(undefined);
    requestPrice.mockImplementation(async (_typeID, sourceID) =>
      sourceID === "saved-station" ? { ...row(10), expiresAt } : row(10),
    );

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "saved-station" },
        { typeID: 34, sourceID: "jita" },
      ],
    });
  };

  it("drops a row whose book has expired", async () => {
    await priced(1000);

    expect(expireSavedSourceRows(1001)).toBe(1);
    expect(readPrice(34, "saved-station")).toBeUndefined();
  });

  it("keeps one whose book has not", async () => {
    await priced(1000);

    expect(expireSavedSourceRows(999)).toBe(0);
    expect(readPrice(34, "saved-station")).toBeDefined();
  });

  // A hub's rows are not this rule's to touch: they go when their market's clock
  // moves, which is the server's statement and not an expiry the browser holds.
  it("leaves a hub's rows alone", async () => {
    await priced(1000);

    expireSavedSourceRows(9e12);

    expect(readPrice(34, "jita")).toBeDefined();
  });

  it("drops nothing, and says so, when nothing has expired", async () => {
    await priced(undefined);

    expect(expireSavedSourceRows(9e12)).toBe(0);
    expect(readPrice(34, "saved-station")).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestPrice = vi.fn();
const requestAdjustedPrice = vi.fn();
vi.mock("./priceLoader", () => ({
  requestPrice: (...args) => requestPrice(...args),
  requestAdjustedPrice: (...args) => requestAdjustedPrice(...args),
}));

const { queryClient } = await import("../../queryClient.js");
const { fetchPrices, readPrice, readAdjustedPrice } =
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
  requestPrice.mockReset();
  requestAdjustedPrice.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("reading a price", () => {
  // The synchronous readers are the reason this is a read rather than a hook: a
  // shopping list row and a basis comparison each read inside a reduce.
  it("answers nothing before anything has been asked for", () => {
    expect(readPrice(34, "jita")).toBeUndefined();
    expect(readAdjustedPrice(34)).toBeUndefined();
  });

  it("answers from the cache once a want has settled", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    expect(readPrice(34, "jita").sell).toBe(10);
  });

  // One entry per type at one market: the same type at two markets is two
  // answers, and a market is never read out of another's row.
  it("keeps the same type at two markets apart", async () => {
    requestPrice.mockImplementation((typeID, sourceID) =>
      Promise.resolve(row(sourceID === "jita" ? 10 : 30)),
    );

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "jita" },
        { typeID: 34, sourceID: "amarr" },
      ],
    });

    expect(readPrice(34, "jita").sell).toBe(10);
    expect(readPrice(34, "amarr").sell).toBe(30);
  });

  it("reads a number back for an adjusted price", async () => {
    requestAdjustedPrice.mockResolvedValue(4.9);

    await fetchPrices({
      wants: [{ typeID: 34, sourceID: "jita" }],
      adjustedTypeIDs: [34],
    });

    expect(readAdjustedPrice(34)).toBe(4.9);
  });
});

describe("asking for prices", () => {
  it("asks for each type at each market it was given", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "jita" },
        { typeID: 35, sourceID: "jita" },
        { typeID: 34, sourceID: "amarr" },
        { typeID: 35, sourceID: "amarr" },
      ],
    });

    expect(requestPrice).toHaveBeenCalledTimes(4);
  });

  it("does not ask for an adjusted price unless told to", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    expect(requestAdjustedPrice).not.toHaveBeenCalled();
  });

  // The cache is what stops a second panel re-asking for what the first resolved.
  it("does not ask again for a want it already holds", async () => {
    requestPrice.mockResolvedValue(row(10));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });
    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing when it has no type or no market", async () => {
    await fetchPrices({ wants: [] });
    await fetchPrices({ wants: [{ typeID: 34, sourceID: "" }] });

    expect(requestPrice).not.toHaveBeenCalled();
  });
});

describe("when a market cannot be reached", () => {
  // A market that could not be reached leaves its own entry unwritten. It must
  // not be recorded as "no orders here", and it must not stop the markets that
  // answered from reaching the reader.
  it("leaves that market unread and still answers for the others", async () => {
    requestPrice.mockImplementation((typeID, sourceID) =>
      sourceID === "amarr"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(row(10)),
    );

    await fetchPrices({
      wants: [
        { typeID: 34, sourceID: "jita" },
        { typeID: 34, sourceID: "amarr" },
      ],
    });

    expect(readPrice(34, "jita").sell).toBe(10);
    expect(readPrice(34, "amarr")).toBeUndefined();
  });

  it("does not resolve as a settled answer", async () => {
    requestPrice.mockRejectedValue(new Error("offline"));

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    // Undefined rather than null: nothing was learned, so the next reader asks
    // again rather than being told there is no price.
    expect(readPrice(34, "jita")).toBeUndefined();
  });
});

describe("a market that answered and holds no order", () => {
  // Distinct from a failure: this is an answer, so it is kept and not re-asked.
  it("is remembered rather than asked about again", async () => {
    requestPrice.mockResolvedValue(null);

    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });
    await fetchPrices({ wants: [{ typeID: 34, sourceID: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
    expect(readPrice(34, "jita")).toBeUndefined();
  });
});

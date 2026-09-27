import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestPrice = vi.fn();
const requestAdjustedPrice = vi.fn();

let marketRefreshedListener = null;

vi.mock("./priceLoader", () => ({
  requestPrice: (...args) => requestPrice(...args),
  requestAdjustedPrice: (...args) => requestAdjustedPrice(...args),
  setMarketRefreshedListener: (listener) => {
    marketRefreshedListener = listener;
  },
  setOrdersStoredListener: () => {},
}));

const { queryClient } = await import("../../../queryClient.js");
const {
  fetchPrices,
  priceQueryKey,
  readPrice,
  readAdjustedPrice,
  revalidateMarketRefreshTimes,
} = await import("./priceCache.js");

const typePrice = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
  refreshedAt: 1757000000000,
});

const refreshJita = () =>
  marketRefreshedListener({
    markets: [{ marketLocation: "jita", refreshedAt: 1757003600000 }],
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
  it("answers nothing before anything has been asked for", () => {
    expect(readPrice(34, "jita")).toBeUndefined();
    expect(readAdjustedPrice(34)).toBeUndefined();
  });

  it("answers from the cache once a want has settled", async () => {
    requestPrice.mockResolvedValue(typePrice(10));

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(readPrice(34, "jita").sell).toBe(10);
  });

  it("keeps the same type at two markets apart", async () => {
    requestPrice.mockImplementation((typeID, marketLocation) =>
      Promise.resolve(typePrice(marketLocation === "jita" ? 10 : 30)),
    );

    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
      ],
    });

    expect(readPrice(34, "jita").sell).toBe(10);
    expect(readPrice(34, "amarr").sell).toBe(30);
  });

  it("reads a number back for an adjusted price", async () => {
    requestAdjustedPrice.mockResolvedValue(4.9);

    await fetchPrices({
      wants: [{ typeID: 34, marketLocation: "jita" }],
      adjustedTypeIDs: [34],
    });

    expect(readAdjustedPrice(34)).toBe(4.9);
  });
});

describe("asking for prices", () => {
  it("asks for each type at each market it was given", async () => {
    requestPrice.mockResolvedValue(typePrice(10));

    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 35, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
        { typeID: 35, marketLocation: "amarr" },
      ],
    });

    expect(requestPrice).toHaveBeenCalledTimes(4);
  });

  it("does not ask for an adjusted price unless told to", async () => {
    requestPrice.mockResolvedValue(typePrice(10));

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestAdjustedPrice).not.toHaveBeenCalled();
  });

  it("does not ask again for a want it already holds", async () => {
    requestPrice.mockResolvedValue(typePrice(10));

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing when it has no type or no market", async () => {
    await fetchPrices({ wants: [] });
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "" }] });

    expect(requestPrice).not.toHaveBeenCalled();
  });
});

describe("when a market cannot be reached", () => {
  it("leaves that market unread and still answers for the others", async () => {
    requestPrice.mockImplementation((typeID, marketLocation) =>
      marketLocation === "amarr"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(typePrice(10)),
    );

    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
      ],
    });

    expect(readPrice(34, "jita").sell).toBe(10);
    expect(readPrice(34, "amarr")).toBeUndefined();
  });

  it("does not resolve as a settled answer", async () => {
    requestPrice.mockRejectedValue(new Error("offline"));

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(readPrice(34, "jita")).toBeUndefined();
  });
});

describe("a market that answered and holds no order", () => {
  it("is remembered rather than asked about again", async () => {
    requestPrice.mockResolvedValue(null);

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
    expect(readPrice(34, "jita")).toBeUndefined();
  });
});

describe("freshness comes from the market's refresh time", () => {
  it("does not ask again for a price it already holds", async () => {
    requestPrice.mockResolvedValue(typePrice(10));

    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
  });

  it("asks again once its market says it was walked again", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    requestPrice.mockResolvedValue(typePrice(30));
    refreshJita();
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(2);
    expect(readPrice(34, "jita").sell).toBe(30);
  });

  it("hands back a price that was invalidated rather than asking again", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    requestPrice.mockClear();
    queryClient.invalidateQueries({ queryKey: priceQueryKey(34, "jita") });
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).not.toHaveBeenCalled();
    expect(readPrice(34, "jita").sell).toBe(10);
  });

  it("drops every price a refreshed market answered, not just the one probed", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 35, marketLocation: "jita" },
      ],
    });

    requestPrice.mockClear();
    requestPrice.mockResolvedValue(typePrice(30));
    refreshJita();
    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 35, marketLocation: "jita" },
      ],
    });

    expect(requestPrice).toHaveBeenCalledTimes(2);
  });

  it("leaves a market whose refresh time did not move alone", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
      ],
    });

    requestPrice.mockClear();
    refreshJita();
    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
      ],
    });

    expect(requestPrice).toHaveBeenCalledTimes(1);
    expect(requestPrice).toHaveBeenCalledWith(34, "jita");
  });

  it("drops a price that settled as nothing once the market has been walked", async () => {
    requestPrice.mockResolvedValue(null);
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    requestPrice.mockClear();
    requestPrice.mockResolvedValue(typePrice(10));
    refreshJita();
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    expect(requestPrice).toHaveBeenCalledTimes(1);
    expect(readPrice(34, "jita").sell).toBe(10);
  });

  it("leaves a price still being fetched alone", async () => {
    let answer;
    requestPrice.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const asking = fetchPrices({
      wants: [{ typeID: 34, marketLocation: "jita" }],
    });
    refreshJita();
    answer(typePrice(10));

    expect(await asking).toEqual({ asked: 1, failed: 0 });
    expect(readPrice(34, "jita").sell).toBe(10);
  });

  it("is not dragged backwards by an adjusted answer that settled late", async () => {
    requestAdjustedPrice.mockResolvedValue(5);
    marketRefreshedListener({ markets: [], adjustedRefreshedAt: 2 });
    marketRefreshedListener({ markets: [], adjustedRefreshedAt: 1 });
    await fetchPrices({ wants: [], adjustedTypeIDs: [34] });

    requestAdjustedPrice.mockClear();
    marketRefreshedListener({ markets: [], adjustedRefreshedAt: 2 });
    await fetchPrices({ wants: [], adjustedTypeIDs: [34] });

    expect(requestAdjustedPrice).not.toHaveBeenCalled();
  });

  it("drops adjusted prices on their own refresh time", async () => {
    requestAdjustedPrice.mockResolvedValue(5);
    await fetchPrices({ wants: [], adjustedTypeIDs: [34] });

    requestAdjustedPrice.mockClear();
    requestAdjustedPrice.mockResolvedValue(7);
    marketRefreshedListener({ markets: [], adjustedRefreshedAt: 1 });
    marketRefreshedListener({ markets: [], adjustedRefreshedAt: 2 });
    await fetchPrices({ wants: [], adjustedTypeIDs: [34] });

    expect(requestAdjustedPrice).toHaveBeenCalledTimes(1);
    expect(readAdjustedPrice(34)).toBe(7);
  });
});

describe("asking the markets whether they have refreshed", () => {
  it("asks nothing where no market holds prices", async () => {
    await revalidateMarketRefreshTimes();

    expect(requestPrice).not.toHaveBeenCalled();
  });

  it("asks each market holding prices for one type it already holds", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({
      wants: [
        { typeID: 34, marketLocation: "jita" },
        { typeID: 35, marketLocation: "jita" },
        { typeID: 34, marketLocation: "amarr" },
      ],
    });
    requestPrice.mockClear();
    await revalidateMarketRefreshTimes();

    expect(requestPrice).toHaveBeenCalledTimes(2);
    const asked = requestPrice.mock.calls.map(
      ([, marketLocation]) => marketLocation,
    );
    expect(asked.sort()).toEqual(["amarr", "jita"]);
  });

  it("asks a market that has prices but has never reported a refresh time", async () => {
    requestPrice.mockResolvedValue(null);
    await fetchPrices({
      wants: [{ typeID: 34, marketLocation: "a-new-market" }],
    });

    requestPrice.mockClear();
    await revalidateMarketRefreshTimes();

    expect(requestPrice).toHaveBeenCalledWith("34", "a-new-market");
  });

  it("does not mistake the adjusted prices for a market", async () => {
    requestAdjustedPrice.mockResolvedValue(5);
    await fetchPrices({ wants: [], adjustedTypeIDs: [34] });

    requestPrice.mockClear();
    await revalidateMarketRefreshTimes();

    expect(requestPrice).not.toHaveBeenCalled();
  });

  it("survives a market that could not be reached", async () => {
    requestPrice.mockResolvedValue(typePrice(10));
    await fetchPrices({ wants: [{ typeID: 34, marketLocation: "jita" }] });

    requestPrice.mockRejectedValue(new Error("offline"));

    await expect(revalidateMarketRefreshTimes()).resolves.toBeUndefined();
    expect(readPrice(34, "jita").sell).toBe(10);
  });
});

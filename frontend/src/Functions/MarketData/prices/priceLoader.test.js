import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const {
  requestPrice,
  requestAdjustedPrice,
  resetPriceLoader,
  setMarketRefreshedListener,
} = await import("./priceLoader.js");

const typePrice = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
});

const answer = (sources, adjusted = null) => ({ sources, adjusted });

const byMarket = (a, b) => a.marketLocation.localeCompare(b.marketLocation);

const byPair = (a, b) =>
  `${a.marketLocation}|${a.typeID}`.localeCompare(
    `${b.marketLocation}|${b.typeID}`,
  );

afterEach(() => {
  resetPriceLoader();
  setMarketRefreshedListener(null);
  fetchMarketPricesQuery.mockReset();
});

describe("a tick's worth of wants", () => {
  it("becomes one request carrying exactly the pairs it saw", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: {
          refreshedAt: 1,
          prices: { 34: typePrice(10), 35: typePrice(20) },
        },
        amarr: { refreshedAt: 2, prices: { 34: typePrice(30) } },
      }),
    );

    const [jita34, jita35, amarr34] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(35, "jita"),
      requestPrice(34, "amarr"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    const asked = fetchMarketPricesQuery.mock.calls[0][0];
    expect([...asked.wants].sort(byPair)).toEqual([
      { typeID: "34", marketLocation: "amarr" },
      { typeID: "34", marketLocation: "jita" },
      { typeID: "35", marketLocation: "jita" },
    ]);

    expect(jita34.sell).toBe(10);
    expect(jita35.sell).toBe(20);
    expect(amarr34.sell).toBe(30);
  });

  it("asks once for a want two callers raised", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: { 34: typePrice(10) } } }),
    );

    const [first, second] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "jita"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(first.sell).toBe(10);
    expect(second.sell).toBe(10);
  });

  it("keeps the same type at two markets apart", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: { refreshedAt: 1, prices: { 34: typePrice(10) } },
        amarr: { refreshedAt: 1, prices: { 34: typePrice(30) } },
      }),
    );

    const [jita, amarr] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "amarr"),
    ]);

    expect(jita.sell).toBe(10);
    expect(amarr.sell).toBe(30);
  });

  it("starts a new batch after the first has flushed", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: { 34: typePrice(10) } } }),
    );

    await requestPrice(34, "jita");
    await requestPrice(35, "jita");

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(2);
  });
});

describe("what a want settles on", () => {
  it("settles as nothing where the market holds no order", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: {} } }),
    );

    expect(await requestPrice(34, "jita")).toBeNull();
  });

  it("settles as nothing where the answer omits the market entirely", async () => {
    fetchMarketPricesQuery.mockResolvedValue(answer({}));

    expect(await requestPrice(34, "jita")).toBeNull();
  });

  it("carries the market's refresh time onto every price", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: { refreshedAt: 1757000000000, prices: { 34: typePrice(10) } },
      }),
    );

    expect((await requestPrice(34, "jita")).refreshedAt).toBe(1757000000000);
  });

  it("hands a failure to every waiter", async () => {
    fetchMarketPricesQuery.mockRejectedValue(new Error("offline"));

    await expect(requestPrice(34, "jita")).rejects.toThrow("offline");
  });
});

describe("adjusted prices", () => {
  it("ride the same batch and are asked for only when wanted", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer(
        { jita: { refreshedAt: 1, prices: { 34: typePrice(10) } } },
        { refreshedAt: 2, prices: { 34: 4.9 } },
      ),
    );

    const [price, adjusted] = await Promise.all([
      requestPrice(34, "jita"),
      requestAdjustedPrice(34),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(fetchMarketPricesQuery.mock.calls[0][0].adjustedTypeIDs).toEqual([
      "34",
    ]);
    expect(price.sell).toBe(10);
    expect(adjusted).toBe(4.9);
  });

  it("is not asked for when nothing wanted one", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: { 34: typePrice(10) } } }),
    );

    await requestPrice(34, "jita");

    expect(fetchMarketPricesQuery.mock.calls[0][0].adjustedTypeIDs).toEqual([]);
  });

  it("names no market when only an adjusted price was wanted", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({}, { refreshedAt: 2, prices: { 34: 4.9 } }),
    );

    expect(await requestAdjustedPrice(34)).toBe(4.9);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([]);
  });
});

describe("the refresh time every answer carries", () => {
  it("is announced for every market the answer named", async () => {
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: { refreshedAt: 1757000000000, prices: { 34: typePrice(10) } },
        amarr: { refreshedAt: 1757003600000, prices: { 34: typePrice(30) } },
      }),
    );

    await Promise.all([requestPrice(34, "jita"), requestPrice(34, "amarr")]);

    expect(refreshed).toHaveBeenCalledTimes(1);
    const { markets } = refreshed.mock.calls[0][0];
    expect([...markets].sort((a, b) => byMarket(a, b))).toEqual([
      { marketLocation: "amarr", refreshedAt: 1757003600000 },
      { marketLocation: "jita", refreshedAt: 1757000000000 },
    ]);
  });

  it("announces the adjusted block's refresh time apart from any market", async () => {
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);
    fetchMarketPricesQuery.mockResolvedValue(
      answer({}, { refreshedAt: 1757086400000, prices: { 34: 4.9 } }),
    );

    await requestAdjustedPrice(34);

    expect(refreshed).toHaveBeenCalledWith({
      markets: [],
      adjustedRefreshedAt: 1757086400000,
    });
  });

  it("announces per market asked for, not per block answered", async () => {
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: { refreshedAt: 42, prices: { 34: typePrice(10) } },
      }),
    );

    await Promise.all([requestPrice(34, "jita"), requestPrice(35, "jita")]);

    expect(refreshed.mock.calls[0][0].markets).toEqual([
      { marketLocation: "jita", refreshedAt: 42 },
    ]);
  });

  it("announces nothing from a request that failed", async () => {
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);
    fetchMarketPricesQuery.mockRejectedValue(new Error("offline"));

    await expect(requestPrice(34, "jita")).rejects.toThrow("offline");
    expect(refreshed).not.toHaveBeenCalled();
  });
});

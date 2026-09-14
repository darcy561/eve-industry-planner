import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const { requestPrice, requestAdjustedPrice, resetPriceLoader } =
  await import("./priceLoader.js");

const row = (sell) => ({ buy: sell - 1, sell, buyP95: sell, sellP05: sell });

const answer = (sources, adjusted = null) => ({ sources, adjusted });

const byPair = (a, b) =>
  `${a.sourceID}|${a.typeID}`.localeCompare(`${b.sourceID}|${b.typeID}`);

afterEach(() => {
  resetPriceLoader();
  fetchMarketPricesQuery.mockReset();
});

describe("a tick's worth of wants", () => {
  // The whole reason the loader exists: an entry per type and source, but not a
  // request per entry.
  it("becomes one request carrying exactly the pairs it saw", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({
        jita: { refreshedAt: 1, prices: { 34: row(10), 35: row(20) } },
        amarr: { refreshedAt: 2, prices: { 34: row(30) } },
      }),
    );

    const [jita34, jita35, amarr34] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(35, "jita"),
      requestPrice(34, "amarr"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    const asked = fetchMarketPricesQuery.mock.calls[0][0];
    // Three pairs, not four: nothing wanted 35 at Amarr, so nothing asks for it.
    expect([...asked.wants].sort(byPair)).toEqual([
      { typeID: "34", sourceID: "amarr" },
      { typeID: "34", sourceID: "jita" },
      { typeID: "35", sourceID: "jita" },
    ]);

    expect(jita34.sell).toBe(10);
    expect(jita35.sell).toBe(20);
    expect(amarr34.sell).toBe(30);
  });

  it("asks once for a want two callers raised", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: { 34: row(10) } } }),
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
        jita: { refreshedAt: 1, prices: { 34: row(10) } },
        amarr: { refreshedAt: 1, prices: { 34: row(30) } },
      }),
    );

    const [jita, amarr] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "amarr"),
    ]);

    expect(jita.sell).toBe(10);
    expect(amarr.sell).toBe(30);
  });

  // A later tick is a new batch, or a panel opened after the first would wait
  // forever on a flush that already happened.
  it("starts a new batch after the first has flushed", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1, prices: { 34: row(10) } } }),
    );

    await requestPrice(34, "jita");
    await requestPrice(35, "jita");

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(2);
  });
});

describe("what a want settles on", () => {
  // A market holding no order for a type is an answer rather than a failure;
  // throwing would have the cache retry it forever.
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

  // The clock belongs to the market, and every row from it shares it.
  it("carries the market's clock onto each row", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({ jita: { refreshedAt: 1757000000000, prices: { 34: row(10) } } }),
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
        { jita: { refreshedAt: 1, prices: { 34: row(10) } } },
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
      answer({ jita: { refreshedAt: 1, prices: { 34: row(10) } } }),
    );

    await requestPrice(34, "jita");

    expect(fetchMarketPricesQuery.mock.calls[0][0].adjustedTypeIDs).toEqual([]);
  });

  // They belong to no market, so a tick wanting only an adjusted price names
  // none — it used to have to name an arbitrary one to be answered at all.
  it("names no market when only an adjusted price was wanted", async () => {
    fetchMarketPricesQuery.mockResolvedValue(
      answer({}, { refreshedAt: 2, prices: { 34: 4.9 } }),
    );

    expect(await requestAdjustedPrice(34)).toBe(4.9);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([]);
  });
});

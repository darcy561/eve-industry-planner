import { afterEach, describe, expect, it, vi } from "vitest";

const fetchWithPublicHeaders = vi.fn();
vi.mock("./applyPublicHeaders.js", () => ({
  fetchWithPublicHeaders: (...args) => fetchWithPublicHeaders(...args),
}));

const { fetchMarketPricesQuery } = await import("./marketPricesQuery.js");

const ok = (body) => ({ ok: true, json: async () => body });
const want = (typeID, sourceID) => ({ typeID, sourceID });

afterEach(() => {
  fetchWithPublicHeaders.mockReset();
});

const bodyOf = (call) => JSON.parse(call[1].body);

describe("asking for prices", () => {
  it("names each market with the types wanted at it", async () => {
    fetchWithPublicHeaders.mockResolvedValue(
      ok({
        sources: { jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } } },
      }),
    );

    const result = await fetchMarketPricesQuery({ wants: [want(34, "jita")] });

    expect(bodyOf(fetchWithPublicHeaders.mock.calls[0])).toEqual({
      sources: { jita: ["34"] },
      adjustedTypeIDs: [],
    });
    expect(result.sources.jita.prices["34"].sell).toBe(5);
  });

  // The whole point of the pair: a caller wanting two types at two markets is
  // not asking for four prices. One flat type list applied to every market
  // would fetch the two nobody reads.
  it("does not ask any market for a type wanted at another", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok({ sources: {} }));

    await fetchMarketPricesQuery({
      wants: [want(34, "jita"), want(35, "amarr")],
    });

    expect(bodyOf(fetchWithPublicHeaders.mock.calls[0]).sources).toEqual({
      jita: ["34"],
      amarr: ["35"],
    });
  });

  it("asks for a type at both markets when both are wanted", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok({ sources: {} }));

    await fetchMarketPricesQuery({
      wants: [want(34, "jita"), want(34, "amarr")],
    });

    expect(bodyOf(fetchWithPublicHeaders.mock.calls[0]).sources).toEqual({
      jita: ["34"],
      amarr: ["34"],
    });
  });

  // Adjusted prices belong to no market, so they travel in their own list and a
  // caller wanting only those still has a request to make.
  it("asks for adjusted prices without naming a market", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok({ sources: {} }));

    await fetchMarketPricesQuery({ wants: [], adjustedTypeIDs: [34] });

    expect(bodyOf(fetchWithPublicHeaders.mock.calls[0])).toEqual({
      sources: {},
      adjustedTypeIDs: ["34"],
    });
  });

  it("asks for nothing when nothing is wanted", async () => {
    await fetchMarketPricesQuery({ wants: [] });
    await fetchMarketPricesQuery({ wants: [want(34, "")] });

    expect(fetchWithPublicHeaders).not.toHaveBeenCalled();
  });

  it("asks about a repeated pair once", async () => {
    fetchWithPublicHeaders.mockResolvedValue(ok({ sources: {} }));

    await fetchMarketPricesQuery({
      wants: [want(34, "jita"), want(34, "jita"), want(35, "jita")],
    });

    expect(bodyOf(fetchWithPublicHeaders.mock.calls[0]).sources.jita).toEqual([
      "34",
      "35",
    ]);
  });
});

describe("more prices than one request may carry", () => {
  const manyWants = Array.from({ length: 750 }, (_, i) => want(i + 1, "jita"));

  const answerWith = () =>
    fetchWithPublicHeaders.mockImplementation(async (_url, options) => {
      const { sources, adjustedTypeIDs } = JSON.parse(options.body);
      return ok({
        sources: Object.fromEntries(
          Object.entries(sources).map(([id, typeIDs]) => [
            id,
            {
              refreshedAt: 1757000000000,
              prices: Object.fromEntries(
                typeIDs.map((typeID) => [typeID, { sell: 5 }]),
              ),
            },
          ]),
        ),
        adjusted: adjustedTypeIDs.length
          ? {
              refreshedAt: 1756900000000,
              prices: Object.fromEntries(
                adjustedTypeIDs.map((typeID) => [typeID, 4.9]),
              ),
            }
          : undefined,
      });
    });

  // The rows nest under each source, so folding two answers with one shallow
  // merge would replace the first chunk's source block whole and take every
  // price in it with it.
  it("keeps the rows from every chunk", async () => {
    answerWith();

    const result = await fetchMarketPricesQuery({ wants: manyWants });

    expect(fetchWithPublicHeaders).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.sources.jita.prices)).toHaveLength(750);
    expect(result.sources.jita.prices["1"]).toBeDefined();
    expect(result.sources.jita.prices["750"]).toBeDefined();
    expect(result.sources.jita.refreshedAt).toBe(1757000000000);
  });

  it("keeps the adjusted prices from every chunk", async () => {
    answerWith();

    const result = await fetchMarketPricesQuery({
      wants: [],
      adjustedTypeIDs: manyWants.map(({ typeID }) => typeID),
    });

    expect(Object.keys(result.adjusted.prices)).toHaveLength(750);
  });

  // The cap counts reads, not types: the same type at two markets is two of
  // them, so a split that counted types would send a request the server refuses.
  it("counts one type at two markets as two of the request's places", async () => {
    answerWith();

    await fetchMarketPricesQuery({
      wants: [
        ...manyWants.slice(0, 300),
        ...manyWants.slice(0, 300).map(({ typeID }) => want(typeID, "amarr")),
      ],
    });

    for (const call of fetchWithPublicHeaders.mock.calls) {
      const { sources } = bodyOf(call);
      const asked = Object.values(sources).reduce(
        (total, ids) => total + ids.length,
        0,
      );
      expect(asked).toBeLessThanOrEqual(500);
    }
  });
});

describe("when the request cannot be answered", () => {
  // A market that answered and held no order, and a market that could not be
  // reached, are different facts. Settling the second as the first would have
  // the cache above tell a reader there is no price until the entry goes stale.
  it("throws on a refusal rather than answering empty", async () => {
    fetchWithPublicHeaders.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      fetchMarketPricesQuery({ wants: [want(34, "jita")] }),
    ).rejects.toThrow(/503/);
  });

  it("lets a network failure through", async () => {
    fetchWithPublicHeaders.mockRejectedValue(new Error("offline"));

    await expect(
      fetchMarketPricesQuery({ wants: [want(34, "jita")] }),
    ).rejects.toThrow("offline");
  });
});

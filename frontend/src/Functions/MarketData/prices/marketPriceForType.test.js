import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { queryClient } = await import("../../../queryClient.js");
const { priceQueryKey, adjustedQueryKey } = await import("./priceCache.js");
const {
  readMarketPriceForType,
  readAdjustedPriceForType,
  readPriceRefreshedAt,
} = await import("./marketPriceForType.js");

const typePrice = (sell, refreshedAt = 1757000000000) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
  refreshedAt,
});

function hold(typeID, marketLocation, value) {
  queryClient.setQueryData(priceQueryKey(typeID, marketLocation), value);
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  queryClient.clear();
});

describe("reading a price", () => {
  it("answers the order type asked for", () => {
    hold(34, "jita", { buy: 9, sell: 10, buyP95: 8, sellP05: 11 });

    expect(readMarketPriceForType(34, "jita", "buy")).toBe(9);
    expect(readMarketPriceForType(34, "jita", "sell")).toBe(10);
    expect(readMarketPriceForType(34, "jita", "buyP95")).toBe(8);
    expect(readMarketPriceForType(34, "jita", "sellP05")).toBe(11);
  });

  it("answers zero where nothing is held", () => {
    expect(readMarketPriceForType(34, "jita", "sell")).toBe(0);
  });

  it("answers zero for an order type the prices do not carry", () => {
    hold(34, "jita", { buy: 9, sell: 10 });

    expect(readMarketPriceForType(34, "jita", "buyP95")).toBe(0);
  });

  it("keeps one market's figures out of another's", () => {
    hold(34, "jita", typePrice(10));
    hold(34, "amarr", typePrice(30));

    expect(readMarketPriceForType(34, "jita", "sell")).toBe(10);
    expect(readMarketPriceForType(34, "amarr", "sell")).toBe(30);
  });

  it("answers zero for a market holding no order", () => {
    hold(34, "jita", null);

    expect(readMarketPriceForType(34, "jita", "sell")).toBe(0);
  });
});

describe("reading an adjusted price", () => {
  it("answers what is held", () => {
    queryClient.setQueryData(adjustedQueryKey(34), 4.9);

    expect(readAdjustedPriceForType(34)).toBe(4.9);
  });

  it("answers zero where nothing is held", () => {
    expect(readAdjustedPriceForType(34)).toBe(0);
  });

  it("is the same answer whatever market is being read", () => {
    queryClient.setQueryData(adjustedQueryKey(34), 4.9);
    hold(34, "jita", typePrice(10));

    expect(readAdjustedPriceForType(34)).toBe(4.9);
  });
});

describe("reading when a price was refreshed", () => {
  it("answers the moment the prices carry", () => {
    hold(34, "jita", typePrice(10, 1757003600000));

    expect(readPriceRefreshedAt(34, "jita")).toBe(1757003600000);
  });

  it("answers undefined where nothing is held", () => {
    expect(readPriceRefreshedAt(34, "jita")).toBeUndefined();
  });

  it("answers undefined when asked without a market", () => {
    hold(34, "jita", typePrice(10));

    expect(readPriceRefreshedAt(34, undefined)).toBeUndefined();
  });

  it.each([[0], [-1], [NaN], [undefined], [null]])(
    "treats %s as nothing held rather than a moment",
    (value) => {
      hold(34, "jita", { ...typePrice(10), refreshedAt: value });

      expect(readPriceRefreshedAt(34, "jita")).toBeUndefined();
    },
  );
});

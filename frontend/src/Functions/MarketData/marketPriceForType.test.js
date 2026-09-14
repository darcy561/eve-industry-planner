import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { queryClient } = await import("../../queryClient.js");
const { priceQueryKey, adjustedQueryKey } = await import("./priceCache.js");
const { getMarketPriceForType, getAdjustedPriceForType, getPriceRefreshedAt } =
  await import("./marketPriceForType.js");

const row = (sell, refreshedAt = 1757000000000) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
  refreshedAt,
});

/** Puts a row where the accessor reads from, without going through a fetch. */
function hold(typeID, sourceID, value) {
  queryClient.setQueryData(priceQueryKey(typeID, sourceID), value);
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  queryClient.clear();
});

describe("reading a price", () => {
  it("answers the basis asked for", () => {
    hold(34, "jita", { buy: 9, sell: 10, buyP95: 8, sellP05: 11 });

    expect(getMarketPriceForType(34, "jita", "buy")).toBe(9);
    expect(getMarketPriceForType(34, "jita", "sell")).toBe(10);
    expect(getMarketPriceForType(34, "jita", "buyP95")).toBe(8);
    expect(getMarketPriceForType(34, "jita", "sellP05")).toBe(11);
  });

  // Every caller multiplies by this, so absence has to be a number rather than
  // undefined, which would spread NaN through a total.
  it("answers zero where nothing is held", () => {
    expect(getMarketPriceForType(34, "jita", "sell")).toBe(0);
  });

  it("answers zero for a basis the row does not carry", () => {
    hold(34, "jita", { buy: 9, sell: 10 });

    expect(getMarketPriceForType(34, "jita", "buyP95")).toBe(0);
  });

  it("keeps one market's figures out of another's", () => {
    hold(34, "jita", row(10));
    hold(34, "amarr", row(30));

    expect(getMarketPriceForType(34, "jita", "sell")).toBe(10);
    expect(getMarketPriceForType(34, "amarr", "sell")).toBe(30);
  });

  // A market that answered and holds no order is a real answer of nothing.
  it("answers zero for a market holding no order", () => {
    hold(34, "jita", null);

    expect(getMarketPriceForType(34, "jita", "sell")).toBe(0);
  });
});

describe("reading an adjusted price", () => {
  it("answers what is held", () => {
    queryClient.setQueryData(adjustedQueryKey(34), 4.9);

    expect(getAdjustedPriceForType(34)).toBe(4.9);
  });

  // Zero rather than undefined for the same reason as a price: the one caller
  // multiplies by it when estimating an installation cost.
  it("answers zero where nothing is held", () => {
    expect(getAdjustedPriceForType(34)).toBe(0);
  });

  // Adjusted prices belong to no market, so a market id must not reach them.
  it("is the same answer whatever market is being read", () => {
    queryClient.setQueryData(adjustedQueryKey(34), 4.9);
    hold(34, "jita", row(10));

    expect(getAdjustedPriceForType(34)).toBe(4.9);
  });
});

describe("reading when a price was refreshed", () => {
  it("answers the moment the row carries", () => {
    hold(34, "jita", row(10, 1757003600000));

    expect(getPriceRefreshedAt(34, "jita")).toBe(1757003600000);
  });

  // Undefined rather than zero, because a caller showing an age must be able to
  // show none at all.
  it("answers undefined where nothing is held", () => {
    expect(getPriceRefreshedAt(34, "jita")).toBeUndefined();
  });

  it("answers undefined when asked without a market", () => {
    hold(34, "jita", row(10));

    expect(getPriceRefreshedAt(34, undefined)).toBeUndefined();
  });

  // The defect this guard exists for: a zero-filled row made an unpriced type
  // report the epoch, and a job with one unpriced material told the reader its
  // figures were decades old.
  it.each([[0], [-1], [NaN], [undefined], [null]])(
    "treats %s as nothing held rather than a moment",
    (value) => {
      hold(34, "jita", { ...row(10), refreshedAt: value });

      expect(getPriceRefreshedAt(34, "jita")).toBeUndefined();
    },
  );
});

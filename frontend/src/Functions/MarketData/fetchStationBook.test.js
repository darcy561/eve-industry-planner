import { beforeEach, describe, expect, it, vi } from "vitest";

const getMarketData = vi.fn();
vi.mock("../EveESI/World/getMarketData", () => ({
  default: (...args) => getMarketData(...args),
}));

const { ordersByRegionAndType, fetchStationPrices, expiresAt } =
  await import("./fetchStationBook.js");

const JITA = 60003760;
const AMARR_STATION = 60008494;

const headersWith = (entries) => new Headers(entries);

const order = (price, isBuy, location = JITA) => ({
  price,
  is_buy_order: isBuy,
  location_id: location,
  type_id: 34,
});

/** One page of an answer, as getMarketData returns it. */
const page = (
  data,
  { totalPages = 1, etag = "e1", expires, unchanged = false } = {},
) => ({
  data,
  etag,
  totalPages,
  unchanged,
  headers: headersWith(expires ? { expires } : {}),
});

beforeEach(() => {
  getMarketData.mockReset();
});

describe("reading when the book expires", () => {
  it("takes the moment ESI gave", () => {
    const at = expiresAt(
      headersWith({ expires: "Mon, 14 Sep 2026 21:45:05 GMT" }),
    );

    expect(at).toBe(Date.parse("Mon, 14 Sep 2026 21:45:05 GMT"));
  });

  // A caller pacing itself on this must be able to tell "no answer" from a
  // moment, rather than treating a missing header as the epoch.
  it.each([[undefined], [null], [""], ["not a date"]])(
    "answers undefined for %s",
    (value) => {
      const headers = headersWith(value == null ? {} : { expires: value });

      expect(expiresAt(headers)).toBeUndefined();
    },
  );

  it("answers undefined where there are no headers at all", () => {
    expect(expiresAt(undefined)).toBeUndefined();
  });
});

describe("walking a region's pages", () => {
  // A busy type runs to several pages, and reading only the first prices
  // against part of the book.
  it("reads every page and returns them as one book", async () => {
    getMarketData
      .mockResolvedValueOnce(page([order(10, true)], { totalPages: 3 }))
      .mockResolvedValueOnce(page([order(11, true)], { totalPages: 3 }))
      .mockResolvedValueOnce(page([order(12, true)], { totalPages: 3 }));

    const book = await ordersByRegionAndType({
      regionID: 10000002,
      typeID: 34,
    });

    expect(getMarketData).toHaveBeenCalledTimes(3);
    expect(book.orders).toHaveLength(3);
  });

  it("asks for one page where that is the whole book", async () => {
    getMarketData.mockResolvedValue(page([order(10, true)]));

    await ordersByRegionAndType({ regionID: 10000002, typeID: 34 });

    expect(getMarketData).toHaveBeenCalledTimes(1);
  });

  // The etag identifies the whole book, and a region's pages are generated
  // together, so offering it on later pages would ask the wrong question.
  it("offers what it holds on the first page only", async () => {
    getMarketData
      .mockResolvedValueOnce(page([order(10, true)], { totalPages: 2 }))
      .mockResolvedValueOnce(page([order(11, true)], { totalPages: 2 }));

    const held = { etag: "held", data: [order(1, true)] };
    await ordersByRegionAndType({ regionID: 10000002, typeID: 34, held });

    expect(getMarketData.mock.calls[0][0].existingData).toBe(held);
    expect(getMarketData.mock.calls[1][0].existingData).toEqual({});
  });

  it("carries the etag and the expiry from the first page", async () => {
    getMarketData.mockResolvedValue(
      page([order(10, true)], {
        etag: "abc",
        expires: "Mon, 14 Sep 2026 21:45:05 GMT",
      }),
    );

    const book = await ordersByRegionAndType({
      regionID: 10000002,
      typeID: 34,
    });

    expect(book.etag).toBe("abc");
    expect(book.expiresAt).toBe(Date.parse("Mon, 14 Sep 2026 21:45:05 GMT"));
  });
});

describe("a book that has not changed", () => {
  // The point of holding an etag: an unchanged book costs one conditional
  // request rather than every page again.
  it("keeps what was held and asks for nothing more", async () => {
    const held = { etag: "held", data: [order(5, true), order(6, false)] };
    getMarketData.mockResolvedValue(
      page([], { totalPages: 4, etag: "held", unchanged: true }),
    );

    const book = await ordersByRegionAndType({
      regionID: 10000002,
      typeID: 34,
      held,
    });

    expect(getMarketData).toHaveBeenCalledTimes(1);
    expect(book.orders).toBe(held.data);
    expect(book.unchanged).toBe(true);
  });

  // A 304 still carries a new expiry, which is what moves the next refresh on.
  it("takes the new expiry from the unchanged answer", async () => {
    getMarketData.mockResolvedValue(
      page([], { unchanged: true, expires: "Mon, 14 Sep 2026 22:00:00 GMT" }),
    );

    const book = await ordersByRegionAndType({
      regionID: 10000002,
      typeID: 34,
      held: { etag: "held", data: [] },
    });

    expect(book.expiresAt).toBe(Date.parse("Mon, 14 Sep 2026 22:00:00 GMT"));
  });
});

describe("pricing one station out of a region", () => {
  // The region answers for every station in it, so a caller that skips the
  // filter prices whichever market happened to be busiest.
  it("prices the station asked for and not its neighbours", async () => {
    getMarketData.mockResolvedValue(
      page([
        order(10, true, JITA),
        order(20, false, JITA),
        order(999, true, AMARR_STATION),
        order(1, false, AMARR_STATION),
      ]),
    );

    const { prices } = await fetchStationPrices({
      regionID: 10000002,
      locationID: JITA,
      typeID: 34,
    });

    expect(prices.buy).toBe(10);
    expect(prices.sell).toBe(20);
  });

  it("answers zero for a station holding no orders", async () => {
    getMarketData.mockResolvedValue(page([order(10, true, AMARR_STATION)]));

    const { prices } = await fetchStationPrices({
      regionID: 10000002,
      locationID: JITA,
      typeID: 34,
    });

    expect(prices).toEqual({ buy: 0, sell: 0, buyP95: 0, sellP05: 0 });
  });

  // The orders come back so a caller pricing several stations in one region
  // pays for the region once rather than per station.
  it("returns the region's orders beside the prices", async () => {
    const orders = [order(10, true, JITA), order(999, true, AMARR_STATION)];
    getMarketData.mockResolvedValue(page(orders));

    const answer = await fetchStationPrices({
      regionID: 10000002,
      locationID: JITA,
      typeID: 34,
    });

    expect(answer.orders).toHaveLength(2);
  });

  // A market that could not be reached is not a market with no orders.
  it("lets a failure reach the caller rather than pricing it as empty", async () => {
    getMarketData.mockRejectedValue(new Error("offline"));

    await expect(
      fetchStationPrices({ regionID: 10000002, locationID: JITA, typeID: 34 }),
    ).rejects.toThrow("offline");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const THE_FORGE = 10000002;
const JITA_4_4 = 60003760;
const RENS = 60004588;

let registryFailure = null;

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedStation } =
    await import("../../../tests/marketSourceFixtures.js");

  return marketSourcesWith(() => {
    if (registryFailure) throw registryFailure;

    return [
      savedStation({ regionID: THE_FORGE, stationID: JITA_4_4 }),
      savedStation({
        id: "another-station",
        name: "Another station the reader saved",
        regionID: THE_FORGE,
        stationID: RENS,
      }),
      savedStation({
        id: "same-station-again",
        name: "The same station, saved twice",
        regionID: THE_FORGE,
        stationID: JITA_4_4,
      }),
    ];
  });
});

const { requestPrice, resetPriceLoader, setMarketRefreshedListener } =
  await import("./priceLoader.js");

const refreshed = vi.fn();
const announcedFor = (marketLocation) =>
  refreshed.mock.calls
    .flatMap(([{ markets }]) => markets)
    .find((market) => market.marketLocation === marketLocation)?.refreshedAt;

beforeEach(() => {
  registryFailure = null;
  setMarketRefreshedListener(refreshed);
  fetchMarketPricesQuery.mockResolvedValue({ sources: {}, adjusted: null });
});

afterEach(() => {
  resetPriceLoader();
  setMarketRefreshedListener(null);
  vi.clearAllMocks();
});

describe("a want for a station the reader saved", () => {
  it("is asked of this server by the station it sits at", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { [JITA_4_4]: { refreshedAt: 7, prices: { 34: { sell: 10 } } } },
      adjusted: null,
    });

    const typePrice = await requestPrice(34, "saved-station");

    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: String(JITA_4_4) },
    ]);
    expect(typePrice.sell).toBe(10);
  });

  it("holds the refresh time under the reader's own id for the market", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        [JITA_4_4]: { refreshedAt: 99, prices: { 34: { sell: 10 } } },
      },
      adjusted: null,
    });

    await requestPrice(34, "saved-station");

    expect(announcedFor("saved-station")).toBe(99);
    expect(announcedFor(String(JITA_4_4))).toBeUndefined();
  });

  it("settles as nothing where the market holds no order", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { [JITA_4_4]: { refreshedAt: 7, prices: {} } },
      adjusted: null,
    });

    expect(await requestPrice(34, "saved-station")).toBeNull();
  });
});

describe("two markets an account saved at one station", () => {
  it("are each announced under their own id", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        [JITA_4_4]: { refreshedAt: 42, prices: { 34: { sell: 10 } } },
      },
      adjusted: null,
    });

    const [first, second] = await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "same-station-again"),
    ]);

    expect(first.sell).toBe(10);
    expect(second.sell).toBe(10);
    expect(announcedFor("saved-station")).toBe(42);
    expect(announcedFor("same-station-again")).toBe(42);
  });

  it("are asked for once, not once each", async () => {
    await Promise.all([
      requestPrice(34, "saved-station"),
      requestPrice(34, "same-station-again"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: String(JITA_4_4) },
      { typeID: "34", marketLocation: String(JITA_4_4) },
    ]);
  });
});

describe("a tick naming hubs and saved markets together", () => {
  it("asks for them in one request", async () => {
    fetchMarketPricesQuery.mockResolvedValue({
      sources: {
        jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } },
        [RENS]: { refreshedAt: 1, prices: { 34: { sell: 6 } } },
      },
      adjusted: null,
    });

    const [hub, saved] = await Promise.all([
      requestPrice(34, "jita"),
      requestPrice(34, "another-station"),
    ]);

    expect(fetchMarketPricesQuery).toHaveBeenCalledTimes(1);
    expect(fetchMarketPricesQuery.mock.calls[0][0].wants).toEqual([
      { typeID: "34", marketLocation: "jita" },
      { typeID: "34", marketLocation: String(RENS) },
    ]);
    expect(hub.sell).toBe(5);
    expect(saved.sell).toBe(6);
  });

  it("fails both when this server cannot be reached", async () => {
    fetchMarketPricesQuery.mockRejectedValue(new Error("offline"));

    const [hub, saved] = await Promise.allSettled([
      requestPrice(34, "jita"),
      requestPrice(34, "saved-station"),
    ]);

    expect(hub.status).toBe("rejected");
    expect(saved.status).toBe("rejected");
  });
});

describe("a market the registry cannot name", () => {
  it("fails rather than settling as nothing held", async () => {
    await expect(requestPrice(34, "a-market-nobody-saved")).rejects.toThrow(
      /no market source named/,
    );
  });

  it("fails every want in the tick when the registry itself throws", async () => {
    registryFailure = new Error("the registry is unreadable");

    await expect(requestPrice(34, "jita")).rejects.toThrow(
      /the registry is unreadable/,
    );
  });
});

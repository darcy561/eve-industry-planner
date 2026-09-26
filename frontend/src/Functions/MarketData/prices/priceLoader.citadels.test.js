import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const readCitadelPrices = vi.fn();
vi.mock("../citadels/citadelPrices.js", () => ({
  readCitadelPrices: (...args) => readCitadelPrices(...args),
}));

const replaceStoredPrices = vi.fn();
const replaceStoredOrders = vi.fn();
vi.mock("./priceStore", () => ({
  replaceStoredPrices: (...args) => replaceStoredPrices(...args),
  replaceStoredOrders: (...args) => replaceStoredOrders(...args),
  readStoredPrice: vi.fn(),
}));

const AZBEL = 1035466617946;
const ASTRAHUS = 1035466617947;

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedCitadel } =
    await import("../../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    savedCitadel({ id: "azbel", name: "Perimeter Azbel", structureID: AZBEL }),
    savedCitadel({
      id: "astrahus",
      name: "A second one",
      structureID: ASTRAHUS,
    }),
  );
});

const {
  requestMarketRead,
  requestPrice,
  resetPriceLoader,
  setMarketRefreshedListener,
} = await import("./priceLoader.js");

const priced = (typePrices, extra = {}) => ({
  typePrices: new Map(typePrices),
  orders: [{ order_id: 1, type_id: 34, price: 10, is_buy_order: false }],
  refreshedAt: 1757000000000,
  ...extra,
});

beforeEach(() => {
  fetchMarketPricesQuery.mockResolvedValue({ sources: {}, adjusted: null });
  readCitadelPrices.mockResolvedValue(priced([["34", { sell: 10, buy: 9 }]]));
  replaceStoredPrices.mockResolvedValue(undefined);
  replaceStoredOrders.mockResolvedValue(undefined);
});

afterEach(() => {
  resetPriceLoader();
  setMarketRefreshedListener(null);
  vi.clearAllMocks();
});

describe("a tick wanting prices at a citadel", () => {
  it("reads the market rather than asking this server", async () => {
    const typePrice = await requestPrice(34, "azbel");

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(readCitadelPrices.mock.calls[0][0]).toMatchObject({
      structureID: AZBEL,
    });
    expect(fetchMarketPricesQuery).not.toHaveBeenCalled();
    expect(typePrice).toMatchObject({ sell: 10, refreshedAt: 1757000000000 });
  });

  it("reads it once however many types were wanted", async () => {
    readCitadelPrices.mockResolvedValue(
      priced([
        ["34", { sell: 10 }],
        ["35", { sell: 20 }],
      ]),
    );

    const [first, second] = await Promise.all([
      requestPrice(34, "azbel"),
      requestPrice(35, "azbel"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(first.sell).toBe(10);
    expect(second.sell).toBe(20);
  });

  it("reads two markets apart from each other", async () => {
    readCitadelPrices.mockImplementation(async (source) =>
      priced([["34", { sell: source.structureID === AZBEL ? 10 : 20 }]]),
    );

    const [azbel, astrahus] = await Promise.all([
      requestPrice(34, "azbel"),
      requestPrice(34, "astrahus"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
    expect(azbel.sell).toBe(10);
    expect(astrahus.sell).toBe(20);
  });

  it("settles as nothing for a type the market holds no order for", async () => {
    expect(await requestPrice(99, "azbel")).toBeNull();
  });
});

describe("what a read is kept as", () => {
  it("is the whole market, not the types this tick wanted", async () => {
    const typePrices = new Map([
      ["34", { sell: 10 }],
      ["35", { sell: 20 }],
    ]);
    readCitadelPrices.mockResolvedValue(
      priced(typePrices, { refreshedAt: 42, expiresAt: 99 }),
    );

    await requestPrice(34, "azbel");

    expect(replaceStoredPrices).toHaveBeenCalledWith("azbel", typePrices, {
      refreshedAt: 42,
      expiresAt: 99,
    });
  });

  it("carries the moment of the read on the prices, and no expiry", async () => {
    readCitadelPrices.mockResolvedValue(
      priced([["34", { sell: 10 }]], { refreshedAt: 42, expiresAt: 99 }),
    );

    expect(await requestPrice(34, "azbel")).toEqual({
      sell: 10,
      refreshedAt: 42,
    });
  });

  it("is written to the device before the market is said to have moved", async () => {
    let finishWriting;
    replaceStoredPrices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWriting = resolve;
        }),
    );
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);

    const asked = requestPrice(34, "azbel");
    await vi.waitFor(() => expect(replaceStoredPrices).toHaveBeenCalled());

    expect(refreshed).not.toHaveBeenCalled();

    finishWriting();
    await asked;

    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it("announces the read under the reader's own id", async () => {
    const refreshed = vi.fn();
    setMarketRefreshedListener(refreshed);

    await requestPrice(34, "azbel");

    expect(replaceStoredPrices.mock.calls[0][0]).toBe("azbel");
    expect(refreshed).toHaveBeenCalledWith({
      markets: [{ marketLocation: "azbel", refreshedAt: 1757000000000 }],
    });
  });
});

describe("a citadel that cannot be read", () => {
  it("fails its own wants rather than settling them as nothing", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));

    await expect(requestPrice(34, "azbel")).rejects.toThrow(
      /nobody can dock there/,
    );
  });

  it("keeps nothing for a market it could not read", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));

    await expect(requestPrice(34, "azbel")).rejects.toThrow();

    expect(replaceStoredPrices).not.toHaveBeenCalled();
  });

  it("does not take the hub prices in the same tick with it", async () => {
    readCitadelPrices.mockRejectedValue(new Error("nobody can dock there"));
    fetchMarketPricesQuery.mockResolvedValue({
      sources: { jita: { refreshedAt: 1, prices: { 34: { sell: 5 } } } },
      adjusted: null,
    });

    const [citadel, hub] = await Promise.allSettled([
      requestPrice(34, "azbel"),
      requestPrice(34, "jita"),
    ]);

    expect(citadel.status).toBe("rejected");
    expect(hub.status).toBe("fulfilled");
    expect(hub.value.sell).toBe(5);
  });
});

describe("a rotation and a reader wanting the same market", () => {
  function heldOpen({ failing = false } = {}) {
    let release;
    readCitadelPrices.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          release = () =>
            failing
              ? reject(new Error("nobody can dock there"))
              : resolve(priced([["34", { sell: 10 }]]));
        }),
    );
    return () => release();
  }

  it("share one read and one write between them", async () => {
    const finish = heldOpen();

    const both = Promise.all([
      requestPrice(34, "azbel"),
      new Promise((resolve) => setTimeout(resolve, 0)).then(() =>
        requestMarketRead("azbel"),
      ),
    ]);
    await vi.waitFor(() => expect(readCitadelPrices).toHaveBeenCalled());
    finish();
    await both;

    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
    expect(replaceStoredPrices).toHaveBeenCalledTimes(1);
  });

  it("do not join work at another market", async () => {
    await Promise.all([
      requestMarketRead("azbel"),
      requestMarketRead("astrahus"),
    ]);

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
  });

  it("are not answered from work that has already finished", async () => {
    await requestMarketRead("azbel");
    await requestMarketRead("azbel");

    expect(readCitadelPrices).toHaveBeenCalledTimes(2);
  });

  it("share a failure rather than each paying for one", async () => {
    const fail = heldOpen({ failing: true });

    const settled = Promise.allSettled([
      requestPrice(34, "azbel"),
      new Promise((resolve) => setTimeout(resolve, 0)).then(() =>
        requestMarketRead("azbel"),
      ),
    ]);
    await vi.waitFor(() => expect(readCitadelPrices).toHaveBeenCalled());
    fail();
    const [want, rotation] = await settled;

    expect(want.status).toBe("rejected");
    expect(rotation.status).toBe("rejected");
    expect(readCitadelPrices).toHaveBeenCalledTimes(1);
  });
});

describe("the orders behind the prices", () => {
  it("is kept beside them, with the moment it was read", async () => {
    const orders = [
      { order_id: 7, type_id: 34, price: 11, is_buy_order: true },
    ];
    readCitadelPrices.mockResolvedValue(
      priced([["34", { sell: 10 }]], { orders, refreshedAt: 42 }),
    );

    await requestPrice(34, "azbel");

    expect(replaceStoredOrders).toHaveBeenCalledWith("azbel", orders, 42);
  });

  it("does not hold up the prices when it cannot be written", async () => {
    replaceStoredOrders.mockRejectedValue(new Error("quota exceeded"));

    await expect(requestPrice(34, "azbel")).resolves.not.toThrow();

    expect(replaceStoredPrices).toHaveBeenCalled();
  });
});

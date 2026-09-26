import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const AZBEL = 1035466617946;
const MAIN = { CharacterHash: "hash-main", CharacterName: "Main" };
const ALT = { CharacterHash: "hash-alt", CharacterName: "Alt" };

let characters = [MAIN, ALT];

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account: { characters } }));
});

vi.mock("../../Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: async (characterHash) => ({
    accessToken: `header.${btoa(
      JSON.stringify({ scp: ["esi-markets.structure_markets.v1"] }),
    )}.${characterHash}`,
  }),
}));

vi.mock("../registry/marketSources.js", async () => {
  const { marketSourcesWith, savedCitadel } =
    await import("../../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    savedCitadel({ name: "Perimeter Azbel", structureID: AZBEL }),
  );
});

const { clear: clearStorage } = await import("idb-keyval");
const { queryClient } = await import("../../../queryClient.js");
const { resetPriceLoader } = await import("../prices/priceLoader");
const { resetPriceStore } = await import("../prices/priceStore");
const { readMarketPriceForType } = await import("../prices/marketPriceForType");
const { rotateSelfReadMarkets } = await import("../prices/priceCache");
const { useMarketPricesQuery } =
  await import("../../../Hooks/React Query/World/marketPrices.js");
const { useCitadelOrdersQuery } =
  await import("../../../Hooks/React Query/World/citadelOrders.js");

const MINUTE = 60 * 1000;

const stated = (offsetMs) => new Date(Date.now() + offsetMs).toUTCString();

const READ_AT = stated(-MINUTE);
const READ_AGAIN_AT = stated(0);

const AFTER_ITS_TURN = 61 * MINUTE;

function order(typeID, price, isBuy = false) {
  return {
    order_id: Math.random(),
    type_id: typeID,
    location_id: AZBEL,
    price,
    is_buy_order: isBuy,
    volume_remain: 5,
  };
}

function ordersPage(orders, { pages = 1, readAt = READ_AT } = {}) {
  return new Response(JSON.stringify(orders), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-pages": String(pages),
      "last-modified": readAt,
    },
  });
}

function refusal(status = 403) {
  return new Response(JSON.stringify({ error: "forbidden" }), { status });
}

function Subject({ wants }) {
  const { isLoading, isError } = useMarketPricesQuery(wants);
  if (isLoading) return <p>pricing</p>;
  if (isError) return <p>could not price</p>;

  return (
    <ul>
      {wants.map(({ typeID, marketLocation }) => (
        <li key={`${marketLocation}|${typeID}`}>
          {`${typeID}: ${readMarketPriceForType(typeID, marketLocation, "sell")}`}
        </li>
      ))}
    </ul>
  );
}

function show(wants) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Subject wants={wants} />
    </QueryClientProvider>,
  );
}

function Browsing({ typeID, regionID }) {
  const { orders } = useCitadelOrdersQuery(typeID, regionID);

  return (
    <p>{`${orders.length} orders: ${orders.map((o) => o.price).join()}`}</p>
  );
}

function browse(typeID, regionID) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Subject wants={[{ typeID, marketLocation: "saved-citadel" }]} />
      <Browsing typeID={typeID} regionID={regionID} />
    </QueryClientProvider>,
  );
}

const THE_FORGE = 10000002;

function asked() {
  return fetchMock.mock.calls.map(([url, options]) => ({
    url,
    token: options?.headers?.Authorization,
  }));
}

let fetchMock;

beforeEach(async () => {
  characters = [MAIN, ALT];
  queryClient.clear();
  resetPriceLoader();
  resetPriceStore();
  await clearStorage();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  queryClient.clear();
  resetPriceLoader();
  resetPriceStore();
  await clearStorage();
});

describe("a citadel's price from ESI to the screen", () => {
  it("reaches a surface that draws it", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(34, 8, true)]),
    );

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/markets/structures/${AZBEL}/`,
    );
  });

  it("answers every type on the market from one read", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(35, 25), order(36, 40)]),
    );

    show([
      { typeID: 34, marketLocation: "saved-citadel" },
      { typeID: 35, marketLocation: "saved-citadel" },
    ]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(screen.getByText("35: 25")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads every page before pricing anything", async () => {
    fetchMock
      .mockResolvedValueOnce(ordersPage([order(34, 50)], { pages: 2 }))
      .mockResolvedValueOnce(ordersPage([order(34, 10)], { pages: 2 }));

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("which character the market is read with", () => {
  it("settles on one that can see it, and remembers it", async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options.headers.Authorization.endsWith(ALT.CharacterHash)
        ? ordersPage([order(34, 10)])
        : refusal(),
    );

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);
    await screen.findByText("34: 10");

    expect(asked().map(({ token }) => token.split(".").pop())).toEqual([
      MAIN.CharacterHash,
      ALT.CharacterHash,
    ]);

    fetchMock.mockClear();
    await rotateSelfReadMarkets(Date.now() + AFTER_ITS_TURN);

    expect(asked().map(({ token }) => token.split(".").pop())).toEqual([
      ALT.CharacterHash,
    ]);
  });

  it("asks the next character when the first is refused", async () => {
    let refusedOnce = false;
    fetchMock.mockImplementation(async () => {
      if (refusedOnce) return ordersPage([order(34, 10)]);
      refusedOnce = true;
      return refusal();
    });

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a market no character can see rather than pricing it at nothing", async () => {
    fetchMock.mockResolvedValue(refusal());

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("could not price")).toBeTruthy();
  });
});

describe("what the reader's device keeps", () => {
  it("prices a second type without reading the market again", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10), order(35, 25)]));

    const first = show([{ typeID: 34, marketLocation: "saved-citadel" }]);
    await screen.findByText("34: 10");

    first.unmount();
    queryClient.clear();
    resetPriceLoader();
    fetchMock.mockClear();

    show([{ typeID: 35, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("35: 25")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a market whose hour is up", () => {
  it("is read once by the tick, and the surface follows it", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);
    await screen.findByText("34: 10");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 12)], { readAt: READ_AGAIN_AT }),
    );

    await rotateSelfReadMarkets(Date.now() + AFTER_ITS_TURN);

    expect(await screen.findByText("34: 12")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is read by the schedule even when nothing has ever asked for it", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    expect(await rotateSelfReadMarkets(Date.now())).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    show([{ typeID: 34, marketLocation: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives a surface browsing it the orders behind the price", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(34, 12), order(35, 99)]),
    );

    browse(34, THE_FORGE);

    expect(await screen.findByText("2 orders: 10,12")).toBeTruthy();
  });

  it("shows a reader the new orders without their reopening it", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    browse(34, THE_FORGE);
    expect(await screen.findByText("1 orders: 10")).toBeTruthy();

    fetchMock.mockResolvedValue(
      ordersPage([order(34, 30), order(34, 31)], { readAt: READ_AGAIN_AT }),
    );
    await rotateSelfReadMarkets(Date.now() + AFTER_ITS_TURN);

    expect(await screen.findByText("2 orders: 30,31")).toBeTruthy();
  });

  it("is left alone until its hour is up", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    show([{ typeID: 34, marketLocation: "saved-citadel" }]);
    await screen.findByText("34: 10");
    fetchMock.mockClear();

    await rotateSelfReadMarkets(Date.now() + 30 * MINUTE);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

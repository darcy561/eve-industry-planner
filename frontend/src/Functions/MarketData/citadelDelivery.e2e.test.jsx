/**
 * A citadel's price from ESI to the screen, with nothing in between replaced.
 *
 * The sibling end-to-end test covers the markets this server prices. This is
 * the other half: a market only the reader can read, which is the one path
 * where the browser walks every order at a market, derives every price itself, keeps
 * the answer on the device and decides for itself when to go again.
 *
 * Every piece of that is real here — the per-character walk, the read, the
 * derivation, the loader, IndexedDB, the cache, the accessor and a component
 * drawing figures while it renders. What is stood in for is the outside world:
 * ESI's HTTP, the account's characters and their tokens, and the reader's saved
 * markets.
 *
 * **This is the only place the pieces meet.** Each unit test mocks its
 * neighbours, which is right for a unit test, so what none of them can say is
 * that a price actually arrives: the real rate limiter, the real store and a
 * real render are only ever exercised together here.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const AZBEL = 1035466617946;
const MAIN = { CharacterHash: "hash-main", CharacterName: "Main" };
const ALT = { CharacterHash: "hash-alt", CharacterName: "Alt" };

/** The account's characters, in the order the app holds them. */
let characters = [MAIN, ALT];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account: { characters } }));
});

// A token carrying the market scope, and its character's hash where the
// signature would be — which is ignored by everything that reads a token and
// lets a test see which character a request was made as.
vi.mock("../Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: async (characterHash) => ({
    accessToken: `header.${btoa(
      JSON.stringify({ scp: ["esi-markets.structure_markets.v1"] }),
    )}.${characterHash}`,
  }),
}));

// One citadel the reader saved. The registry is the seam a saved market joins
// at, and the kind is what routes it away from this server.
vi.mock("./marketSources", async () => {
  const { marketSourcesWith, savedCitadel } =
    await import("../../tests/marketSourceFixtures.js");
  return marketSourcesWith(
    savedCitadel({ name: "Perimeter Azbel", structureID: AZBEL }),
  );
});

const { clear: clearStorage } = await import("idb-keyval");
const { queryClient } = await import("../../queryClient.js");
const { resetSourceClocks } = await import("./sourceClocks.js");
const { resetPriceLoader } = await import("./priceLoader.js");
const { resetPriceStore } = await import("./priceStore.js");
const { getMarketPriceForType } = await import("./marketPriceForType.js");
const { rotateSelfReadMarkets } = await import("./priceCache.js");
const { useMarketPricesQuery } =
  await import("../../Hooks/React Query/World/marketPrices.js");
const { useCitadelOrdersQuery } =
  await import("../../Hooks/React Query/World/citadelOrders.js");

const MINUTE = 60 * 1000;

/**
 * The moments ESI states, relative to now.
 *
 * Fixed dates would have put every market past its turn the moment the calendar
 * passed them, so a test about a market being read once would read it twice.
 */
const stated = (offsetMs) => new Date(Date.now() + offsetMs).toUTCString();

const READ_AT = stated(-MINUTE);
const READ_AGAIN_AT = stated(0);

/**
 * Past the hour a market's prices stand for.
 *
 * ESI's own expiry is minutes away and is deliberately not what paces this — a
 * whole-market read is the reader's to pay for, so it happens on the hour.
 */
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

/** A page of orders, as ESI sends one. */
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

/** Draws a figure the way a shopping list row or a cost panel does. */
function Subject({ wants }) {
  const { isLoading, isError } = useMarketPricesQuery(wants);
  if (isLoading) return <p>pricing</p>;
  if (isError) return <p>could not price</p>;

  return (
    <ul>
      {wants.map(({ typeID, sourceID }) => (
        <li key={`${sourceID}|${typeID}`}>
          {`${typeID}: ${getMarketPriceForType(typeID, sourceID, "sell")}`}
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

/** Browses the orders themselves, the way the Market Data dialogue does. */
function Browsing({ typeID, regionID }) {
  const { orders } = useCitadelOrdersQuery(typeID, regionID);

  return (
    <p>{`${orders.length} orders: ${orders.map((o) => o.price).join()}`}</p>
  );
}

function browse(typeID, regionID) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Subject wants={[{ typeID, sourceID: "saved-citadel" }]} />
      <Browsing typeID={typeID} regionID={regionID} />
    </QueryClientProvider>,
  );
}

const THE_FORGE = 10000002;

/** Every ESI request made, by the character that made it. */
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
  resetSourceClocks();
  resetPriceLoader();
  resetPriceStore();
  await clearStorage();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  queryClient.clear();
  resetSourceClocks();
  resetPriceLoader();
  resetPriceStore();
  await clearStorage();
});

describe("a citadel's price from ESI to the screen", () => {
  it("reaches a surface that draws it", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(34, 8, true)]),
    );

    show([{ typeID: 34, sourceID: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/markets/structures/${AZBEL}/`,
    );
  });

  // The market has no per-type form, so the read that answers one want answers
  // every type on it — which is the whole reason the answer is kept.
  it("answers every type on the market from one read", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(35, 25), order(36, 40)]),
    );

    show([
      { typeID: 34, sourceID: "saved-citadel" },
      { typeID: 35, sourceID: "saved-citadel" },
    ]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(screen.getByText("35: 25")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads every page before pricing anything", async () => {
    fetchMock
      .mockResolvedValueOnce(ordersPage([order(34, 50)], { pages: 2 }))
      .mockResolvedValueOnce(ordersPage([order(34, 10)], { pages: 2 }));

    show([{ typeID: 34, sourceID: "saved-citadel" }]);

    // The cheaper ask is on the second page: a read that stopped at the first
    // would price this market at 50 and look entirely plausible doing it.
    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("which character the market is read with", () => {
  // Only the alt can dock, so the walk has to reach it — and having reached it,
  // the device remembers, which is what makes the next read one request rather
  // than a refusal followed by a request.
  it("settles on one that can see it, and remembers it", async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options.headers.Authorization.endsWith(ALT.CharacterHash)
        ? ordersPage([order(34, 10)])
        : refusal(),
    );

    show([{ typeID: 34, sourceID: "saved-citadel" }]);
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

  // Nothing records who may dock where, so a refusal is one character's answer
  // and not the account's.
  it("asks the next character when the first is refused", async () => {
    let refusedOnce = false;
    fetchMock.mockImplementation(async () => {
      if (refusedOnce) return ordersPage([order(34, 10)]);
      refusedOnce = true;
      return refusal();
    });

    show([{ typeID: 34, sourceID: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Not an empty market: pricing every type at nothing would look exactly like
  // a real answer to every surface downstream.
  it("reports a market no character can see rather than pricing it at nothing", async () => {
    fetchMock.mockResolvedValue(refusal());

    show([{ typeID: 34, sourceID: "saved-citadel" }]);

    expect(await screen.findByText("could not price")).toBeTruthy();
  });
});

describe("what the reader's device keeps", () => {
  it("prices a second type without reading the market again", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10), order(35, 25)]));

    const first = show([{ typeID: 34, sourceID: "saved-citadel" }]);
    await screen.findByText("34: 10");

    // A fresh page of the app: the cache is empty, the device is not.
    first.unmount();
    queryClient.clear();
    resetPriceLoader();
    resetSourceClocks();
    fetchMock.mockClear();

    show([{ typeID: 35, sourceID: "saved-citadel" }]);

    expect(await screen.findByText("35: 25")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a market whose hour is up", () => {
  // The defect this whole path is arranged around: the tick reads the market
  // again and wakes every surface holding its rows, and what those surfaces read
  // through is the device. Telling them before the rows landed sent them to the
  // ones the read was replacing, which they would then hold on to.
  it("is read once by the tick, and the surface follows it", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    show([{ typeID: 34, sourceID: "saved-citadel" }]);
    await screen.findByText("34: 10");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 12)], { readAt: READ_AGAIN_AT }),
    );

    await rotateSelfReadMarkets(Date.now() + AFTER_ITS_TURN);

    expect(await screen.findByText("34: 12")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A market is saved because the reader means to price against it, so the
  // schedule covers every saved one — not only those already priced against.
  it("is read by the schedule even when nothing has ever asked for it", async () => {
    fetchMock.mockResolvedValue(ordersPage([order(34, 10)]));

    expect(await rotateSelfReadMarkets(Date.now())).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // And what it read is on the device, so the first surface to want a price
    // there is a lookup rather than a walk.
    fetchMock.mockClear();
    show([{ typeID: 34, sourceID: "saved-citadel" }]);

    expect(await screen.findByText("34: 10")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The prices a job is costed against are four figures a type; the dialogue
  // that browses a market wants the orders they were derived from, which the
  // same walk saw and which nothing else can ask for per type.
  it("gives a surface browsing it the orders behind the price", async () => {
    fetchMock.mockResolvedValue(
      ordersPage([order(34, 10), order(34, 12), order(35, 99)]),
    );

    browse(34, THE_FORGE);

    expect(await screen.findByText("2 orders: 10,12")).toBeTruthy();
  });

  // A dialogue left open across a market's turn must not still be showing what
  // it read when it opened. Nothing about it changes — no remount, no reopen.
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

    show([{ typeID: 34, sourceID: "saved-citadel" }]);
    await screen.findByText("34: 10");
    fetchMock.mockClear();

    await rotateSelfReadMarkets(Date.now() + 30 * MINUTE);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

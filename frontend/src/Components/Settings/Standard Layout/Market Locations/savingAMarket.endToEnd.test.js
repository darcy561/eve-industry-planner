import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving a market, from the control to what the app then offers.
 *
 * Nothing between the two is mocked — the store, the debounce, the save and the
 * composed set are all the real modules — because the defect this covers lived
 * exactly in the joins between them and was invisible to every unit test on
 * either side. What is mocked is the network.
 */

const request = vi.fn();
vi.mock(
  "../../../../Functions/Endpoints/Private/applyPrivateHeaders.js",
  () => ({
    default: (...args) => request(...args),
  }),
);

const fetchMarketLocations = vi.fn();
vi.mock("../../../../Functions/Endpoints/Private/marketLocations.js", () => ({
  fetchMarketLocations: () => fetchMarketLocations(),
}));

const { default: useUsersStore } =
  await import("../../../../Zustand/usersStore.js");
const { queryClient } = await import("../../../../queryClient.js");
const { MARKET_LOCATIONS_QUERY_KEY, marketsToOffer, seedMarketLocations } =
  await import("../../../../Functions/MarketData/marketLocations.js");
const { marketEdits } = await import("./marketWriter.js");

const jitaMarket = {
  id: "market-jita",
  name: "My Jita office",
  regionID: 10000002,
  stationID: 60003760,
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const offeredIDs = () => marketsToOffer().map((market) => market.id);

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.removeQueries({ queryKey: MARKET_LOCATIONS_QUERY_KEY });
  request.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
  useUsersStore.getState().account.actions.setLoggedIn(true);
  useUsersStore.setState((state) => ({
    applicationSettings: { ...state.applicationSettings, marketLocations: [] },
  }));
  // As a sign-in leaves it: the server has composed a set, and it has none in
  // it. This is what makes the account's own lane stop being consulted.
  seedMarketLocations([]);
});

describe("saving a market a reader added", () => {
  // The report this covers: an NPC station was added, the server was told about
  // it, and it appeared nowhere in the app. Every surface reads the set the
  // server composed, so a market that does not reach that set is offered
  // nowhere however correctly it was stored.
  it("offers it once the save has landed", async () => {
    fetchMarketLocations.mockResolvedValue([jitaMarket]);

    marketEdits().add(jitaMarket);
    await settled();

    expect(offeredIDs()).toContain("market-jita");
  });

  // The market has to reach the server before the set can be read again, and
  // the save is not left waiting on a two-second timer to do it.
  it("sends it to the server without waiting out the debounce", async () => {
    fetchMarketLocations.mockResolvedValue([jitaMarket]);

    marketEdits().add(jitaMarket);
    await settled();

    const [url, options] = request.mock.calls.at(-1);
    expect(url).toContain("application-settings");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body).marketLocations).toContainEqual(
      expect.objectContaining({ id: "market-jita", stationID: 60003760 }),
    );
  });

  // A refused save leaves the market held locally rather than dropped, and
  // leaves the set unread so the next save picks it up — what must not happen
  // is the set being replaced by one taken before the change.
  it("does not read the set again when the save was refused", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "refused",
    });

    marketEdits().add(jitaMarket);
    await settled();

    expect(fetchMarketLocations).not.toHaveBeenCalled();
    expect(
      useUsersStore.getState().applicationSettings.marketLocations,
    ).toHaveLength(1);
  });

  it("stops offering one the reader removed", async () => {
    fetchMarketLocations.mockResolvedValue([jitaMarket]);
    marketEdits().add(jitaMarket);
    await settled();

    fetchMarketLocations.mockResolvedValue([]);
    marketEdits().remove("market-jita");
    await settled();

    expect(offeredIDs()).not.toContain("market-jita");
  });
});

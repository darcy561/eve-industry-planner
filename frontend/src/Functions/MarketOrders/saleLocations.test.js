import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  storedCitadel,
  storedStation,
} from "../../tests/marketSourceFixtures.js";
import {
  MARKET_LOCATIONS_QUERY_KEY,
  seedMarketLocations,
} from "../MarketData/marketLocations.js";
import { queryClient } from "../../queryClient.js";

let structures = [];
/** Which market the account sells at — the setting the default now comes from. */
let sellingMarket = "market-1";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        marketLocations: structures,
        defaultPricing: { selling: { market: sellingMarket } },
      },
    }),
  );
});

const {
  SALE_LOCATION_KIND,
  getDefaultSaleStructure,
  getSaleCitadels,
  resolveSaleLocation,
} = await import("./saleLocations");

/** The shared saved citadel, as the default this file's cases expect. */
const aCitadel = (overrides = {}) =>
  storedCitadel({ brokerFee: 1.5, ...overrides });

beforeEach(() => {
  queryClient.removeQueries({ queryKey: MARKET_LOCATIONS_QUERY_KEY });
});

beforeEach(() => {
  structures = [aCitadel()];
  sellingMarket = "market-1";
});

describe("saved sale structures", () => {
  test("a default is available without one being chosen", () => {
    expect(getDefaultSaleStructure()).not.toBeNull();
  });

  test("every row carries what pricing a sale from it needs", () => {
    for (const structure of getSaleCitadels()) {
      expect(typeof structure.id).toBe("string");
      expect(typeof structure.structureID).toBe("number");
      expect(typeof structure.brokerFee).toBe("number");
    }
  });

  // A market holding a station is not somewhere a citadel's own rate applies.
  // The place a row holds is the whole of what tells the two apart.
  test("offers only markets that are a citadel", () => {
    structures = [aCitadel(), storedStation({ id: "market-station" })];

    expect(getSaleCitadels().map((i) => i.id)).toEqual(["market-1"]);
  });

  // A reader who has saved none is the ordinary case, not an error: the trading
  // hub is what a sale prices against until they choose otherwise.
  test("sells at the hub when none is saved", () => {
    structures = [];
    sellingMarket = undefined;

    expect(getSaleCitadels()).toEqual([]);
    expect(getDefaultSaleStructure().id).toBe("jita");
  });

  test("sells at the market the account chose", () => {
    structures = [
      aCitadel({ id: "citadelMarket-1" }),
      aCitadel({ id: "citadelMarket-2" }),
    ];
    sellingMarket = "citadelMarket-2";

    expect(getDefaultSaleStructure().id).toBe("citadelMarket-2");
  });

  // A market that has been removed, or that an organisation stopped sharing,
  // leaves the choice naming nothing — which is the state before one was made.
  test("falls back to the hub when the chosen market is gone", () => {
    structures = [];
    sellingMarket = "market-1";

    expect(getDefaultSaleStructure().id).toBe("jita");
  });

  // Saving a market is not choosing one: the account's setting is untouched by
  // it, so a reader who adds their first market still prices at the hub.
  test("does not take a saved market as the choice", () => {
    structures = [aCitadel({ id: "market-1" })];
    sellingMarket = undefined;

    expect(getDefaultSaleStructure().id).toBe("jita");
  });
});

describe("resolveSaleLocation", () => {
  test("a structure supplies its own broker fee", () => {
    const structure = getDefaultSaleStructure();
    const location = resolveSaleLocation(structure.id);

    expect(location.kind).toBe(SALE_LOCATION_KIND.CITADEL);
    expect(location.brokerFee).toBe(structure.brokerFee);
  });

  // A citadel's orders are read on the reader's own characters, so a sale there
  // is priced where it happens rather than at a hub nowhere near it.
  test("a citadel is priced on its own market", () => {
    const citadel = getDefaultSaleStructure();
    const location = resolveSaleLocation(citadel.id);

    expect(location.id).toBe(citadel.id);
    expect(location.id).not.toBe(resolveSaleLocation(null).id);
  });

  test("choosing a citadel resolves that one, not the default", () => {
    structures = [
      aCitadel(),
      aCitadel({ id: "citadelMarket-2", brokerFee: 3.25, default: false }),
    ];
    const location = resolveSaleLocation("citadelMarket-2");

    expect(location.id).toBe("citadelMarket-2");
    expect(location.brokerFee).toBe(3.25);
  });

  test("a hub carries no broker fee, because the rate comes from the seller", () => {
    const location = resolveSaleLocation(null, "jita");

    expect(location.kind).toBe(SALE_LOCATION_KIND.NPC_STATION);
    expect(location.brokerFee).toBeNull();
  });

  test("an unknown structure id falls back to a hub rather than returning nothing", () => {
    const location = resolveSaleLocation("no-such-structure", "amarr");

    expect(location.kind).toBe(SALE_LOCATION_KIND.NPC_STATION);
    expect(location.id).toBe("amarr");
  });

  test("naming neither still resolves, so a caller always has a location", () => {
    expect(resolveSaleLocation()).not.toBeNull();
  });
});

// A market an organisation shares is on the composed set the server answers
// with, and never on the reader's own account. It has to resolve all the same —
// a job priced against one would otherwise fall back to a hub, quietly, and
// charge the wrong rate for the sale.
describe("a market the reader inherited rather than saved", () => {
  const inherited = storedCitadel({
    id: "corp-market",
    name: "The corporation's Azbel",
    structureID: 1035466617999,
    brokerFee: 0.5,
  });

  beforeEach(() => {
    structures = [];
    seedMarketLocations([inherited]);
  });

  test("resolves for a job that names it", () => {
    const location = resolveSaleLocation("corp-market", "jita");

    expect(location.kind).toBe(SALE_LOCATION_KIND.CITADEL);
    expect(location.brokerFee).toBe(0.5);
  });

  test("is offered as somewhere a job can sell from", () => {
    expect(getSaleCitadels().map((market) => market.id)).toEqual([
      "corp-market",
    ]);
  });

  // Chosen the same way one of the reader's own is: the account names it, and
  // nothing about it being inherited changes that.
  test("can be the market the account sells at", () => {
    sellingMarket = "corp-market";

    expect(getDefaultSaleStructure()?.id).toBe("corp-market");
  });
});

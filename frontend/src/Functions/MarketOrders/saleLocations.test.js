import { beforeEach, describe, expect, test, vi } from "vitest";

import { structureKinds } from "../../Context/defaultValues";

let structures = [];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ applicationSettings: { customStructures: structures } }),
  );
});

const {
  SALE_LOCATION_KIND,
  getDefaultSaleStructure,
  getSaleCitadels,
  resolveSaleLocation,
} = await import("./saleLocations");

function aCitadel(overrides = {}) {
  return {
    id: "citadelMarket-1",
    jobType: structureKinds.citadelMarket,
    name: "Perimeter Azbel",
    regionID: 10000002,
    structureID: 1035466617946,
    brokerFee: 1.5,
    default: true,
    ...overrides,
  };
}

beforeEach(() => {
  structures = [aCitadel()];
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

  // One list holds every kind of saved structure, so an unfiltered read would
  // offer a refinery as somewhere to sell from.
  test("offers only the citadels, not every saved structure", () => {
    structures = [
      aCitadel(),
      {
        id: "manStruct-1",
        jobType: structureKinds.manufacturing,
        name: "Sotiyo",
      },
      {
        id: "npcMarket-1",
        jobType: structureKinds.npcStation,
        name: "Jita IV-4",
      },
    ];

    expect(getSaleCitadels().map((i) => i.id)).toEqual(["citadelMarket-1"]);
  });

  // A reader who has saved none is the ordinary case, not an error: the hub
  // fallback is what a sale prices against until they save one.
  test("has no default when none is saved", () => {
    structures = [];

    expect(getSaleCitadels()).toEqual([]);
    expect(getDefaultSaleStructure()).toBeNull();
  });

  test("falls back to the first when none is flagged default", () => {
    structures = [
      aCitadel({ id: "citadelMarket-1", default: false }),
      aCitadel({ id: "citadelMarket-2", default: false }),
    ];

    expect(getDefaultSaleStructure().id).toBe("citadelMarket-1");
  });
});

describe("resolveSaleLocation", () => {
  test("a structure supplies its own broker fee", () => {
    const structure = getDefaultSaleStructure();
    const location = resolveSaleLocation(structure.id);

    expect(location.kind).toBe(SALE_LOCATION_KIND.CITADEL);
    expect(location.brokerFee).toBe(structure.brokerFee);
  });

  // A citadel is a market, but nothing reads its book yet, so its figures come
  // from a hub. What it does supply is its own fee.
  test("a citadel prices against a hub rather than itself", () => {
    const location = resolveSaleLocation(getDefaultSaleStructure().id);

    expect(location.pricedAtID).toBe(resolveSaleLocation(null).pricedAtID);
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

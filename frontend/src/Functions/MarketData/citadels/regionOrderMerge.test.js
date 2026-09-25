import { describe, expect, it } from "vitest";

import {
  mergeCitadelOrders,
  placeOrdersInSystems,
  systemsOfPlaces,
} from "./regionOrderMerge";

const at = (locationID, price, systemID) => ({
  location_id: locationID,
  price,
  ...(systemID ? { system_id: systemID } : {}),
});

describe("showing a region and the private markets inside it as one market", () => {
  it("keeps every order from both", () => {
    const merged = mergeCitadelOrders(
      [at(60003760, 10)],
      [at(1035466617946, 9)],
    );

    expect(merged.map((o) => o.price)).toEqual([10, 9]);
  });

  // ESI publishes the structures whose owners made them public, so a citadel a
  // reader saved may already be in the region's own answer.
  it("takes the region's copy of a market it already answered for", () => {
    const merged = mergeCitadelOrders(
      [at(1035466617946, 10), at(60003760, 5)],
      [at(1035466617946, 9), at(1035466617946, 8)],
    );

    expect(merged.map((o) => o.price)).toEqual([10, 5]);
  });

  // A location id survives a round trip through storage, and nothing guarantees
  // which side is holding text — a duplicate that slipped through would show
  // one market at two moments.
  it("matches a place held as text against one held as a number", () => {
    const merged = mergeCitadelOrders(
      [at(1035466617946, 10)],
      [at("1035466617946", 9)],
    );

    expect(merged).toHaveLength(1);
  });

  it("is the region's own orders where nothing was read privately", () => {
    const region = [at(60003760, 10)];

    expect(mergeCitadelOrders(region, [])).toBe(region);
  });
});

describe("the systems the places sit in", () => {
  const AZBEL = 1035466617946;

  it("finds a system from the structure that has been named", () => {
    expect(
      systemsOfPlaces([at(AZBEL, 9)], {
        [AZBEL]: { solar_system_id: 30000144 },
      }),
    ).toEqual([30000144]);
  });

  // The region's own orders state their system, so asking about them again
  // would resolve what is already in hand.
  it("passes over an order that said which system it is in", () => {
    expect(
      systemsOfPlaces([at(60003760, 10, 30000142)], {
        60003760: { solar_system_id: 30000142 },
      }),
    ).toEqual([]);
  });

  it("says nothing about a place that has not been named yet", () => {
    expect(systemsOfPlaces([at(AZBEL, 9)], {})).toEqual([]);
  });

  // The caller asks for these by a key built from the list, so two renders
  // finding the same systems have to produce the same list.
  it("settles on one order whatever order the orders arrived in", () => {
    const worldData = {
      1: { solar_system_id: 30000144 },
      2: { solar_system_id: 30000142 },
    };

    expect(systemsOfPlaces([at(1, 9), at(2, 8)], worldData)).toEqual(
      systemsOfPlaces([at(2, 8), at(1, 9)], worldData),
    );
  });

  // A system stops being named the moment its orders leave the merge — a reader
  // changing type, or one citadel's orders dropping out while another's stay —
  // and a list that shrank would stop asking about a place still on screen.
  it("keeps a system found earlier when this round names a different one", () => {
    const found = systemsOfPlaces([at(1, 9)], {
      1: { solar_system_id: 30000144 },
    });

    expect(
      systemsOfPlaces([at(2, 8)], { 2: { solar_system_id: 30000142 } }, found),
    ).toEqual([30000142, 30000144]);
  });

  it("keeps what was found when this round names nothing", () => {
    expect(systemsOfPlaces([], {}, [30000144])).toEqual([30000144]);
  });

  it("names a system once when this round finds one already held", () => {
    expect(
      systemsOfPlaces(
        [at(1, 9)],
        { 1: { solar_system_id: 30000144 } },
        [30000144],
      ),
    ).toEqual([30000144]);
  });

  it("names a system once however many orders sit in it", () => {
    expect(
      systemsOfPlaces([at(1, 9), at(1, 8)], {
        1: { solar_system_id: 30000144 },
      }),
    ).toEqual([30000144]);
  });
});

describe("filling in the system an order did not state", () => {
  const AZBEL = 1035466617946;

  it("takes it from the structure once it has been named", () => {
    const filled = placeOrdersInSystems([at(AZBEL, 9)], {
      [AZBEL]: { solar_system_id: 30000144 },
    });

    expect(filled[0].system_id).toBe(30000144);
  });

  it("leaves an order that stated its own system alone", () => {
    const filled = placeOrdersInSystems([at(60003760, 10, 30000142)], {
      60003760: { solar_system_id: 99 },
    });

    expect(filled[0].system_id).toBe(30000142);
  });

  // The hook memoises on what comes back, and a new array every render would
  // re-ask for every name in it.
  it("hands back the same array where there was nothing to fill in", () => {
    const orders = [at(60003760, 10, 30000142)];

    expect(placeOrdersInSystems(orders, {})).toBe(orders);
  });

  it("leaves an order whose place is still being named", () => {
    const filled = placeOrdersInSystems([at(AZBEL, 9)], {});

    expect(filled[0].system_id).toBeUndefined();
  });
});

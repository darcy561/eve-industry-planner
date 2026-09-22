import { describe, expect, it, vi } from "vitest";

import { newMarketLocation } from "./newMarket";

vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });

const JITA = 60003760;
const AZBEL = 1035466617946;

describe("newMarketLocation", () => {
  // A row holding both ids is a market of neither sort: everything downstream
  // tells the two apart by which field is filled.
  it("puts a station's id in the station field and nothing in the other", () => {
    const market = newMarketLocation({
      name: "Jita IV-4",
      locationID: JITA,
      facts: { regionID: 10000002, raceID: 1, ownerID: 1000035 },
    });

    expect(market.stationID).toBe(JITA);
    expect(market.structureID).toBeUndefined();
  });

  it("puts a citadel's id in the structure field and nothing in the other", () => {
    const market = newMarketLocation({
      name: "Perimeter Azbel",
      locationID: AZBEL,
      facts: { regionID: 10000002 },
      brokerFee: 2.5,
    });

    expect(market.structureID).toBe(AZBEL);
    expect(market.stationID).toBeUndefined();
    expect(market.brokerFee).toBe(2.5);
  });

  // An NPC station's fee is worked out from the seller's skills and standings,
  // so a stored one would stand in for that derivation and quote the untrained
  // rate without saying so.
  it("stores no broker fee on an NPC station", () => {
    const market = newMarketLocation({
      name: "Jita IV-4",
      locationID: JITA,
      facts: { regionID: 10000002 },
      brokerFee: 2.5,
    });

    expect(market.brokerFee).toBeUndefined();
  });

  // What a station's fee is derived from is fixed for the life of the station,
  // so it is read once when the market is saved rather than per quote.
  it("carries what a station's broker fee is derived from", () => {
    const market = newMarketLocation({
      name: "Jita IV-4",
      locationID: JITA,
      facts: { regionID: 10000002, raceID: 1, ownerID: 1000035 },
    });

    expect(market.raceID).toBe(1);
    expect(market.ownerID).toBe(1000035);
  });

  // A market with no region is offered in every picker and prices nothing,
  // because an order book is read per region and then narrowed.
  it("always carries the region it was derived with", () => {
    const market = newMarketLocation({
      name: "Jita IV-4",
      locationID: JITA,
      facts: { regionID: 10000002 },
    });

    expect(market.regionID).toBe(10000002);
  });

  // The id is minted in the shape saved markets already have, so nothing that
  // reads one has to tell a new row from an old one.
  it("mints an id in the shape a saved market already has", () => {
    const market = newMarketLocation({
      name: "Jita IV-4",
      locationID: JITA,
      facts: { regionID: 10000002 },
    });

    expect(market.id).toBe("market-uuid-1");
  });
});

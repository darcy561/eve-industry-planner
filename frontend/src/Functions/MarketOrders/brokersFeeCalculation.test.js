import { describe, expect, it, vi } from "vitest";

const stationData = { race_id: 500001, owner: 1000035 };
const skills = { data: {} };
const standings = { data: [] };
const journal = { data: {} };

vi.mock("../EveESI/World/getStationData", () => ({
  default: async () => stationData,
}));
vi.mock("../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  getCachedCharacterSkills: () => skills,
}));
vi.mock("../../Hooks/EveEsi/Character/useGetCharacterStandings", () => ({
  getCachedCharacterStandings: () => standings,
}));
vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => journal,
}));
vi.mock("../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => ({ data: {} }),
}));

const { default: calcBrokersFee } = await import("./calcBrokersFee.js");
const { default: findBrokersFeeEntry } = await import(
  "./findBrokersFeeEntry.js"
);
const { default: Job } = await import("../../Classes/job.js");

const ISSUED = "2026-08-01T00:00:00Z";

// A station order: the rate is worked out from Broker Relations and standings.
// A citadel order: the structure's own rate is used as given.
function orderAt(locationID, { price = 1000000, volume = 100 } = {}) {
  return {
    order_id: 900,
    location_id: locationID,
    price,
    volume_total: volume,
    issued: ISSUED,
    CharacterHash: "hash-1",
  };
}

const NPC_STATION = 60003760;
const CITADEL = 1035466617946;

describe("what listing an order costs", () => {
  it("charges the citadel's own rate outside NPC stations", async () => {
    const fee = await calcBrokersFee(orderAt(CITADEL), null, 1.5);

    // 1.5% of 100,000,000
    expect(fee).toBe(1500000);
  });

  // 3% base, less 0.3 per level of Broker Relations, less 0.03 per point of
  // faction standing and 0.02 per point of corporation standing.
  it("works an NPC station rate out from skills and standings", async () => {
    skills.data = { 3446: { activeLevel: 5 } };
    standings.data = [
      { from_id: stationData.race_id, standing: 5 },
      { from_id: stationData.owner, standing: 2.5 },
    ];

    const fee = await calcBrokersFee(orderAt(NPC_STATION), null, 1.5);

    // 3 − 1.5 − 0.15 − 0.05 = 1.3% of 100,000,000
    expect(fee).toBeCloseTo(1300000, 6);
  });

  it("charges the full 3% with no skill and no standings", async () => {
    skills.data = {};
    standings.data = [];

    const fee = await calcBrokersFee(orderAt(NPC_STATION), null, 1.5);

    expect(fee).toBeCloseTo(3000000, 6);
  });

  it("never charges less than the 100 ISK minimum", async () => {
    skills.data = { 3446: { activeLevel: 5 } };
    standings.data = [];

    const fee = await calcBrokersFee(
      orderAt(NPC_STATION, { price: 10, volume: 1 }),
      null,
      1.5,
    );

    expect(fee).toBe(100);
  });
});

describe("the fee that reaches the job", () => {
  function jobWithOrder(feeAmount, entries) {
    journal.data = entries ? { 2117000001: entries } : {};
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });
    const order = orderAt(CITADEL);
    job.addMarketOrder(order, findBrokersFeeEntry(order, feeAmount, null));
    return job;
  }

  it("records the worked-out amount, not the journal's", () => {
    // Multi-sell: one entry covering this order and others, so its amount is
    // not this order's fee.
    const job = jobWithOrder(1500000, [
      { id: 55, ref_type: "brokers_fee", date: ISSUED, amount: -9000000 },
    ]);

    expect(job.totalBrokersFees).toBe(1500000);
    expect(job.build.sale.brokersFee[0].id).toBe(55);
  });

  it("still records the fee when the journal has not caught up", () => {
    const job = jobWithOrder(1500000, null);

    expect(job.totalBrokersFees).toBe(1500000);
    expect(job.esiOrderIDs.has(900)).toBe(true);
    expect(job.build.sale.brokersFee[0].date).toBe(ISSUED);
  });

  it("carries the fee into the stored document", () => {
    const job = jobWithOrder(1500000, [
      { id: 55, ref_type: "brokers_fee", date: ISSUED },
    ]);

    expect(job.toDocument().build.sale.brokersFee).toEqual([
      { order_id: 900, id: 55, date: ISSUED, amount: 1500000 },
    ]);
  });
});

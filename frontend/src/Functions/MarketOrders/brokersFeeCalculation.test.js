import { toDocument } from "../Job/jobDocument.js";
import { totalBrokersFees } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../../tests/queryClients.js";

const CALDARI_RACE = 1;
const CALDARI_STATE = 500001;
const stationData = { race_id: CALDARI_RACE, owner: 1000035 };
const skills = { data: {} };
const standings = { data: [] };
const journal = { data: {} };

const ensureSellingRateInputs = vi.fn().mockResolvedValue(undefined);

vi.mock("../../Hooks/React Query/Character/useSellingRateInputs", () => ({
  ensureSellingRateInputs: (...args) => ensureSellingRateInputs(...args),
}));

vi.mock("../EveESI/World/getUniverseNames", () => ({
  default: async () => [
    { id: CALDARI_STATE, name: "Caldari State", category: "faction" },
  ],
}));
vi.mock("../EveESI/World/getRaces", () => ({
  default: async () => [
    { race_id: CALDARI_RACE, alliance_id: CALDARI_STATE, name: "Caldari" },
  ],
}));
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

const { default: calcSellingCharges } = await import("./calcSellingCharges.js");

const client = () => testQueryClient();
const { default: findBrokersFeeEntry } =
  await import("./findBrokersFeeEntry.js");
const { jobFromDocument } = await import("../Job/jobDocument.js");
const { addMarketOrder } =
  await import("../../Components/Edit Job/Edit Job Hooks/jobCommands.js");
const { esiOrderIDs } =
  await import("../../Components/Edit Job/Edit Job Hooks/jobSelectors.js");
const { jobAfterCommands } = await import("../../tests/jobAfterCommands.js");

const ISSUED = "2026-08-01T00:00:00Z";

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
    const { brokerFee: fee } = await calcSellingCharges(
      orderAt(CITADEL),
      client(),
      1.5,
    );

    expect(fee).toBe(1500000);
  });

  it("works an NPC station rate out from skills and standings", async () => {
    skills.data = { 3446: { activeLevel: 5 } };
    standings.data = [
      { from_id: CALDARI_STATE, from_type: "faction", standing: 5 },
      { from_id: stationData.owner, from_type: "npc_corp", standing: 2.5 },
    ];

    const { brokerFee: fee } = await calcSellingCharges(
      orderAt(NPC_STATION),
      client(),
      1.5,
    );

    expect(fee).toBeCloseTo(1300000, 6);
  });

  it("charges the full 3% with no skill and no standings", async () => {
    skills.data = {};
    standings.data = [];

    const { brokerFee: fee } = await calcSellingCharges(
      orderAt(NPC_STATION),
      client(),
      1.5,
    );

    expect(fee).toBeCloseTo(3000000, 6);
  });

  it("never charges less than the 100 ISK minimum", async () => {
    skills.data = { 3446: { activeLevel: 5 } };
    standings.data = [];

    const { brokerFee: fee } = await calcSellingCharges(
      orderAt(NPC_STATION, { price: 10, volume: 1 }),
      client(),
      1.5,
    );

    expect(fee).toBe(100);
  });
});

describe("the fee that reaches the job", () => {
  function jobWithOrder(feeAmount, entries) {
    journal.data = entries ? { 2117000001: entries } : {};
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });
    const order = orderAt(CITADEL);
    return jobAfterCommands(
      job,
      addMarketOrder(
        order,
        findBrokersFeeEntry(order, { brokerFee: feeAmount }, null),
      ),
    );
  }

  it("records the worked-out amount, not the journal's", () => {
    const job = jobWithOrder(1500000, [
      { id: 55, ref_type: "brokers_fee", date: ISSUED, amount: -9000000 },
    ]);

    expect(totalBrokersFees(job)).toBe(1500000);

    expect(job.esi.marketOrders["900"].fee).toBe(1500000);
    expect(job.esi.marketOrders["900"].feeDate).toBe(ISSUED);
  });

  it("still records the fee when the journal has not caught up", () => {
    const job = jobWithOrder(1500000, null);

    expect(totalBrokersFees(job)).toBe(1500000);
    expect(esiOrderIDs(toDocument(job)).has(900)).toBe(true);
    expect(job.esi.marketOrders["900"].feeDate).toBe(ISSUED);
  });

  it("carries the fee into the stored document", () => {
    const job = jobWithOrder(1500000, [
      { id: 55, ref_type: "brokers_fee", date: ISSUED },
    ]);

    const order = toDocument(job).esi.marketOrders["900"];
    expect(order.fee).toBe(1500000);
    expect(order.salesTax).toBe(0);
    expect(order.feeDate).toBe(ISSUED);
  });
});

describe("the constants selling costs are worked out from", () => {
  it("pins the published broker fee rates", async () => {
    const { brokerFeeRates } = await import("../../Context/defaultValues");

    expect(brokerFeeRates).toMatchObject({
      base: 3,
      brokerRelations: 0.3,
      factionStanding: 0.03,
      corporationStanding: 0.02,
      minimumFee: 100,
    });
  });

  it("pins the published sales tax rates", async () => {
    const { salesTaxRates } = await import("../../Context/defaultValues");

    expect(salesTaxRates).toMatchObject({ base: 7.5, accounting: 0.11 });

    expect(salesTaxRates.base * (1 - salesTaxRates.accounting * 5)).toBeCloseTo(
      3.375,
    );
  });

  it("resolves every market skill through the catalogue", async () => {
    const { marketSkillIDs } = await import("../../Context/defaultValues");
    const { default: catalogue } = await import("../../RawData/bpSkills.json");

    for (const [name, typeID] of Object.entries(marketSkillIDs)) {
      expect(catalogue[typeID], `${name} (${typeID}) missing`).toMatchObject({
        id: typeID,
      });
    }
  });
});

describe("the reads behind a stored fee", () => {
  it("makes sure the order's character is loaded before costing it", async () => {
    ensureSellingRateInputs.mockClear();

    await calcSellingCharges(orderAt(NPC_STATION), client(), 1.5);

    expect(ensureSellingRateInputs).toHaveBeenCalledWith(
      expect.anything(),
      "hash-1",
    );
  });

  it("loads the character for a citadel order too, since the tax needs it", async () => {
    ensureSellingRateInputs.mockClear();

    await calcSellingCharges(orderAt(CITADEL), client(), 1.5);

    expect(ensureSellingRateInputs).toHaveBeenCalled();
  });
});

describe("the tax worked out alongside the fee", () => {
  it("estimates the tax on what the order is worth", async () => {
    skills.data = {};

    const { salesTax } = await calcSellingCharges(
      orderAt(NPC_STATION),
      client(),
      1.5,
    );

    expect(salesTax).toBeCloseTo(7_500_000, 6);
  });

  it("brings the estimate down for a seller who has trained Accounting", async () => {
    skills.data = { 16622: { activeLevel: 5 } };

    const { salesTax } = await calcSellingCharges(
      orderAt(NPC_STATION),
      client(),
      1.5,
    );

    expect(salesTax).toBeCloseTo(3_375_000, 6);
  });

  it("taxes a citadel sale the same as a station one", async () => {
    skills.data = {};

    const station = await calcSellingCharges(
      orderAt(NPC_STATION),
      client(),
      1.5,
    );
    const citadel = await calcSellingCharges(orderAt(CITADEL), client(), 1.5);

    expect(citadel.salesTax).toBeCloseTo(station.salesTax, 6);
  });

  it("carries the estimate onto the stored row", async () => {
    skills.data = {};
    const order = orderAt(NPC_STATION);
    const charges = await calcSellingCharges(order, client(), 1.5);

    const row = findBrokersFeeEntry(order, charges, null);

    expect(row.salesTax).toBeCloseTo(7_500_000, 6);
    expect(row.amount).toBeCloseTo(charges.brokerFee, 6);
  });
});

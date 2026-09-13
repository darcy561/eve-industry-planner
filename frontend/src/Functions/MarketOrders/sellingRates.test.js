import { beforeEach, describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../../tests/queryClients.js";

// Jita 4-4 as ESI actually reports it: the station names the race that built it
// (Caldari, 1), not the faction the standing is held against (Caldari State,
// 500001). A fixture that conflates the two hides the lookup being wrong.
const CALDARI_RACE = 1;
const CALDARI_STATE = 500001;
const stationData = { race_id: CALDARI_RACE, owner: 1000035 };

const faction = (standing) => ({
  from_id: CALDARI_STATE,
  from_type: "faction",
  standing,
});
const corporation = (standing) => ({
  from_id: stationData.owner,
  from_type: "npc_corp",
  standing,
});
const skills = { data: {}, isLoading: false, isError: false };
const standings = { data: [], isLoading: false, isError: false };

let station = stationData;
vi.mock("../EveESI/World/getStationData", () => ({
  default: async () => station,
}));
// Named entities are cosmetic here; faked so the test makes no network call of
// its own and the naming failure below is the only one.
const getUniverseNames = vi.fn().mockResolvedValue([
  { id: CALDARI_STATE, name: "Caldari State", category: "faction" },
  { id: 1000035, name: "Caldari Navy", category: "corporation" },
]);

vi.mock("../EveESI/World/getUniverseNames", () => ({
  default: (...args) => getUniverseNames(...args),
}));
vi.mock("../EveESI/World/getRaces", () => ({
  default: async () => [
    { race_id: CALDARI_RACE, alliance_id: CALDARI_STATE, name: "Caldari" },
  ],
}));
vi.mock("../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  getCachedCharacterSkills: () => skills,
}));
vi.mock("../../Hooks/EveEsi/Character/useGetCharacterStandings", () => ({
  getCachedCharacterStandings: () => standings,
}));

const {
  brokerFeeAmount,
  brokerFeeRate,
  brokerFeeWorking,
  getSellerSkills,
  salesTaxAmount,
  salesTaxWorking,
} = await import("./sellingRates.js");
const { SALE_LOCATION_KIND, resolveSaleLocation, getDefaultSaleStructure } =
  await import("./saleLocations.js");

const HASH = "hash-1";

// A real client rather than a stub: the race lookup goes through React Query, so
// this exercises the query config as well as the fee arithmetic.
let client;
beforeEach(() => {
  client = testQueryClient();
});

function trained({ brokerRelations = 0, accounting = 0 } = {}) {
  skills.data = {
    3446: { activeLevel: brokerRelations },
    16622: { activeLevel: accounting },
  };
}

describe("broker fee rate", () => {
  it("is the base at a station for an untrained character with no standings", async () => {
    trained();
    standings.data = [];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(3);
  });

  it("comes down with Broker Relations and both standings", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(5), corporation(2.5)];

    // 3 − 0.3×5 − 0.03×5 − 0.02×2.5
    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(1.3);
  });

  it("reaches the published 1% floor at maximum skill and standings", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(10), corporation(10)];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(1);
  });

  it("rises above base when standings are negative", async () => {
    trained();
    standings.data = [faction(-10)];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeGreaterThan(3);
  });

  it("uses a citadel's own rate, untouched by Broker Relations", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(10)];
    const structure = getDefaultSaleStructure();

    const rate = await brokerFeeRate(
      resolveSaleLocation(structure.id),
      {},
      HASH,
    );

    expect(rate).toBe(structure.brokerFee);
  });

  it("charges a signed-out seller the base with no reduction", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(10)];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), {}, null),
    ).toBeCloseTo(3);
  });
});

describe("sales tax rate", () => {
  it("is the base for an untrained character", () => {
    trained();

    expect(salesTaxWorking(client, HASH).rate).toBeCloseTo(7.5);
  });

  it("comes down by a fraction of the base per Accounting level", () => {
    trained({ accounting: 5 });

    // Multiplicative: 7.5 × (1 − 0.11×5). Subtracting would give 6.95.
    expect(salesTaxWorking(client, HASH).rate).toBeCloseTo(3.375);
  });

  it("charges a signed-out seller the base", () => {
    trained({ accounting: 5 });

    expect(salesTaxWorking(client, null).rate).toBeCloseTo(7.5);
  });
});

describe("amounts", () => {
  it("takes the broker fee as a percentage of order value", () => {
    expect(brokerFeeAmount(1.3, 100_000_000)).toBeCloseTo(1_300_000);
  });

  it("never charges a broker fee below the floor", () => {
    expect(brokerFeeAmount(1.3, 1)).toBe(100);
  });

  it("takes sales tax as a percentage of sale value, with no floor", () => {
    expect(salesTaxAmount(3.375, 100_000_000)).toBeCloseTo(3_375_000);
    expect(salesTaxAmount(3.375, 1)).toBeLessThan(1);
  });
});

describe("seller skills", () => {
  it("reads both market skills off the cached map", () => {
    trained({ brokerRelations: 4, accounting: 2 });

    expect(getSellerSkills(client, HASH)).toMatchObject({
      brokerRelations: 4,
      accounting: 2,
    });
  });

  it("reads an untrained skill as level zero rather than undefined", () => {
    skills.data = {};

    expect(getSellerSkills(client, HASH)).toMatchObject({
      brokerRelations: 0,
      accounting: 0,
    });
  });
});

describe("the shape both stages share", () => {
  it("separates rate from amount so either stage can use either half", async () => {
    trained({ brokerRelations: 5, accounting: 5 });
    standings.data = [];
    const location = resolveSaleLocation(null, "jita");
    expect(location.kind).toBe(SALE_LOCATION_KIND.HUB);

    const value = 500_000_000;
    const fee = brokerFeeAmount(
      await brokerFeeRate(location, client, HASH),
      value,
    );
    const tax = salesTaxAmount(salesTaxWorking(client, HASH).rate, value);

    // 1.5% and 3.375% of the sale.
    expect(fee).toBeCloseTo(7_500_000);
    expect(tax).toBeCloseTo(16_875_000);
  });
});

// The station is read whether or not standings have resolved, as it was before the
// rate moved out of calcBrokersFee: a rate of base is the answer for a seller with
// no standings, not a reason to skip the lookup.
describe("standings that have not resolved", () => {
  it("still reads the station and charges the base rate", async () => {
    trained();
    standings.data = undefined;

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(3);
  });
});

// getStationData catches its own errors and resolves to null, so a failed lookup
// is indistinguishable from a station with no owner unless the rate reads through
// it. Quoting a fee from standings of zero would be plausible and wrong, and the
// Selling stage writes the fee it links into the job permanently.
describe("a station lookup that fails", () => {
  it("rejects rather than quoting a fee from standings it could not read", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(10)];
    station = null;

    await expect(
      brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).rejects.toThrow();

    station = stationData;
  });
});

// The station reports the race that built it and the standing is held against
// that race's faction, so the two ids are different and matching on the wrong
// one silently quotes every seller as having no faction standing at all.
describe("which standing a station's fee is reduced by", () => {
  it("finds the faction standing behind the station's race", async () => {
    trained({ brokerRelations: 0 });
    standings.data = [faction(10)];

    // 3% base less 0.03 × 10 of faction standing.
    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(2.7);
  });

  it("ignores a standing held against the race id itself", async () => {
    trained({ brokerRelations: 0 });
    standings.data = [
      { from_id: CALDARI_RACE, from_type: "faction", standing: 10 },
    ];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(3);
  });

  // A faction and an NPC corporation can carry the same id in different
  // categories, so the kind is part of the match.
  it("does not read a corporation standing as a faction one", async () => {
    trained({ brokerRelations: 0 });
    standings.data = [
      { from_id: CALDARI_STATE, from_type: "npc_corp", standing: 10 },
    ];

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(3);
  });

  it("charges the base where the race maps to no faction", async () => {
    trained({ brokerRelations: 0 });
    standings.data = [faction(10)];
    station = { race_id: 999, owner: stationData.owner };

    expect(
      await brokerFeeRate(resolveSaleLocation(null, "jita"), client, HASH),
    ).toBeCloseTo(3);

    station = stationData;
  });
});

// A standing that could not be read is not a standing of zero. Quoting the fee
// as though the seller had ground nothing anywhere is a claim about them the app
// has no basis for, and it is the reason a fee can look right and be wrong.
//
// The cache accessor hands back an empty list while loading and again after a
// failure, so the list itself cannot be inspected to tell the three apart — the
// query's own state has to be read.
describe("standings that could not be read", () => {
  const factionTerm = (working) =>
    working.terms.find((i) => i.id === "faction");

  it("says so while the read is still in flight", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [];
    standings.isLoading = true;

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    expect(factionTerm(working).unknown).toBe(true);
    standings.isLoading = false;
  });

  it("says so when the read failed", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [];
    standings.isError = new Error("403");

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    expect(factionTerm(working).unknown).toBe(true);
    standings.isError = false;
  });

  it("says so rather than reporting no standing", async () => {
    trained({ brokerRelations: 5 });
    standings.data = undefined;

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    const faction = working.terms.find((i) => i.id === "faction");
    const corporation = working.terms.find((i) => i.id === "corporation");

    expect(faction.unknown).toBe(true);
    expect(corporation.unknown).toBe(true);
  });

  it("marks nothing unknown once the standings are there", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [];

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    expect(working.terms.every((i) => !i.unknown)).toBe(true);
  });
});

// The list offers NPC stations as well as citadels, so a named hub has to be
// honoured as the choice it is.
describe("naming an NPC station as the sale location", () => {
  it("sells from the station chosen rather than the hub prices come from", () => {
    const location = resolveSaleLocation("amarr", "jita");

    expect(location.id).toBe("amarr");
    expect(location.feeStationID).toBe(60008494);
  });

  it("still falls back to the pricing hub when nothing is named", () => {
    expect(resolveSaleLocation(null, "amarr").id).toBe("amarr");
  });

  it("prefers a saved citadel of the same id", () => {
    const location = resolveSaleLocation("placeholder-sale-structure", "jita");

    expect(location.kind).toBe(SALE_LOCATION_KIND.STRUCTURE);
  });
});

// The same rule applies to the skills half: a level that could not be read is
// not level zero, and quoting the untrained rate says the seller has not trained
// something they may well have.
describe("skills that could not be read", () => {
  it("marks Broker Relations unknown rather than untrained", async () => {
    skills.isError = new Error("403");

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    expect(working.terms.find((i) => i.id === "brokerRelations").unknown).toBe(
      true,
    );
    skills.isError = false;
  });

  it("marks the sales tax working unknown too", () => {
    skills.isLoading = true;

    expect(salesTaxWorking(client, HASH).unknown).toBe(true);

    skills.isLoading = false;
  });

  it("marks nothing unknown once the levels are there", () => {
    trained({ accounting: 5 });

    expect(salesTaxWorking(client, HASH).unknown).toBe(false);
  });
});

// The names are there so a reader can check the answer. The figures are right
// without them, so a lookup that fails must not take the fee down with it.
describe("naming who a standing is with", () => {
  it("names the faction and the corporation behind the station", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(8), corporation(5)];

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    expect(working.terms.find((i) => i.id === "faction").entityName).toBe(
      "Caldari State",
    );
    expect(working.terms.find((i) => i.id === "corporation").entityName).toBe(
      "Caldari Navy",
    );
  });

  it("still quotes the fee when the names cannot be fetched", async () => {
    trained({ brokerRelations: 5 });
    standings.data = [faction(8), corporation(5)];
    // Not `once`: the query retries, and a single rejection would be recovered
    // from rather than surfacing the fallback this test is about.
    getUniverseNames.mockRejectedValue(new Error("ESI is down"));

    const working = await brokerFeeWorking(
      resolveSaleLocation(null, "jita"),
      client,
      HASH,
    );

    // 3 - 1.5 - 0.24 - 0.10, unchanged by the names being missing.
    expect(working.rate).toBeCloseTo(1.16);
    expect(working.terms.find((i) => i.id === "faction").entityName).toBeNull();

    getUniverseNames.mockResolvedValue([]);
  });
});

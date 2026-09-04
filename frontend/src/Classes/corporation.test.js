import { describe, expect, it } from "vitest";

import Corporation from "./corporation";

const OWNER = { corporation_id: 98000001, CharacterHash: "hash-1" };

function corporation(publicData = {}, divisions = {}) {
  return new Corporation(OWNER, publicData, divisions);
}

describe("a corporation built from what ESI returned", () => {
  it("takes its name, ticker, tax and alliance", () => {
    const corp = corporation({
      name: "Test Corp",
      ticker: "TEST",
      tax_rate: 0.1,
      alliance_id: 99000001,
    });

    expect(corp.corporation_id).toBe(98000001);
    expect(corp.corporationName).toBe("Test Corp");
    expect(corp.corporationTicker).toBe("TEST");
    expect(corp.corporationTaxRate).toBe(0.1);
    expect(corp.alliance_id).toBe(99000001);
  });

  it("stands in for public data it was not given", () => {
    const corp = corporation();

    expect(corp.corporationName).toBe("Unknown Corporation");
    expect(corp.corporationTicker).toBe("UNKNOWN");
    expect(corp.corporationTaxRate).toBe(0);
    expect(corp.alliance_id).toBeNull();
  });

  it("starts with the character it was built for as its only member", () => {
    expect(corporation().members).toEqual(["hash-1"]);
  });
});

// A hash is read the same way wherever it is compared: trimmed and lowercased.
// Adding, asking and removing have to agree, or a member added once can never
// be taken out — and a corporation is only dropped once its last member goes.
describe("the characters a corporation knows about", () => {
  it("adds a character once, however its hash is written", () => {
    const corp = corporation();

    corp.addMember("hash-2");
    corp.addMember("HASH-2");
    corp.addMember("  hash-2  ");

    expect(corp.members).toEqual(["hash-1", "hash-2"]);
  });

  it("answers whether it holds a character, however the hash is written", () => {
    const corp = corporation();

    expect(corp.hasMember("hash-1")).toBe(true);
    expect(corp.hasMember("HASH-1")).toBe(true);
    expect(corp.hasMember(" hash-1 ")).toBe(true);
    expect(corp.hasMember("hash-9")).toBe(false);
    expect(corp.hasMember("")).toBe(false);
  });

  it("removes a character however the hash is written", () => {
    const corp = corporation();
    corp.addMember("hash-2");

    corp.removeMember("HASH-1");
    corp.removeMember("  hash-2  ");

    expect(corp.members).toEqual([]);
  });

  it("ignores an empty hash rather than removing everything", () => {
    const corp = corporation();

    corp.removeMember("");
    corp.removeMember(null);
    corp.addMember(null);

    expect(corp.members).toEqual(["hash-1"]);
  });

  it("collapses duplicates a merge left behind", () => {
    const corp = corporation();
    corp.members = ["hash-1", "HASH-1", " hash-1 ", "hash-2", null];

    corp.dedupeMembers();

    expect(corp.members).toEqual(["hash-1", "hash-2"]);
  });
});

describe("where a corporation keeps things", () => {
  it("reads its offices from the assets that are office folders", () => {
    const corp = corporation();

    corp.addOfficeLocations([
      { location_flag: "OfficeFolder", location_id: 60003760 },
      { location_flag: "Hangar", location_id: 60008494 },
      { location_flag: "OfficeFolder", location_id: 1035466617946 },
    ]);

    expect(corp.officeLocations).toEqual([60003760, 1035466617946]);
  });

  // Assets arrive page by page, so the same office is reported more than once.
  it("keeps one entry per office as more assets arrive", () => {
    const corp = corporation();

    corp.addOfficeLocations([
      { location_flag: "OfficeFolder", location_id: 60003760 },
    ]);
    corp.addOfficeLocations([
      { location_flag: "OfficeFolder", location_id: 60003760 },
      { location_flag: "OfficeFolder", location_id: 60008494 },
    ]);

    expect(corp.officeLocations).toEqual([60003760, 60008494]);
  });

  it("gives every hangar division the reference its assets are filed under", () => {
    const corp = corporation(
      {},
      {
        hangar: [
          { division: 1, name: "Materials" },
          { division: 2, name: "Ships" },
        ],
      },
    );

    expect(corp.hangars).toEqual([
      { division: 1, name: "Materials", assetLocationRef: "CorpSAG1" },
      { division: 2, name: "Ships", assetLocationRef: "CorpSAG2" },
      {
        division: 0,
        name: "Projects",
        assetLocationRef: "CorporationGoalDeliveries",
      },
    ]);
  });

  it("still offers the projects division when there are no hangars", () => {
    expect(corporation().hangars).toHaveLength(1);
    expect(corporation().hangars[0].assetLocationRef).toBe(
      "CorporationGoalDeliveries",
    );
  });

  it("keeps the wallet divisions it was given", () => {
    const corp = corporation({}, { wallet: [{ division: 1, name: "Master" }] });

    expect(corp.wallets).toEqual([{ division: 1, name: "Master" }]);
    expect(corporation().wallets).toEqual([]);
  });
});

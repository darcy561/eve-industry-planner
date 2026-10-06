import { describe, expect, it } from "vitest";

import { facilityOf, sharedFacility } from "./setupFacility";

const setup = (id, overrides = {}) => ({
  id,
  jobType: 1,
  structureID: 1,
  systemTypeID: 0,
  systemID: 30000142,
  rigSlot1: 0,
  rigSlot2: 0,
  taxValue: 0.25,
  customStructureID: "",
  runCount: 9,
  ...overrides,
});

describe("facilityOf", () => {
  it("gives two setups at the same place the same key, whatever else differs", () => {
    expect(facilityOf(setup("a")).key).toBe(
      facilityOf(setup("b", { runCount: 714, selectedCharacter: "x" })).key,
    );
  });

  it("tells apart setups that differ in either rig slot or the tax", () => {
    const base = facilityOf(setup("a")).key;
    expect(facilityOf(setup("b", { rigSlot2: 43920 })).key).not.toBe(base);
    expect(facilityOf(setup("c", { taxValue: 1 })).key).not.toBe(base);
  });
});

describe("sharedFacility", () => {
  it("states the facility every setup shares and marks none as departing", () => {
    const setups = [setup("a"), setup("b"), setup("c")];
    const shared = sharedFacility(setups);

    expect(shared.sharedBy).toBe(3);
    expect(setups.filter(shared.departs)).toEqual([]);
  });

  it("takes the facility most setups use and marks the one that leaves it", () => {
    const away = setup("d", { systemID: 30002510 });
    const shared = sharedFacility([away, setup("a"), setup("b"), setup("c")]);

    expect(shared.sharedBy).toBe(3);
    expect(shared.facility.systemID).toBe(30000142);
    expect(shared.departs(away)).toBe(true);
  });

  it("settles a tie on the earliest setup", () => {
    const first = setup("a");
    const shared = sharedFacility([first, setup("b", { taxValue: 1 })]);

    expect(shared.departs(first)).toBe(false);
  });

  it("has nothing to state for a job with no setups", () => {
    expect(sharedFacility([])).toMatchObject({ facility: null, sharedBy: 0 });
  });
});

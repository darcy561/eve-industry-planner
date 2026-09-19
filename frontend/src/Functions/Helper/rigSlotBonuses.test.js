import { describe, expect, it } from "vitest";

import rigSlotBonuses from "./rigSlotBonuses";
import { jobTypes, rigTypeMap } from "../../Context/defaultValues";

describe("what two fitted rigs give", () => {
  it("reads nothing from two empty slots", () => {
    expect(rigSlotBonuses(jobTypes.manufacturing, 0, 0)).toEqual({
      material: 0,
      time: 0,
      cost: 0,
      value: 0,
    });
  });

  // The axes do not compete: a rig that only cuts time must not cost the
  // material bonus of the rig beside it.
  it("takes each axis from whichever rig is better at it", () => {
    const both = rigSlotBonuses(jobTypes.manufacturing, 2, 4);

    expect(both.material).toBe(2.4);
    expect(both.time).toBe(0.24);
  });

  it("reads two rigs of one purpose as the better of them", () => {
    expect(rigSlotBonuses(jobTypes.manufacturing, 1, 2).material).toBe(2.4);
    expect(rigSlotBonuses(jobTypes.manufacturing, 2, 1).material).toBe(2.4);
  });

  it("does not care which slot a rig sits in", () => {
    expect(rigSlotBonuses(jobTypes.manufacturing, 1, 4)).toEqual(
      rigSlotBonuses(jobTypes.manufacturing, 4, 1),
    );
  });

  it("reads the axes a kind actually uses", () => {
    // Invention rigs move cost and time; manufacturing's move material and time.
    const invention = rigSlotBonuses(jobTypes.invention, 2, 4);

    expect(invention.cost).toBe(0.24);
    expect(invention.time).toBe(0.12);
    expect(invention.material).toBe(0);
  });

  // Every rig that can be fitted today applies to all items, because which
  // items a stored rig helped was never recorded. When item-specific rigs land,
  // one must not be counted for an item it does not help — reading it needs to
  // know what is being built, which this does not.
  //
  // Nothing in the tree carries such a rig yet, so one is put in the real table
  // for the length of the test: a stand-in table here would pass even if the
  // function ignored the flag.
  it("counts only the rigs that help every item", () => {
    const table = rigTypeMap[jobTypes.manufacturing];
    const specificID = 991;
    table[specificID] = {
      id: specificID,
      label: "T2 - ME - Ships",
      material: 9,
      time: 9,
      relatedTo: [],
    };

    try {
      // Beside a generic rig, only the generic one is counted.
      const withGeneric = rigSlotBonuses(jobTypes.manufacturing, specificID, 2);
      expect(withGeneric.material).toBe(2.4);
      expect(withGeneric.time).toBe(0);

      // Alone, it contributes nothing yet.
      const alone = rigSlotBonuses(jobTypes.manufacturing, specificID, 0);
      expect(alone.material).toBe(0);
      expect(alone.time).toBe(0);
    } finally {
      delete table[specificID];
    }
  });

  it("reads an unknown kind or an unknown rig as nothing", () => {
    const zero = { material: 0, time: 0, cost: 0, value: 0 };

    expect(rigSlotBonuses(999, 1, 2)).toEqual(zero);
    expect(rigSlotBonuses(jobTypes.manufacturing, 404, 404)).toEqual(zero);
  });
});

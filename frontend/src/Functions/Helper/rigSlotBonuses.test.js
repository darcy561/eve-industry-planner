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
    const invention = rigSlotBonuses(jobTypes.invention, 2, 4);

    expect(invention.cost).toBe(0.24);
    expect(invention.time).toBe(0.12);
    expect(invention.material).toBe(0);
  });

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
      const withGeneric = rigSlotBonuses(jobTypes.manufacturing, specificID, 2);
      expect(withGeneric.material).toBe(2.4);
      expect(withGeneric.time).toBe(0);

      const alone = rigSlotBonuses(jobTypes.manufacturing, specificID, 0);
      expect(alone.material).toBe(0);
      expect(alone.time).toBe(0);
    } finally {
      delete table[specificID];
    }
  });

  it("gives what each combined entry gave, for manufacturing and reaction", () => {
    const combinations = [
      { was: "T1 - ME", slots: [1, 0], material: 2.0, time: 0 },
      { was: "T2 - ME", slots: [2, 0], material: 2.4, time: 0 },
      { was: "T1 - TE", slots: [3, 0], material: 0, time: 0.2 },
      { was: "T2 - TE", slots: [4, 0], material: 0, time: 0.24 },
      { was: "T1 - ME & TE", slots: [1, 3], material: 2.0, time: 0.2 },
      { was: "T2 - ME & TE", slots: [2, 4], material: 2.4, time: 0.24 },
      { was: "T1 - ME, T2 - TE", slots: [1, 4], material: 2.0, time: 0.24 },
      { was: "T2 - ME, T1 - TE", slots: [2, 3], material: 2.4, time: 0.2 },
    ];

    for (const jobType of [jobTypes.manufacturing, jobTypes.reaction]) {
      for (const { was, slots, material, time } of combinations) {
        const bonuses = rigSlotBonuses(jobType, slots[0], slots[1]);

        expect({ was, material: bonuses.material, time: bonuses.time }).toEqual(
          { was, material, time },
        );
      }
    }
  });

  it("keeps the faction rig whole", () => {
    const faction = rigSlotBonuses(jobTypes.manufacturing, 9, 0);

    expect(faction.material).toBe(3.7);
    expect(faction.time).toBe(0.2);
  });

  it("reads an unknown kind or an unknown rig as nothing", () => {
    const zero = { material: 0, time: 0, cost: 0, value: 0 };

    expect(rigSlotBonuses(999, 1, 2)).toEqual(zero);
    expect(rigSlotBonuses(jobTypes.manufacturing, 404, 404)).toEqual(zero);
  });
});

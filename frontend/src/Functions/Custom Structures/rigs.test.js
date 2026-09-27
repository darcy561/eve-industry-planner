import { describe, expect, it } from "vitest";

import {
  getRigInfoFromID,
  rigSlotBonuses,
  rigSlotLabel,
  rigsCompete,
} from "./rigs";
import { jobTypes, rigTypeMap } from "../../Context/defaultValues";

const kind = jobTypes.manufacturing;
const table = rigTypeMap[kind];

describe("reading one rig out of its kind's table", () => {
  it("finds every rig a kind carries", () => {
    for (const jobType of Object.values(jobTypes)) {
      const rigs = rigTypeMap[jobType];
      if (!rigs) continue;

      for (const id of Object.keys(rigs)) {
        expect(getRigInfoFromID(jobType, Number(id))).toBe(rigs[id]);
      }
    }
  });

  it("answers nothing for a kind or a rig it does not know", () => {
    expect(getRigInfoFromID(999, 1)).toBeNull();
    expect(getRigInfoFromID(kind, 4040)).toBeNull();
    expect(getRigInfoFromID(undefined, undefined)).toBeNull();
  });
});

describe("what two fitted rigs give", () => {
  it("reads nothing from two empty slots", () => {
    expect(rigSlotBonuses(kind, 0, 0)).toEqual({
      material: 0,
      time: 0,
      cost: 0,
      value: 0,
    });
  });

  it("takes each axis from whichever rig is better at it", () => {
    const both = rigSlotBonuses(kind, 2, 4);

    expect(both.material).toBe(2.4);
    expect(both.time).toBe(0.24);
  });

  it("reads two rigs of one purpose as the better of them", () => {
    expect(rigSlotBonuses(kind, 1, 2).material).toBe(2.4);
    expect(rigSlotBonuses(kind, 2, 1).material).toBe(2.4);
  });

  it("does not care which slot a rig sits in", () => {
    expect(rigSlotBonuses(kind, 1, 4)).toEqual(rigSlotBonuses(kind, 4, 1));
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
      const withGeneric = rigSlotBonuses(kind, specificID, 2);
      expect(withGeneric.material).toBe(2.4);
      expect(withGeneric.time).toBe(0);

      const alone = rigSlotBonuses(kind, specificID, 0);
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
    const faction = rigSlotBonuses(kind, 9, 0);

    expect(faction.material).toBe(3.7);
    expect(faction.time).toBe(0.2);
  });

  it("reads an unknown kind or an unknown rig as nothing", () => {
    const zero = { material: 0, time: 0, cost: 0, value: 0 };

    expect(rigSlotBonuses(999, 1, 2)).toEqual(zero);
    expect(rigSlotBonuses(kind, 404, 404)).toEqual(zero);
  });
});

describe("how a setup's rig slots read", () => {
  it("names both rigs when both slots are fitted", () => {
    expect(rigSlotLabel(kind, 1, 3)).toBe(
      `${table[1].label}, ${table[3].label}`,
    );
  });

  it("names only the rig that is fitted", () => {
    expect(rigSlotLabel(kind, 2, 0)).toBe(table[2].label);
    expect(rigSlotLabel(kind, 0, 2)).toBe(table[2].label);
  });

  it("reads as the empty entry's own label when neither slot is fitted", () => {
    expect(rigSlotLabel(kind, 0, 0)).toBe(table[0].label);
  });

  it("reads an unknown kind as None", () => {
    expect(rigSlotLabel(999, 1, 2)).toBe("None");
  });

  it("leaves out a slot holding a rig the table does not name", () => {
    expect(rigSlotLabel(kind, 2, 404)).toBe(table[2].label);
  });
});

describe("two rigs competing for the same purpose", () => {
  it("reads the same rig in both slots as competing", () => {
    expect(rigsCompete(table[2], 2)).toBe(true);
  });

  it("reads a rig that names the other as competing", () => {
    const other = table[2].relatedTo[0];

    expect(rigsCompete(table[2], other)).toBe(true);
  });

  it("reads rigs on different axes as not competing", () => {
    expect(rigsCompete(table[2], 4)).toBe(false);
  });

  it("reads an empty slot and an empty choice as not competing", () => {
    expect(rigsCompete(table[2], 0)).toBe(false);
    expect(rigsCompete(table[0], 2)).toBe(false);
    expect(rigsCompete(null, 2)).toBe(false);
  });
});

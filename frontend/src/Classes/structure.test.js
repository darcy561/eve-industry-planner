import { describe, expect, it } from "vitest";

import Structure from "./structure";
import { jobTypes, reprocessingItemTypes } from "../Context/defaultValues";
import GLOBAL_CONFIG from "../global-config-app";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

describe("what a kind carries", () => {
  it("gives manufacturing and reaction two rig slots and a system", () => {
    for (const jobType of [jobTypes.manufacturing, jobTypes.reaction]) {
      const structure = new Structure({ jobType });

      expect(structure.rigSlot1).toBe(0);
      expect(structure.rigSlot2).toBe(0);
      expect(structure.systemID).toBe(DEFAULT_SYSTEM);
      // The implant belongs to reprocessing alone.
      expect(structure.implant).toBeUndefined();
    }
  });

  it("gives reprocessing two rig slots and an implant, and no rig type", () => {
    const structure = new Structure({ jobType: jobTypes.reprocessing });

    expect(structure.rigSlot1).toBe(0);
    expect(structure.rigSlot2).toBe(0);
    expect(structure.implant).toBe(0);
    expect(structure.systemID).toBeUndefined();
  });

  it("gives invention two rig slots and no implant", () => {
    const structure = new Structure({ jobType: jobTypes.invention });

    expect(structure.rigSlot1).toBe(0);
    expect(structure.rigSlot2).toBe(0);
    expect(structure.implant).toBeUndefined();
  });

  // A row of a kind nothing knows about still reads: it carries what every kind
  // has and none of the optional fields.
  it("carries only the shared fields for an unknown kind", () => {
    const structure = new Structure({ jobType: 999, name: "Somewhere" });

    expect(structure.name).toBe("Somewhere");
    expect(structure.rigSlot1).toBeUndefined();
    expect(structure.toDocument()).toEqual({
      id: structure.id,
      jobType: 999,
      name: "Somewhere",
      systemType: 0,
      structureType: 0,
      tax: 0,
      default: false,
    });
  });
});

describe("the kind a row belongs to", () => {
  it("takes the kind from the row rather than the argument", () => {
    const structure = new Structure(
      { jobType: jobTypes.reprocessing },
      jobTypes.manufacturing,
    );

    expect(structure.jobType).toBe(jobTypes.reprocessing);
  });

  it("takes the kind from the argument for a new structure", () => {
    const structure = new Structure(undefined, jobTypes.reaction);

    expect(structure.jobType).toBe(jobTypes.reaction);
    expect(structure.id.startsWith("reacStruct-")).toBe(true);
  });

  it("mints an id carrying its kind's prefix", () => {
    for (const [jobType, prefix] of [
      [jobTypes.manufacturing, "manStruct-"],
      [jobTypes.reaction, "reacStruct-"],
      [jobTypes.reprocessing, "reprocessingStruct-"],
      [jobTypes.invention, "inventionStruct-"],
    ]) {
      expect(new Structure({ jobType }).id.startsWith(prefix)).toBe(true);
    }
  });

  // Stored ids are referenced from saved job setups, so one that arrives is kept
  // exactly as it is rather than minted again.
  it("keeps an id it was given", () => {
    const structure = new Structure({
      id: "manStruct-existing",
      jobType: jobTypes.manufacturing,
    });

    expect(structure.id).toBe("manStruct-existing");
  });
});

describe("settling what it is given", () => {
  it("reads a tax that is not a number as none, for every kind", () => {
    for (const jobType of [
      jobTypes.manufacturing,
      jobTypes.reaction,
      jobTypes.reprocessing,
      jobTypes.invention,
    ]) {
      expect(new Structure({ jobType, tax: "abc" }).tax).toBe(0);
      expect(new Structure({ jobType, tax: "" }).tax).toBe(0);
      expect(new Structure({ jobType }).tax).toBe(0);
      expect(new Structure({ jobType, tax: "2.5" }).tax).toBe(2.5);
    }
  });

  // Tax is a percentage across every kind: nothing stores a fraction, so a
  // consumer can divide by 100 without asking which kind it is holding.
  it("keeps tax as the percentage a reader typed, for every kind", () => {
    for (const jobType of [
      jobTypes.manufacturing,
      jobTypes.reaction,
      jobTypes.reprocessing,
      jobTypes.invention,
    ]) {
      expect(new Structure({ jobType, tax: 2.5 }).tax).toBe(2.5);
      expect(new Structure({ jobType, tax: 100 }).tax).toBe(100);
    }
  });

  it("reads a negative tax as none, for every kind", () => {
    for (const jobType of [
      jobTypes.manufacturing,
      jobTypes.reaction,
      jobTypes.reprocessing,
      jobTypes.invention,
    ]) {
      expect(new Structure({ jobType, tax: -1 }).tax).toBe(0);

      const structure = new Structure({ jobType });
      structure.setTax(-2.5);
      expect(structure.tax).toBe(0);
    }
  });

  it("settles a tax set after construction, for every kind", () => {
    for (const jobType of [
      jobTypes.manufacturing,
      jobTypes.reaction,
      jobTypes.reprocessing,
      jobTypes.invention,
    ]) {
      const structure = new Structure({ jobType });
      structure.setTax("abc");

      expect(structure.tax).toBe(0);
    }
  });

  it("falls back to the default system for a system id that is not a number", () => {
    const structure = new Structure({
      jobType: jobTypes.manufacturing,
      systemID: "",
    });

    expect(structure.systemID).toBe(DEFAULT_SYSTEM);
  });

  it("strips markup from a name", () => {
    const structure = new Structure({ jobType: jobTypes.manufacturing });
    structure.setName("<script>alert(1)</script>Home");

    expect(structure.name).toBe("Home");
  });
});

describe("reprocessing's own calculations", () => {
  it("gives an ore bonus to ore, moon ore and ice, and none to gas", () => {
    const structure = new Structure({
      jobType: jobTypes.reprocessing,
      structureType: 3,
    });

    for (const itemType of [
      reprocessingItemTypes.ore,
      reprocessingItemTypes.moonOre,
      reprocessingItemTypes.ice,
    ]) {
      expect(structure.structureBonusFor(itemType)).toBe(0.055);
    }
    expect(structure.structureBonusFor(reprocessingItemTypes.gas)).toBe(10);
  });

  it("gives no bonus at an NPC station", () => {
    const structure = new Structure({ jobType: jobTypes.reprocessing });

    expect(structure.structureBonusFor(reprocessingItemTypes.ore)).toBe(0);
  });

  it("takes the strongest rig that applies to the item", () => {
    const oreOnly = new Structure({
      jobType: jobTypes.reprocessing,
      rigSlot1: 1,
      rigSlot2: 0,
    });

    expect(oreOnly.rigBonusFor(reprocessingItemTypes.ore)).toBe(1);
    expect(oreOnly.rigBonusFor(reprocessingItemTypes.gas)).toBe(0);
  });

  // A caller holding a mixed list asks any row for a bonus without checking its
  // kind first, so a kind with no rig slots answers zero rather than throwing.
  // Manufacturing rigs carry no appliesTo, so they answer nothing to a question
  // about ore; they are read through rigBonuses instead.
  it("answers no reprocessing bonus for a manufacturing rig", () => {
    const manufacturing = new Structure({
      jobType: jobTypes.manufacturing,
      rigSlot1: 1,
    });

    expect(manufacturing.rigBonusFor(reprocessingItemTypes.ore)).toBe(0);
  });
});

describe("a document round trip", () => {
  it("keeps every kind's settings", () => {
    const rows = [
      {
        id: "manStruct-1",
        jobType: jobTypes.manufacturing,
        name: "Sotiyo",
        systemType: 2,
        structureType: 3,
        rigSlot1: 1,
        rigSlot2: 3,
        systemID: 30000142,
        tax: 1.5,
        default: true,
      },
      {
        id: "reprocessingStruct-1",
        jobType: jobTypes.reprocessing,
        name: "Home refinery",
        systemType: 2,
        structureType: 3,
        rigSlot1: 1,
        rigSlot2: 2,
        implant: 1,
        tax: 2.5,
        default: true,
      },
      {
        id: "inventionStruct-1",
        jobType: jobTypes.invention,
        name: "Raitaru",
        systemType: 1,
        structureType: 2,
        rigSlot1: 3,
        rigSlot2: 0,
        tax: 0.5,
        default: false,
      },
    ];

    for (const row of rows) {
      const document = new Structure(row).toDocument();

      expect(document).toEqual(row);
      expect(new Structure(document).toDocument()).toEqual(document);
    }
  });

  it("leaves out the fields its kind does not carry", () => {
    const document = new Structure({
      jobType: jobTypes.invention,
    }).toDocument();

    expect(document).not.toHaveProperty("implant");
    expect(document).not.toHaveProperty("systemID");
  });
});



// The old rig tables held ten pre-combined entries — "T1 - ME & TE" and the
// rest — where a structure really carries two rigs. These prove the two slots
// reproduce what each combined entry gave, which is what the stored-setup
// conversion relies on.
describe("rig slots against the combinations they replace", () => {
  // The combined id each pair stands for, and the bonuses that id carried.
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

  it("gives manufacturing what each combined entry gave", () => {
    for (const { was, slots, material, time } of combinations) {
      const structure = new Structure({
        jobType: jobTypes.manufacturing,
        rigSlot1: slots[0],
        rigSlot2: slots[1],
      });

      expect({ was, ...structure.rigBonuses }).toEqual({
        was,
        material,
        time,
        cost: 0,
        value: 0,
      });
    }
  });

  it("gives reaction what each combined entry gave", () => {
    for (const { was, slots, material, time } of combinations) {
      const structure = new Structure({
        jobType: jobTypes.reaction,
        rigSlot1: slots[0],
        rigSlot2: slots[1],
      });

      expect({ was, ...structure.rigBonuses }).toEqual({
        was,
        material,
        time,
        cost: 0,
        value: 0,
      });
    }
  });

  // Faction beat any T2 on material, so it never decomposed into two rigs and
  // stays one: a slot holds it whole.
  it("keeps the faction rig whole", () => {
    const structure = new Structure({
      jobType: jobTypes.manufacturing,
      rigSlot1: 9,
      rigSlot2: 0,
    });

    expect(structure.rigBonuses.material).toBe(3.7);
    expect(structure.rigBonuses.time).toBe(0.2);
  });

  // The axes are independent: a rig that only cuts time must not lose the
  // material bonus of the rig beside it, which is the whole point of taking
  // each axis separately rather than ranking the two rigs.
  it("takes each axis from whichever rig is better at it", () => {
    const structure = new Structure({
      jobType: jobTypes.manufacturing,
      rigSlot1: 2,
      rigSlot2: 4,
    });

    expect(structure.rigBonuses.material).toBe(2.4);
    expect(structure.rigBonuses.time).toBe(0.24);
  });

  it("reads two rigs of the same purpose as the better one", () => {
    const structure = new Structure({
      jobType: jobTypes.manufacturing,
      rigSlot1: 1,
      rigSlot2: 2,
    });

    expect(structure.rigBonuses.material).toBe(2.4);
    expect(structure.rigBonuses.time).toBe(0);
  });

  it("gives invention its own two axes", () => {
    // Cost optimisation in one slot, an accelerator in the other.
    const structure = new Structure({
      jobType: jobTypes.invention,
      rigSlot1: 2,
      rigSlot2: 4,
    });

    expect(structure.rigBonuses.time).toBe(0.12);
    expect(structure.rigBonuses.cost).toBe(0.24);
  });

  it("answers zeros for a kind with no rig slots", () => {
    const unknown = new Structure({ jobType: 999 });

    expect(unknown.rigBonuses).toEqual({
      material: 0,
      time: 0,
      cost: 0,
      value: 0,
    });
  });
});

import { describe, expect, it } from "vitest";

import Setup from "./jobSetup";
import { structureFromDocument } from "../Functions/Custom Structures/customStructure";
import { jobTypes, rigTypeMap } from "../Context/defaultValues";

const SAVED = structureFromDocument({
  id: "manStruct-1",
  jobType: jobTypes.manufacturing,
  structureType: 3,
  systemType: 2,
  rigSlot1: 1,
  rigSlot2: 3,
  systemID: 30000142,
  tax: 2.5,
});

const holding = (id) => rigTypeMap[jobTypes.manufacturing][id];

function setup(fields = {}) {
  return new Setup({ jobType: jobTypes.manufacturing, ...fields });
}

describe("pointing a setup at a saved structure", () => {
  it("takes every field the structure decides", () => {
    const built = setup();

    built.updateCustomStructureID(SAVED.id, () => SAVED);

    expect(built.customStructureID).toBe(SAVED.id);
    expect(built.structureID).toBe(3);
    expect(built.rigSlot1).toBe(1);
    expect(built.rigSlot2).toBe(3);
    expect(built.systemTypeID).toBe(2);
    expect(built.systemID).toBe(30000142);
    expect(built.taxValue).toBe(2.5);
  });

  it("clears the reference without disturbing what it was built with", () => {
    const built = setup({ structureID: 3, rigSlot1: 1 });
    built.updateCustomStructureID(SAVED.id, () => SAVED);

    built.updateCustomStructureID("", () => SAVED);

    expect(built.customStructureID).toBe("");
    expect(built.structureID).toBe(3);
    expect(built.rigSlot1).toBe(1);
  });

  it("changes nothing when the id names no saved structure", () => {
    const built = setup();

    built.updateCustomStructureID("gone", () => null);

    expect(built.customStructureID).toBe("");
    expect(built.structureID).toBe(0);
  });
});

describe("fitting a rig to one of a setup's two slots", () => {
  it("fits the slot it was asked for and leaves the other", () => {
    const built = setup({ rigSlot1: 1 });

    built.updateRigSlot("rigSlot2", holding(3));

    expect(built.rigSlot1).toBe(1);
    expect(built.rigSlot2).toBe(3);
  });

  it("fits the first slot through the older call too", () => {
    const built = setup();

    built.updateRigID(holding(2));

    expect(built.rigSlot1).toBe(2);
    expect(built.rigSlot2).toBe(0);
  });

  it("sets only the slot it was given when a rig is fitted", () => {
    const built = setup({ rigSlot2: 3 });

    built.updateRigSlot("rigSlot1", rigTypeMap[jobTypes.manufacturing][9]);

    expect(built.rigSlot1).toBe(9);
    expect(built.rigSlot2).toBe(3);
  });

  it("fits a rig the game publishes, which carries no flat figure", () => {
    const published = {
      id: 46633,
      label: "Asteroid Ore Grading Processor I",
      groupID: 1941,
      bonuses: [{ activity: "reprocessing", axis: "value", value: 1 }],
    };
    const built = setup();

    built.updateRigSlot("rigSlot1", published);

    expect(built.rigSlot1).toBe(46633);
  });

  it("ignores something that is not a rig", () => {
    const built = setup({ rigSlot1: 1 });

    built.updateRigSlot("rigSlot1", { id: 99 });
    built.updateRigSlot("rigSlot1", null);

    expect(built.rigSlot1).toBe(1);
  });
});

describe("what a setup stores about its structure", () => {
  it("round trips both rig slots and the reference", () => {
    const built = setup();
    built.updateCustomStructureID(SAVED.id, () => SAVED);

    const document = built.toDocument();

    expect(document.rigSlot1).toBe(1);
    expect(document.rigSlot2).toBe(3);
    expect(document.customStructureID).toBe(SAVED.id);
    expect(new Setup(document).toDocument()).toEqual(document);
  });
});

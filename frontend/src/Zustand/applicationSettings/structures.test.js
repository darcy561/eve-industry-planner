import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";

import { structureActions } from "./structures.js";
import { coreActions, stateDefault } from "./core.js";
import { jobTypes, structureKinds } from "../../Context/defaultValues";
import { structureFromDocument } from "../../Functions/Custom Structures/customStructure";

let store;
const saved = () => store.getState().applicationSettings.customStructures;
const act = () => store.getState().actions;

function structure(id, jobType, extra = {}) {
  return { id, jobType, name: id, default: false, ...extra };
}

beforeEach(() => {
  store = create((set, get) => ({
    applicationSettings: { customStructures: [], other: "left alone" },
    actions: structureActions(set, get),
  }));
});

describe("finding a saved structure", () => {
  beforeEach(() => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));
    act().addCustomStructure(structure("reac-1", jobTypes.reaction));
  });

  it("finds one by id without being told its kind", () => {
    expect(act().getCustomStructureWithID("reac-1").id).toBe("reac-1");
  });

  it("answers nothing for an id it does not hold, or for no id", () => {
    expect(act().getCustomStructureWithID("gone")).toBeNull();
    expect(act().getCustomStructureWithID("")).toBeNull();
    expect(act().getCustomStructureWithID(undefined)).toBeNull();
  });

  it("answers a kind's default, falling back to its first when none is flagged", () => {
    expect(
      act().getDefaultCustomStructureWithJobType(jobTypes.reaction).id,
    ).toBe("reac-1");
    expect(
      act().getDefaultCustomStructureWithJobType(jobTypes.invention),
    ).toBeNull();
  });
});

describe("adding a structure", () => {
  it("makes the first of its kind that kind's default", () => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));

    expect(saved()[0].default).toBe(true);
  });

  it("leaves a later one of the same kind undefaulted", () => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));
    act().addCustomStructure(structure("man-2", jobTypes.manufacturing));

    expect(saved().map((row) => row.default)).toEqual([true, false]);
  });

  it("counts first-of-kind per kind, not across the whole list", () => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));
    act().addCustomStructure(structure("reac-1", jobTypes.reaction));

    expect(saved().every((row) => row.default)).toBe(true);
  });

  it("does not change the structure it was handed", () => {
    const handed = structure("man-1", jobTypes.manufacturing);

    act().addCustomStructure(handed);

    expect(handed.default).toBe(false);
    expect(saved()[0]).not.toBe(handed);
  });

  it("leaves the rest of the settings alone", () => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));

    expect(store.getState().applicationSettings.other).toBe("left alone");
  });
});

describe("choosing a kind's default", () => {
  beforeEach(() => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));
    act().addCustomStructure(structure("man-2", jobTypes.manufacturing));
    act().addCustomStructure(structure("reac-1", jobTypes.reaction));
  });

  it("moves the flag within the kind", () => {
    act().setDefaultCustomStructure("man-2");

    expect(
      saved()
        .filter((row) => row.default)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["man-2", "reac-1"]);
  });

  it("leaves another kind's default alone", () => {
    act().setDefaultCustomStructure("man-2");

    expect(
      act().getDefaultCustomStructureWithJobType(jobTypes.reaction).id,
    ).toBe("reac-1");
  });

  it("replaces the rows it reflags rather than editing them", () => {
    const before = saved();

    act().setDefaultCustomStructure("man-2");

    expect(before.find((row) => row.id === "man-1").default).toBe(true);
    expect(act().getCustomStructureWithID("man-1").default).toBe(false);
  });
});

describe("deleting a structure", () => {
  beforeEach(() => {
    act().addCustomStructure(structure("man-1", jobTypes.manufacturing));
    act().addCustomStructure(structure("man-2", jobTypes.manufacturing));
    act().addCustomStructure(structure("reac-1", jobTypes.reaction));
  });

  it("takes only that structure out", () => {
    act().deleteCustomStructure("man-2");

    expect(saved().map((row) => row.id)).toEqual(["man-1", "reac-1"]);
  });

  it("promotes the kind's own first survivor when the default goes", () => {
    act().deleteCustomStructure("man-1");

    expect(
      act().getDefaultCustomStructureWithJobType(jobTypes.manufacturing).id,
    ).toBe("man-2");
  });

  it("promotes nobody when what went was not the default", () => {
    act().deleteCustomStructure("man-2");

    expect(act().getCustomStructureWithID("man-1").default).toBe(true);
  });

  it("leaves another kind's default alone when a kind is emptied", () => {
    act().deleteCustomStructure("reac-1");

    expect(
      act().getDefaultCustomStructureWithJobType(jobTypes.reaction),
    ).toBeNull();
    expect(act().getCustomStructureWithID("man-1").default).toBe(true);
  });
});

describe("what the settings document carries about a reader's structures", () => {
  let full;
  const persisted = () =>
    full.getState().applicationSettings.actions.toPersistPayload()
      .customStructures;

  beforeEach(() => {
    full = create((set, get) => ({
      applicationSettings: {
        ...stateDefault(),
        actions: { ...coreActions(set, get), ...structureActions(set, get) },
      },
    }));
  });

  const add = (row) =>
    full
      .getState()
      .applicationSettings.actions.addCustomStructure(
        structureFromDocument(row),
      );

  it("stores a structure of each kind with the fields that kind carries", () => {
    add({
      id: "man-1",
      jobType: jobTypes.manufacturing,
      name: "Sotiyo",
      tax: 1.5,
    });
    add({
      id: "rep-1",
      jobType: jobTypes.reprocessing,
      name: "Athanor",
      implant: 1,
    });

    expect(persisted()).toEqual([
      {
        id: "man-1",
        jobType: jobTypes.manufacturing,
        name: "Sotiyo",
        default: true,
        systemType: 0,
        structureType: 0,
        tax: 1.5,
        rigSlot1: 0,
        rigSlot2: 0,
        systemID: 30000142,
      },
      {
        id: "rep-1",
        jobType: jobTypes.reprocessing,
        name: "Athanor",
        default: true,
        systemType: 0,
        structureType: 0,
        tax: 0,
        rigSlot1: 0,
        rigSlot2: 0,
        implant: 1,
      },
    ]);
  });

  it("carries the default flag the store decided, not the one it was handed", () => {
    add({ id: "man-1", jobType: jobTypes.manufacturing, default: false });

    expect(persisted()[0].default).toBe(true);
  });

  it("stores a kind with no optional fields as the shared fields alone", () => {
    add({ id: "market-1", jobType: structureKinds.market, name: "Jita" });

    expect(Object.keys(persisted()[0]).sort()).toEqual([
      "default",
      "id",
      "jobType",
      "name",
    ]);
  });

  it("drops a deleted structure from the document", () => {
    add({ id: "man-1", jobType: jobTypes.manufacturing });
    add({ id: "man-2", jobType: jobTypes.manufacturing });

    full.getState().applicationSettings.actions.deleteCustomStructure("man-1");

    expect(persisted().map((row) => row.id)).toEqual(["man-2"]);
    expect(persisted()[0].default).toBe(true);
  });
});

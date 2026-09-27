import { describe, expect, it } from "vitest";

import {
  fieldsForKind,
  structureFromDocument,
  structureToDocument,
  updateStructure,
} from "./customStructure";
import { jobTypes, structureKinds } from "../../Context/defaultValues";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

const buildKinds = [
  jobTypes.manufacturing,
  jobTypes.reaction,
  jobTypes.reprocessing,
  jobTypes.invention,
];

describe("what a kind carries", () => {
  it("gives manufacturing and reaction two rig slots and a system", () => {
    for (const jobType of [jobTypes.manufacturing, jobTypes.reaction]) {
      const structure = structureFromDocument({ jobType });

      expect(structure.rigSlot1).toBe(0);
      expect(structure.rigSlot2).toBe(0);
      expect(structure.systemID).toBe(DEFAULT_SYSTEM);
      expect(structure.implant).toBeUndefined();
    }
  });

  it("gives reprocessing two rig slots and an implant, and no system", () => {
    const structure = structureFromDocument({ jobType: jobTypes.reprocessing });

    expect(structure.rigSlot1).toBe(0);
    expect(structure.rigSlot2).toBe(0);
    expect(structure.implant).toBe(0);
    expect(structure.systemID).toBeUndefined();
  });

  it("gives invention two rig slots and no implant", () => {
    const structure = structureFromDocument({ jobType: jobTypes.invention });

    expect(structure.rigSlot1).toBe(0);
    expect(structure.rigSlot2).toBe(0);
    expect(structure.implant).toBeUndefined();
  });

  it("carries only the shared fields for an unknown kind", () => {
    const structure = structureFromDocument({
      jobType: 999,
      name: "Somewhere",
    });

    expect(structure.name).toBe("Somewhere");
    expect(structure.rigSlot1).toBeUndefined();
    expect(structureToDocument(structure)).toEqual({
      id: structure.id,
      jobType: 999,
      name: "Somewhere",
      default: false,
    });
  });

  it("answers no optional fields for a kind it does not know", () => {
    expect(fieldsForKind(999)).toEqual({});
    expect(fieldsForKind(undefined)).toEqual({});
  });
});

describe("the kind a row belongs to", () => {
  it("takes the kind from the row rather than the argument", () => {
    const structure = structureFromDocument(
      { jobType: jobTypes.reprocessing },
      jobTypes.manufacturing,
    );

    expect(structure.jobType).toBe(jobTypes.reprocessing);
  });

  it("takes the kind from the argument for a new structure", () => {
    const structure = structureFromDocument(undefined, jobTypes.reaction);

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
      expect(structureFromDocument({ jobType }).id.startsWith(prefix)).toBe(
        true,
      );
    }
  });

  it("keeps an id it was given", () => {
    const structure = structureFromDocument({
      id: "manStruct-existing",
      jobType: jobTypes.manufacturing,
    });

    expect(structure.id).toBe("manStruct-existing");
  });
});

describe("settling what it is given", () => {
  it("reads a tax that is not a number as none, for every kind", () => {
    for (const jobType of buildKinds) {
      expect(structureFromDocument({ jobType, tax: "abc" }).tax).toBe(0);
      expect(structureFromDocument({ jobType, tax: "" }).tax).toBe(0);
      expect(structureFromDocument({ jobType }).tax).toBe(0);
      expect(structureFromDocument({ jobType, tax: "2.5" }).tax).toBe(2.5);
    }
  });

  it("keeps tax as the percentage a reader typed, for every kind", () => {
    for (const jobType of buildKinds) {
      expect(structureFromDocument({ jobType, tax: 2.5 }).tax).toBe(2.5);
      expect(structureFromDocument({ jobType, tax: 100 }).tax).toBe(100);
    }
  });

  it("reads a negative tax as none, for every kind", () => {
    for (const jobType of buildKinds) {
      expect(structureFromDocument({ jobType, tax: -1 }).tax).toBe(0);

      const structure = structureFromDocument({ jobType });
      expect(updateStructure(structure, { tax: -2.5 }).tax).toBe(0);
    }
  });

  it("settles a tax changed after it was read, for every kind", () => {
    for (const jobType of buildKinds) {
      const structure = structureFromDocument({ jobType });

      expect(updateStructure(structure, { tax: "abc" }).tax).toBe(0);
    }
  });

  it("falls back to the default system for a system id that is not a number", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.manufacturing,
      systemID: "",
    });

    expect(structure.systemID).toBe(DEFAULT_SYSTEM);
    expect(updateStructure(structure, { systemID: "abc" }).systemID).toBe(
      DEFAULT_SYSTEM,
    );
  });

  it("strips markup from a name", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.manufacturing,
    });

    expect(
      updateStructure(structure, { name: "<script>alert(1)</script>Home" })
        .name,
    ).toBe("Home");
  });

  it("leaves a field it was not given alone", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.manufacturing,
      name: "Sotiyo",
      tax: 2.5,
    });

    const changed = updateStructure(structure, { structureType: 3 });

    expect(changed.name).toBe("Sotiyo");
    expect(changed.tax).toBe(2.5);
    expect(changed.structureType).toBe(3);
  });

  it("returns a new structure rather than changing the one it was given", () => {
    const structure = structureFromDocument({
      jobType: jobTypes.manufacturing,
      structureType: 3,
    });

    const changed = updateStructure(structure, { structureType: 4 });

    expect(changed).not.toBe(structure);
    expect(structure.structureType).toBe(3);
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
      const document = structureToDocument(structureFromDocument(row));

      expect(document).toEqual(row);
      expect(structureToDocument(structureFromDocument(document))).toEqual(
        document,
      );
    }
  });

  it("leaves out the fields its kind does not carry", () => {
    const document = structureToDocument(
      structureFromDocument({ jobType: jobTypes.invention }),
    );

    expect(document).not.toHaveProperty("implant");
    expect(document).not.toHaveProperty("systemID");
  });
});

describe("what a structure holds matches what it stores", () => {
  it("gives a market none of the build fields in memory either", () => {
    const structure = structureFromDocument({
      jobType: structureKinds.market,
      tax: 2.5,
      systemType: 1,
    });

    expect(structure.tax).toBeUndefined();
    expect(structure.systemType).toBeUndefined();
    expect(structure.structureType).toBeUndefined();
  });

  it("stores exactly the fields its kind carries, for every kind", () => {
    for (const jobType of Object.values(structureKinds)) {
      const structure = structureFromDocument({ jobType });
      const document = structureToDocument(structure);

      expect(Object.keys(document).sort()).toEqual(
        Object.keys(structure).sort(),
      );
      for (const key of Object.keys(document)) {
        expect(structure[key]).toBe(document[key]);
      }
    }
  });
});

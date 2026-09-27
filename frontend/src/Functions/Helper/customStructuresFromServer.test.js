import { describe, expect, it } from "vitest";

import customStructuresFromServer from "./customStructuresFromServer";
import { structureFromDocument } from "../Structure/customStructure";
import { jobTypes } from "../../Context/defaultValues";

describe("reading the structures a settings document holds", () => {
  it("reads one array of rows", () => {
    const structures = customStructuresFromServer([
      { id: "manStruct-1", jobType: jobTypes.manufacturing, name: "Sotiyo" },
      { id: "reprocessingStruct-1", jobType: jobTypes.reprocessing },
    ]);

    expect(structures).toHaveLength(2);
    expect(structures[0].name).toBe("Sotiyo");
    expect(structures[1].jobType).toBe(jobTypes.reprocessing);
  });

  // The shape documents were written in before a row's own jobType was what
  // said which kind it is.
  it("reads the four lists, stamping each row with its list's kind", () => {
    const structures = customStructuresFromServer({
      manufacturing: [{ id: "manStruct-1" }],
      reaction: [{ id: "reacStruct-1" }],
      reprocessing: [{ id: "reprocessingStruct-1", rigSlot1: 7 }],
      invention: [{ id: "inventionStruct-1" }],
    });

    expect(structures).toHaveLength(4);

    const byID = Object.fromEntries(structures.map((s) => [s.id, s]));
    expect(byID["manStruct-1"].jobType).toBe(jobTypes.manufacturing);
    expect(byID["reacStruct-1"].jobType).toBe(jobTypes.reaction);
    expect(byID["reprocessingStruct-1"].jobType).toBe(jobTypes.reprocessing);
    expect(byID["inventionStruct-1"].jobType).toBe(jobTypes.invention);
    expect(byID["reprocessingStruct-1"].rigSlot1).toBe(7);
  });

  // The row is the thing that says what it is; a misfiled row must not be
  // relabelled by the list it was found in. This matches the server's fold.
  it("keeps a kind the row already names", () => {
    const structures = customStructuresFromServer({
      manufacturing: [{ id: "s-1", jobType: jobTypes.reaction }],
    });

    expect(structures[0].jobType).toBe(jobTypes.reaction);
  });

  // A stored zero is a row that named nothing, not a row of job type zero — the
  // same reading the server's fold takes.
  it("treats a stored zero as unnamed and takes the list's kind", () => {
    const structures = customStructuresFromServer({
      reprocessing: [{ id: "s-1", jobType: 0 }],
    });

    expect(structures[0].jobType).toBe(jobTypes.reprocessing);
  });

  // Rows are held in the store and read by screens, so they carry data and no
  // behaviour: a row a screen copies with a spread must lose nothing.
  it("builds rows as plain data, settled for their kind", () => {
    for (const incoming of [
      [{ id: "s-1", jobType: jobTypes.reprocessing }],
      { reprocessing: [{ id: "s-1" }] },
    ]) {
      const [structure] = customStructuresFromServer(incoming);

      expect(Object.getPrototypeOf(structure)).toBe(Object.prototype);
      expect(structure).toEqual(
        structureFromDocument({
          id: "s-1",
          jobType: jobTypes.reprocessing,
        }),
      );
    }
  });

  it("reads nothing as no structures", () => {
    for (const incoming of [null, undefined, [], {}, "nonsense", 7]) {
      expect(customStructuresFromServer(incoming)).toEqual([]);
    }
  });

  it("ignores a list that is not one", () => {
    const structures = customStructuresFromServer({
      manufacturing: [{ id: "s-1" }],
      reaction: "not a list",
    });

    expect(structures).toHaveLength(1);
  });

  it("settles what each row carries", () => {
    const [structure] = customStructuresFromServer([
      { id: "s-1", jobType: jobTypes.invention, tax: "abc" },
    ]);

    expect(structure.tax).toBe(0);
  });
});

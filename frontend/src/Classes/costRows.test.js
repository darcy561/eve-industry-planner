import { describe, expect, it } from "vitest";

import ExtraCost from "./extraCost";
import InventionEntry from "./inventionEntry";
import Job from "./job";

describe("ExtraCost", () => {
  // Rows have been written with the category missing, empty, or as a number,
  // and the document and the backend both hold a string.
  it("settles the category as the row is built", () => {
    expect(new ExtraCost({ category: 3 }).category).toBe("3");
    expect(new ExtraCost({ category: "3" }).category).toBe("3");
    expect(new ExtraCost({ category: "" }).category).toBe("0");
    expect(new ExtraCost({ category: null }).category).toBe("0");
    expect(new ExtraCost({}).category).toBe("0");
  });

  it("says whether it was filed under a category", () => {
    expect(new ExtraCost({ category: 3 }).isCategorised).toBe(true);
    expect(new ExtraCost({}).isCategorised).toBe(false);
  });

  it("reads its label from the text typed against it", () => {
    expect(new ExtraCost({ extraText: "Courier" }).label).toBe("Courier");
    expect(new ExtraCost({}).label).toBe("");
  });

  // The name a category had when the cost was added travels with it: the id
  // alone only means something against the account's settings list, and a
  // category deleted from there leaves the row naming an id nobody can read.
  it("carries the category label it was given", () => {
    const row = new ExtraCost({
      id: "extra-1",
      category: "90",
      categoryLabel: "Retired Courier Contract",
      extraText: "courier",
      extraValue: 5,
    });

    expect(row.categoryLabel).toBe("Retired Courier Contract");
    expect(row.toDocument().categoryLabel).toBe("Retired Courier Contract");
  });

  it("keeps every stored key on the way out", () => {
    const row = {
      id: "extra-1",
      category: "3",
      categoryLabel: "Blueprint Copies",
      extraText: "Courier",
      extraValue: 1500000,
    };

    expect(new ExtraCost(row).toDocument()).toEqual(row);
  });

  it("writes a settled category for a row that has none", () => {
    expect(new ExtraCost({ id: "extra-1", extraValue: 10 }).toDocument()).toEqual({
      id: "extra-1",
      category: "0",
      categoryLabel: "",
      extraText: "",
      extraValue: 10,
    });
  });
});

describe("InventionEntry", () => {
  it("records what invention consumed and what it cost", () => {
    const entry = InventionEntry.forItem("Datacore - Mechanical Engineering", 125000);

    expect(entry.itemName).toBe("Datacore - Mechanical Engineering");
    expect(entry.itemCost).toBe(125000);
    expect(Number.isSafeInteger(entry.id)).toBe(true);
  });

  it("keeps every stored key on the way out", () => {
    const row = { id: 1788510923210, itemName: "Datacore", itemCost: 125000 };

    expect(new InventionEntry(row).toDocument()).toEqual(row);
  });

  it("reads a row with nothing recorded as costing nothing", () => {
    const entry = new InventionEntry({});

    expect(entry.itemCost).toBe(0);
    expect(entry.itemName).toBe("");
    expect(entry.id).toBeNull();
  });
});

describe("invention entries on a job", () => {
  function job(entries) {
    return new Job({
      jobID: "job-1",
      itemID: 587,
      jobType: 1,
      name: "Oxygen Fuel Block",
      build: { costs: { inventionEntries: entries } },
    });
  }

  it("holds stored entries as rows and totals what invention cost", () => {
    const activeJob = job([
      { id: 1, itemName: "Datacore", itemCost: 125000 },
      { id: 2, itemName: "Decryptor", itemCost: 400000 },
    ]);

    expect(activeJob.build.costs.inventionEntries[0]).toBeInstanceOf(
      InventionEntry,
    );
    expect(activeJob.totalInventionCost).toBe(525000);
  });

  it("takes an entry added by hand and writes it back unchanged", () => {
    const activeJob = job([]);

    activeJob.addInventionCost(InventionEntry.forItem("Datacore", 125000));
    activeJob.addInventionCost({ id: 7, itemName: "Decryptor", itemCost: 400000 });

    expect(activeJob.build.costs.inventionEntries).toHaveLength(2);
    expect(activeJob.totalInventionCost).toBe(525000);
    // Whatever a caller hands over becomes a row of its own class.
    expect(activeJob.build.costs.inventionEntries[1]).toBeInstanceOf(
      InventionEntry,
    );

    const document = activeJob.toDocument();
    expect(document.build.costs.inventionEntries[1]).toEqual({
      id: 7,
      itemName: "Decryptor",
      itemCost: 400000,
    });

    expect(new Job(document).totalInventionCost).toBe(525000);
  });

  it("removes an entry by its id", () => {
    const activeJob = job([
      { id: 1, itemName: "Datacore", itemCost: 125000 },
      { id: 2, itemName: "Decryptor", itemCost: 400000 },
    ]);

    activeJob.removeInventionCost({ id: 1 });

    expect(activeJob.totalInventionCost).toBe(400000);
  });
});

describe("extra costs on a job", () => {
  function job(extras) {
    return new Job({
      jobID: "job-1",
      itemID: 587,
      jobType: 1,
      name: "Oxygen Fuel Block",
      build: { costs: { extrasCosts: extras } },
    });
  }

  it("holds stored rows as extras and totals what they cost", () => {
    const activeJob = job([
      { id: "extra-1", category: "3", extraText: "Courier", extraValue: 1500000 },
      { id: "extra-2", category: 0, extraText: "", extraValue: 250000 },
    ]);

    expect(activeJob.build.costs.extrasCosts[0]).toBeInstanceOf(ExtraCost);
    expect(activeJob.totalExtrasCost).toBe(1750000);
  });

  // A row can arrive with its category numeric or missing, whether it is being
  // read from a document or added by hand.
  it("settles a numeric or missing category on the way through", () => {
    const activeJob = job([
      { id: "extra-1", category: 3, extraText: "Courier", extraValue: 10 },
    ]);

    activeJob.addExtrasCost({ id: "extra-2", extraValue: 5 });

    const document = activeJob.toDocument();
    expect(document.build.costs.extrasCosts).toEqual([
      { id: "extra-1", category: "3", categoryLabel: "", extraText: "Courier", extraValue: 10 },
      { id: "extra-2", category: "0", categoryLabel: "", extraText: "", extraValue: 5 },
    ]);
    expect(new Job(document).totalExtrasCost).toBe(15);
  });

  it("removes a row by its id", () => {
    const activeJob = job([
      { id: "extra-1", category: "3", extraText: "Courier", extraValue: 1500000 },
      { id: "extra-2", category: "0", extraText: "", extraValue: 250000 },
    ]);

    activeJob.removeExtrasCost({ id: "extra-1" });

    expect(activeJob.totalExtrasCost).toBe(250000);
  });
});

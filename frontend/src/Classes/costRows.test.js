import {
  totalExtrasCost,
  totalInventionCost,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { describe, expect, it } from "vitest";

import ExtraCost from "./extraCost";
import InventionEntry from "./inventionEntry";
import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";

describe("ExtraCost", () => {
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
    expect(
      new ExtraCost({ id: "extra-1", extraValue: 10 }).toDocument(),
    ).toEqual({
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
    const entry = InventionEntry.forItem(
      "Datacore - Mechanical Engineering",
      125000,
    );

    expect(entry.itemName).toBe("Datacore - Mechanical Engineering");
    expect(entry.itemCost).toBe(125000);
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("keeps every stored key on the way out", () => {
    const row = { id: 1788510923210, itemName: "Datacore", itemCost: 125000 };

    expect(new InventionEntry(row).toDocument()).toEqual({
      ...row,
      version: 1,
    });
  });

  it("keeps the version a row states", () => {
    const row = { version: 2, id: "i1", itemName: "Datacore", itemCost: 1 };

    expect(new InventionEntry(row).toDocument().version).toBe(2);
  });

  it("writes a new entry in the shape it was built in", () => {
    expect(InventionEntry.forItem("Datacore", 1).toDocument().version).toBe(
      InventionEntry.SCHEMA_CURRENT,
    );
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
    return jobFromDocument({
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

    expect(activeJob.build.inventionEntries["1"]).toEqual(
      new InventionEntry({
        id: 1,
        itemName: "Datacore",
        itemCost: 125000,
      }).toDocument(),
    );
    expect(totalInventionCost(activeJob)).toBe(525000);
  });

  it("takes an entry added by hand and writes it back unchanged", () => {
    const activeJob = job([
      InventionEntry.forItem("Datacore", 125000),
      { id: 7, itemName: "Decryptor", itemCost: 400000 },
    ]);

    expect(Object.keys(activeJob.build.inventionEntries)).toHaveLength(2);
    expect(totalInventionCost(activeJob)).toBe(525000);
    expect(activeJob.build.inventionEntries["7"]).toEqual(
      new InventionEntry({
        id: 7,
        itemName: "Decryptor",
        itemCost: 400000,
      }).toDocument(),
    );

    const document = toDocument(activeJob);
    expect(document.build.inventionEntries["7"]).toEqual({
      version: 1,
      id: 7,
      itemName: "Decryptor",
      itemCost: 400000,
    });

    expect(totalInventionCost(jobFromDocument(document))).toBe(525000);
  });
});

describe("extra costs on a job", () => {
  function job(extras) {
    return jobFromDocument({
      jobID: "job-1",
      itemID: 587,
      jobType: 1,
      name: "Oxygen Fuel Block",
      build: { costs: { extrasCosts: extras } },
    });
  }

  it("holds stored rows as extras and totals what they cost", () => {
    const activeJob = job([
      {
        id: "extra-1",
        category: "3",
        extraText: "Courier",
        extraValue: 1500000,
      },
      { id: "extra-2", category: 0, extraText: "", extraValue: 250000 },
    ]);

    expect(activeJob.build.extrasCosts["extra-1"]).toEqual(
      new ExtraCost({
        id: "extra-1",
        category: "3",
        extraText: "Courier",
        extraValue: 1500000,
      }).toDocument(),
    );
    expect(totalExtrasCost(activeJob)).toBe(1750000);
  });

  it("settles a numeric or missing category on the way through", () => {
    const activeJob = job([
      { id: "extra-1", category: 3, extraText: "Courier", extraValue: 10 },
      { id: "extra-2", extraValue: 5 },
    ]);

    const document = toDocument(activeJob);
    expect(document.build.extrasCosts).toEqual({
      "extra-1": {
        id: "extra-1",
        category: "3",
        categoryLabel: "",
        extraText: "Courier",
        extraValue: 10,
      },
      "extra-2": {
        id: "extra-2",
        category: "0",
        categoryLabel: "",
        extraText: "",
        extraValue: 5,
      },
    });
    expect(totalExtrasCost(jobFromDocument(document))).toBe(15);
  });
});

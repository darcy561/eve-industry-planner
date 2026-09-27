import { describe, expect, test } from "vitest";
import Material from "./jobMaterial.js";
import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";

const storedRow = {
  typeID: 34,
  name: "Tritanium",
  jobType: 1,
  volume: 0.01,
  purchasing: {
    p1: { id: "p1", itemCount: 60, itemCost: 5, childJobImport: false },
  },
};

describe("a material row", () => {
  test("keeps every field a stored row carries", () => {
    expect(new Material(storedRow, 100).toDocument()).toEqual(storedRow);
  });

  test("a recipe entry starts with nothing bought against it", () => {
    const material = new Material(
      { typeID: 34, name: "Tritanium", jobType: 1, volume: 0.01 },
      100,
    );

    expect(material.purchasing).toEqual({});
    expect(material.quantityPurchased).toBe(0);
    expect(material.purchasedCost).toBe(0);
    expect(material.purchaseComplete).toBe(false);
  });

  test("is complete once enough has been bought, and follows the requirement", () => {
    let required = 100;
    const material = new Material(
      {
        ...storedRow,
        purchasing: { p1: { id: "p1", itemCount: 100, itemCost: 5 } },
      },
      () => required,
    );

    expect(material.purchaseComplete).toBe(true);

    required = 150;
    expect(material.purchaseComplete).toBe(false);

    required = 80;
    expect(material.purchaseComplete).toBe(true);
  });

  test("a material nothing asks for is not complete", () => {
    const material = new Material({ typeID: 34 }, 0);

    expect(material.quantity).toBe(0);
    expect(material.purchaseComplete).toBe(false);
  });

  test("its purchases are its own", () => {
    const material = new Material(storedRow, 100);

    material.purchasing.p2 = { id: "p2", itemCount: 40, itemCost: 5 };

    expect(Object.keys(storedRow.purchasing)).toEqual(["p1"]);
  });
});

describe("a job's materials", () => {
  test("are hydrated as materials and serialise back to rows", () => {
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 587,
      jobType: 1,
      build: {
        setup: {
          "setup-1": {
            id: "setup-1",
            runCount: 1,
            jobCount: 1,
            materialCount: { 34: { typeID: 34, quantity: 100 } },
          },
        },
        materials: { 34: storedRow },
      },
    });

    expect(job.build.materials[34]).toEqual(
      new Material(storedRow).toDocument(),
    );
    expect(toDocument(job).build.materials).toEqual({ 34: storedRow });
  });

  test("hold nothing until the job is built out", () => {
    const job = jobFromDocument({ jobID: "job-1", itemID: 587, jobType: 1 });

    expect(job.build.materials).toEqual({});
  });
});

describe("recording a purchase", () => {
  function needing(quantity, purchasing = {}) {
    return new Material(
      { typeID: 34, name: "Tritanium", purchasing },
      quantity,
    );
  }

  function purchase(id, itemCount, itemCost, childID = null) {
    return {
      id,
      itemCount,
      itemCost,
      childID,
      childJobImport: Boolean(childID),
    };
  }

  test("takes what the job still needs and hands back the rest", () => {
    const material = needing(100);

    expect(material.importPurchase(purchase("p1", 40, 5))).toEqual({
      taken: 40,
      leftOver: 0,
    });
    expect(material.importPurchase(purchase("p2", 80, 5))).toEqual({
      taken: 60,
      leftOver: 20,
    });

    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(500);
    expect(material.quantityImported).toBe(100);
  });

  test("records a purchase without repeating the material's type", () => {
    const material = needing(100);

    material.importPurchase(purchase("p1", 40, 5));

    expect(Object.keys(material.purchasing)).toEqual(["p1"]);
    expect(material.purchasing.p1).not.toHaveProperty("typeID");
  });

  test("keeps what did not fit when asked to, without charging for it", () => {
    const material = needing(100);

    const { taken, leftOver } = material.importPurchase(
      purchase("p1", 120, 5),
      { recordExcess: true },
    );

    expect({ taken, leftOver }).toEqual({ taken: 100, leftOver: 20 });
    expect(material.quantityImported).toBe(120);
    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(500);
    expect(material.excessQuantity).toBe(20);
  });

  test("a caller can offer less than the job needs", () => {
    const material = needing(100);

    expect(
      material.importPurchase(purchase("p1", 80, 5), { availableToBuy: 30 }),
    ).toEqual({ taken: 30, leftOver: 50 });
    expect(material.quantityImported).toBe(30);
  });

  test("a purchase that is not numbers is refused", () => {
    const material = needing(100);

    expect(material.importPurchase(purchase("p1", 40, Number.NaN))).toEqual({
      taken: 0,
      leftOver: 40,
    });
    expect(material.purchasing).toEqual({});
  });

  test("nothing is recorded for an empty purchase", () => {
    const material = needing(100);

    expect(material.importPurchase(purchase("p1", 0, 5))).toEqual({
      taken: 0,
      leftOver: 0,
    });
    expect(material.purchasing).toEqual({});
  });
});

describe("what the job is charged for", () => {
  function bought(quantity, rows) {
    const material = new Material({ typeID: 34 }, quantity);
    for (const [id, itemCount, itemCost] of rows) {
      material.importPurchase(
        { id, itemCount, itemCost },
        { recordExcess: true },
      );
    }
    return material;
  }

  test("the cheapest purchases fill the requirement first", () => {
    const cheapFirst = bought(50, [
      ["p1", 50, 5],
      ["p2", 50, 20],
    ]);
    const dearFirst = bought(50, [
      ["p1", 50, 20],
      ["p2", 50, 5],
    ]);

    expect(cheapFirst.purchasedCost).toBe(250);
    expect(dearFirst.purchasedCost).toBe(250);
    expect(dearFirst.excessQuantity).toBe(50);
  });

  test("removing a purchase recounts what is left", () => {
    const material = bought(100, [
      ["p1", 60, 5],
      ["p2", 60, 8],
    ]);

    expect(material.purchasedCost).toBe(620);

    expect(material.removePurchase("p1")).toBe(true);
    expect(material.quantityPurchased).toBe(60);
    expect(material.purchasedCost).toBe(480);
    expect(material.removePurchase("p1")).toBe(false);
  });

  test("rows that are not numbers are not kept", () => {
    const material = needingWithRows(100, [
      { id: "bad", itemCount: Number.NaN, itemCost: 5 },
      { id: "good", itemCount: 10, itemCost: 5 },
    ]);

    material.importPurchase({ id: "p1", itemCount: 10, itemCost: 5 });

    expect(Object.keys(material.purchasing).sort()).toEqual(["good", "p1"]);
    expect(material.quantityPurchased).toBe(20);
  });

  test("what is charged follows the requirement when a setup changes", () => {
    let required = 100;
    const material = new Material({ typeID: 34 }, () => required);
    for (const [id, itemCount, itemCost] of [
      ["p1", 60, 5],
      ["p2", 60, 20],
    ]) {
      material.importPurchase(
        { id, itemCount, itemCost },
        { recordExcess: true },
      );
    }

    expect(material.purchasedCost).toBe(1100);

    required = 60;
    expect(material.quantityPurchased).toBe(60);
    expect(material.purchasedCost).toBe(300);
    expect(material.excessQuantity).toBe(60);
  });

  test("what was bought leaves out anything a child job supplied", () => {
    const material = new Material({ typeID: 34 }, 100);
    material.importPurchase({ itemCount: 40, itemCost: 5 });
    material.importPurchase({ itemCount: 60, itemCost: 8, childID: "child-1" });

    expect(material.purchasedCost).toBe(680);
    expect(material.boughtCost).toBe(200);
  });

  test("a child job's output is only imported once", () => {
    const material = new Material({ typeID: 34 }, 100);
    material.importPurchase({
      id: "p1",
      itemCount: 40,
      itemCost: 5,
      childID: "child-1",
    });

    expect(material.hasPurchaseFromChild("child-1")).toBe(true);
    expect(material.hasPurchaseFromChild("child-2")).toBe(false);
  });
});

function needingWithRows(quantity, purchasing) {
  return new Material({ typeID: 34, purchasing }, quantity);
}

import { describe, expect, test } from "vitest";
import Material from "./jobMaterial.js";
import Job from "./job.js";

// The row shape is shared with models.JobMaterial on the backend, so a material
// that goes through the class and back out must still be the same nine fields.
const storedRow = {
  typeID: 34,
  name: "Tritanium",
  jobType: 1,
  volume: 0.01,
  purchasing: [
    { id: "p1", typeID: 34, itemCount: 60, itemCost: 5, childJobImport: false },
  ],
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

    expect(material.purchasing).toEqual([]);
    expect(material.quantityPurchased).toBe(0);
    expect(material.purchasedCost).toBe(0);
    expect(material.purchaseComplete).toBe(false);
  });

  // The requirement moves when a setup changes, so completion is answered from
  // the row rather than stored against the requirement it was decided under.
  test("is complete once enough has been bought, and follows the requirement", () => {
    let required = 100;
    const material = new Material(
      {
        ...storedRow,
        purchasing: [{ id: "p1", typeID: 34, itemCount: 100, itemCost: 5 }],
      },
      () => required,
    );

    expect(material.purchaseComplete).toBe(true);

    required = 150;
    expect(material.purchaseComplete).toBe(false);

    required = 80;
    expect(material.purchaseComplete).toBe(true);
  });

  // A job whose setups call for nothing has bought nothing, which is what keeps
  // an unconfigured job from reporting itself ready to build.
  test("a material nothing asks for is not complete", () => {
    const material = new Material({ typeID: 34 }, 0);

    expect(material.quantity).toBe(0);
    expect(material.purchaseComplete).toBe(false);
  });

  // Sharing the array would let a purchase recorded on one job appear on the
  // document it was hydrated from.
  test("its purchases are its own", () => {
    const material = new Material(storedRow, 100);

    material.purchasing.push({ id: "p2", itemCount: 40, itemCost: 5 });

    expect(storedRow.purchasing).toHaveLength(1);
  });
});

describe("a job's materials", () => {
  test("are hydrated as materials and serialise back to rows", () => {
    const job = new Job({
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
        materials: [storedRow],
      },
    });

    expect(job.build.materials[0]).toBeInstanceOf(Material);
    expect(job.toDocument().build.materials).toEqual([storedRow]);
  });

  // A job that has not been built out yet has no materials at all, which the
  // planner tells apart from a job whose materials are all bought.
  test("are null until the job is built out", () => {
    const job = new Job({ jobID: "job-1", itemID: 587, jobType: 1 });

    expect(job.build.materials).toBeNull();
  });
});

describe("recording a purchase", () => {
  function needing(quantity, purchasing = []) {
    return new Material({ typeID: 34, name: "Tritanium", purchasing }, quantity);
  }

  function purchase(id, itemCount, itemCost, childID = null) {
    return { id, typeID: 34, itemCount, itemCost, childID, childJobImport: Boolean(childID) };
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

  // A single job has nowhere to pass a leftover to, so it keeps the purchase and
  // reports the excess instead of charging the job for it.
  test("keeps what did not fit when asked to, without charging for it", () => {
    const material = needing(100);

    const { taken, leftOver } = material.importPurchase(
      purchase("p1", 120, 5),
      { recordExcess: true }
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
      material.importPurchase(purchase("p1", 80, 5), { availableToBuy: 30 })
    ).toEqual({ taken: 30, leftOver: 50 });
    expect(material.quantityImported).toBe(30);
  });

  // A price that cannot be read as a number would be dropped on the way in, so
  // the caller is told nothing was taken rather than that it was.
  test("a purchase that is not numbers is refused", () => {
    const material = needing(100);

    expect(
      material.importPurchase(purchase("p1", 40, Number.NaN))
    ).toEqual({ taken: 0, leftOver: 40 });
    expect(material.purchasing).toHaveLength(0);
  });

  test("nothing is recorded for an empty purchase", () => {
    const material = needing(100);

    expect(material.importPurchase(purchase("p1", 0, 5))).toEqual({
      taken: 0,
      leftOver: 0,
    });
    expect(material.purchasing).toHaveLength(0);
  });
});

describe("what the job is charged for", () => {
  function bought(quantity, rows) {
    const material = new Material({ typeID: 34 }, quantity);
    for (const [id, itemCount, itemCost] of rows) {
      material.importPurchase(
        { id, typeID: 34, itemCount, itemCost },
        { recordExcess: true }
      );
    }
    return material;
  }

  // The dearest units are the ones left over, so the same purchases cost the
  // same whichever order they were entered in.
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

  // Purchases that cannot be read as numbers are dropped rather than stored, so
  // a bad row cannot be saved back onto the document.
  test("rows that are not numbers are not kept", () => {
    const material = needingWithRows(100, [
      { id: "bad", itemCount: Number.NaN, itemCost: 5 },
      { id: "good", itemCount: 10, itemCost: 5 },
    ]);

    material.importPurchase({ id: "p1", itemCount: 10, itemCost: 5 });

    expect(material.purchasing.map((row) => row.id)).toEqual(["good", "p1"]);
    expect(material.quantityPurchased).toBe(20);
  });

  test("what is charged follows the requirement when a setup changes", () => {
    let required = 100;
    const material = new Material({ typeID: 34 }, () => required);
    for (const [id, itemCount, itemCost] of [
      ["p1", 60, 5],
      ["p2", 60, 20],
    ]) {
      material.importPurchase({ id, itemCount, itemCost }, { recordExcess: true });
    }

    expect(material.purchasedCost).toBe(1100);

    required = 60;
    expect(material.quantityPurchased).toBe(60);
    expect(material.purchasedCost).toBe(300);
    expect(material.excessQuantity).toBe(60);
  });

  // A child job's output cost the child, so it is not spend on this job.
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

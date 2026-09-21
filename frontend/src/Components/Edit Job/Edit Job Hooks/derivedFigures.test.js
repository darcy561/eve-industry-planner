import { describe, expect, it } from "vitest";

import Job from "../../../Classes/job";
import Material from "../../../Classes/jobMaterial";
import {
  averageItemSalePrice,
  costOfExtras,
  costOfInstalls,
  costOfInvention,
  costOfMaterials,
  buildCost,
  buildCostPerItem,
  completedMaterialCount,
  estimatedSalesTaxOutstanding,
  salesByDate,
  salesNewestFirst,
  totalBrokersFees,
  totalCost,
  totalCostPerItem,
  totalJobSlots,
  totalSales,
  totalTransactionFees,
  esiJobIDs,
  esiJobIDsOf,
  esiOrderIDs,
  esiOrderIDsOf,
  esiTransactionIDs,
  esiTransactionIDsOf,
  jobSlotsOf,
  quantityProduced,
  setupCount,
  totalExtrasCost,
  totalInstallCost,
  totalInventionCost,
  totalMaterialCost,
  totalQuantityProduced,
} from "./jobSelectors";
import { materialRequirement } from "./jobSelectors";
import {
  countedFromPurchase,
  purchasedCost,
  quantityPurchased,
  quantityRemaining,
} from "./materialSelectors";

/**
 * Every figure here is checked against the getter it replaces: the class and the
 * selector read one job, and the two answers are compared. Where they disagree
 * one of them is wrong, and the getter is what runs today.
 */

const TRITANIUM = 34;

/** Two setups, calling for 100 of the material between them. */
const setups = {
  "setup-1": {
    id: "setup-1",
    runCount: 2,
    jobCount: 3,
    materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 60 } },
  },
  "setup-2": {
    id: "setup-2",
    runCount: 1,
    jobCount: 1,
    materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 40 } },
  },
};

const aJob = (build = {}, esi = {}) =>
  new Job({
    jobID: "job-1",
    name: "Job",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 10,
    build: {
      setup: setups,
      materials: {},
      ...build,
    },
    esi: {
      industryJobs: {},
      marketOrders: {},
      transactions: {},
      ...esi,
    },
  });

/**
 * A material row, with the requirement the job's setups would give it — which
 * the class takes as a second argument and never stores.
 */
const NEEDED = 100;
const aMaterial = (purchasing = {}, requirement = NEEDED) =>
  new Material(
    { typeID: TRITANIUM, name: "Tritanium", purchasing },
    requirement,
  );

/** Two rows at different prices, one of which the job cannot use in full. */
const purchases = {
  dear: { id: "dear", itemCount: 80, itemCost: 10 },
  cheap: { id: "cheap", itemCount: 60, itemCost: 4 },
};

describe("what a material has been bought", () => {
  const cases = {
    "nothing bought": {},
    "one purchase that covers it": {
      only: { id: "only", itemCount: 100, itemCost: 5 },
    },
    "one that falls short": {
      only: { id: "only", itemCount: 40, itemCost: 5 },
    },
    "two, the cheaper counted first": purchases,
    "a purchase of nothing": {
      none: { id: "none", itemCount: 0, itemCost: 5 },
    },
    "a row with no figures at all": { bad: { id: "bad" } },
    "a row costing less than nothing": {
      bad: { id: "bad", itemCount: 10, itemCost: -1 },
    },
  };

  for (const [name, purchasing] of Object.entries(cases)) {
    it(`agrees with the class for ${name}`, () => {
      const material = aMaterial(purchasing);
      const row = material.toDocument();

      expect(quantityPurchased(row, NEEDED)).toBe(material.quantityPurchased);
      expect(purchasedCost(row, NEEDED)).toBe(material.purchasedCost);
      expect(quantityRemaining(row, NEEDED)).toBe(material.quantityRemaining);
      for (const id of Object.keys(purchasing)) {
        expect(countedFromPurchase(row, NEEDED, id)).toBe(
          material.countedFromPurchase(id),
        );
      }
    });
  }

  // The order two equal-cost rows are counted in decides each one's share, and
  // a map hands them over in whatever order its keys happen to give.
  it("splits two rows of the same price the same way the class does", () => {
    const material = aMaterial({
      b: { id: "b", itemCount: 70, itemCost: 5 },
      a: { id: "a", itemCount: 70, itemCost: 5 },
    });
    const row = material.toDocument();

    expect(countedFromPurchase(row, NEEDED, "a")).toBe(
      material.countedFromPurchase("a"),
    );
    expect(countedFromPurchase(row, NEEDED, "b")).toBe(
      material.countedFromPurchase("b"),
    );
  });
});

describe("the figures a job derives", () => {
  const job = aJob(
    {
      materials: { [TRITANIUM]: aMaterial(purchases) },
      extrasCosts: {
        one: { id: "one", extraValue: 250 },
        two: { id: "two", extraValue: 125.5 },
      },
      inventionEntries: { one: { id: "one", itemCost: 900 } },
    },
    {
      industryJobs: {
        1: { job_id: 1, cost: 500 },
        2: { job_id: 2, cost: 250 },
      },
      // One order sold and one still listed, so the tax estimate has a reason
      // to leave the sold one out.
      marketOrders: {
        900: { order_id: 900, fee: 40, salesTax: 15 },
        901: { order_id: 901, fee: 25, salesTax: 9 },
      },
      transactions: {
        7: {
          transaction_id: 7,
          order_id: 900,
          tax: 12,
          amount: 5000,
          quantity: 20,
          date: "2026-02-01T00:00:00Z",
        },
        8: {
          transaction_id: 8,
          order_id: 900,
          tax: 4,
          amount: 1000,
          quantity: 5,
          date: "2026-03-01T00:00:00Z",
        },
      },
    },
  );
  const document = job.toDocument();

  it.each([
    ["the linked runs", esiJobIDs, (held) => held.esiJobIDs],
    ["the linked orders", esiOrderIDs, (held) => held.esiOrderIDs],
    ["the linked sales", esiTransactionIDs, (held) => held.esiTransactionIDs],
  ])("names %s the class names", (_what, selector, getter) => {
    expect(selector(document)).toEqual(getter(job));
  });

  // Each figure a panel can already hold the rows for has a narrow form, and it
  // has to answer what the job-level one does.
  it.each([
    [
      "the linked runs",
      esiJobIDsOf,
      esiJobIDs,
      (held) => held.esi.industryJobs,
    ],
    [
      "the linked orders",
      esiOrderIDsOf,
      esiOrderIDs,
      (held) => held.esi.marketOrders,
    ],
    [
      "the linked sales",
      esiTransactionIDsOf,
      esiTransactionIDs,
      (held) => held.esi.transactions,
    ],
    [
      "the extras",
      costOfExtras,
      totalExtrasCost,
      (held) => held.build.extrasCosts,
    ],
    [
      "the invention entries",
      costOfInvention,
      totalInventionCost,
      (held) => held.build.inventionEntries,
    ],
    [
      "the linked runs' installs",
      costOfInstalls,
      totalInstallCost,
      (held) => held.esi.industryJobs,
    ],
    [
      "the setups' slots",
      jobSlotsOf,
      totalJobSlots,
      (held) => held.build.setup,
    ],
  ])("answers for %s off the rows alone", (_what, narrow, whole, rowsOf) => {
    expect(narrow(rowsOf(document))).toEqual(whole(document));
  });

  it.each([
    ["install", totalInstallCost, (held) => held.totalInstallCost],
    ["extras", totalExtrasCost, (held) => held.totalExtrasCost],
    ["invention", totalInventionCost, (held) => held.totalInventionCost],
    ["materials", totalMaterialCost, (held) => held.totalMaterialCost],
    ["the build", buildCost, (held) => held.buildCost],
    ["broker fees", totalBrokersFees, (held) => held.totalBrokersFees],
    [
      "transaction fees",
      totalTransactionFees,
      (held) => held.totalTransactionFees,
    ],
    [
      "the tax still to come",
      estimatedSalesTaxOutstanding,
      (held) => held.estimatedSalesTaxOutstanding,
    ],
    ["the sales", totalSales, (held) => held.totalSales],
    ["the job", totalCost, (held) => held.totalCost],
    ["one built item", buildCostPerItem, (held) => held.buildCostPerItem()],
    ["one item in all", totalCostPerItem, (held) => held.totalCostPerItem()],
    [
      "a sold item on average",
      averageItemSalePrice,
      (held) => held.averageItemSalePrice(),
    ],
  ])("costs %s the same as the class", (_what, selector, getter) => {
    expect(selector(document)).toBe(getter(job));
    expect(selector(document)).toBeGreaterThan(0);
  });

  it.each([
    [
      "what the materials cost",
      (held) => costOfMaterials(held.build.materials, held.build.setup),
      totalMaterialCost,
    ],
    [
      "what the setups make",
      (held) => quantityProduced(held.build.setup, held.itemsProducedPerRun),
      totalQuantityProduced,
    ],
  ])("answers for %s off the parts alone", (_what, narrow, whole) => {
    expect(narrow(document)).toBe(whole(document));
  });

  it("asks for the material its setups call for, as the class does", () => {
    expect(materialRequirement(document, TRITANIUM)).toBe(NEEDED);
    expect(materialRequirement(document, TRITANIUM)).toBe(
      job.materialRequirement(TRITANIUM),
    );
  });

  it.each([
    ["setups", setupCount, (held) => held.setupCount],
    ["job slots", totalJobSlots, (held) => held.totalJobSlots],
    [
      "items produced",
      totalQuantityProduced,
      (held) => held.totalQuantityProduced,
    ],
    [
      "materials bought in full",
      completedMaterialCount,
      (held) => held.completedMaterialCount,
    ],
  ])("counts %s the same as the class", (_what, selector, getter) => {
    expect(selector(document)).toBe(getter(job));
  });

  // Newest first, because that is the order the panel lists them in.
  it("lists the sales the way the class orders them", () => {
    expect(salesByDate(document)).toEqual(job.salesByDate);
    expect(salesByDate(document).map((sale) => sale.transaction_id)).toEqual([
      8, 7,
    ]);
    expect(salesNewestFirst(document.esi.transactions)).toEqual(
      salesByDate(document),
    );
  });

  it("has no sales to list for a job that is not there yet", () => {
    expect(salesByDate(undefined)).toEqual([]);
    expect(salesNewestFirst(undefined)).toEqual([]);
  });

  // A material no setup calls for is not one the job has finished buying.
  it("does not count a material nothing asks for as bought", () => {
    const spare = new Material({ typeID: 999, name: "Spare" }, 0);
    const withSpare = aJob({
      materials: {
        [TRITANIUM]: aMaterial(purchases),
        999: spare,
      },
    });

    expect(completedMaterialCount(withSpare.toDocument())).toBe(
      withSpare.completedMaterialCount,
    );
    expect(spare.purchaseComplete).toBe(false);
  });

  it("counts none where nothing has been bought", () => {
    const unbought = aJob({ materials: { [TRITANIUM]: aMaterial({}) } });

    expect(completedMaterialCount(unbought.toDocument())).toBe(0);
    expect(completedMaterialCount(unbought.toDocument())).toBe(
      unbought.completedMaterialCount,
    );
  });

  // A job part-way through loading is plain data with nothing in it yet, and a
  // selector is handed whatever the draft holds.
  it("answers nothing rather than throwing for a job that is not there yet", () => {
    for (const selector of [
      totalBrokersFees,
      totalTransactionFees,
      totalSales,
      estimatedSalesTaxOutstanding,
      totalCost,
      totalCostPerItem,
      buildCostPerItem,
      averageItemSalePrice,
      totalJobSlots,
      totalInstallCost,
      totalExtrasCost,
      totalInventionCost,
      totalMaterialCost,
      buildCost,
      jobSlotsOf,
      quantityProduced,
      setupCount,
      totalQuantityProduced,
      completedMaterialCount,
    ]) {
      expect(selector(undefined)).toBe(0);
      expect(selector({})).toBe(0);
    }
    for (const selector of [esiJobIDs, esiOrderIDs, esiTransactionIDs]) {
      expect(selector(undefined)).toEqual(new Set());
    }
  });
});

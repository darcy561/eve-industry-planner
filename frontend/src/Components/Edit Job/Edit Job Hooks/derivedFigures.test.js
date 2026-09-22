import {
  averageItemSalePrice,
  buildCost,
  buildCostPerItem,
  completedMaterialCount,
  costOfExtras,
  costOfInstalls,
  costOfInvention,
  costOfMaterials,
  esiJobIDs,
  esiJobIDsOf,
  esiOrderIDs,
  esiOrderIDsOf,
  esiTransactionIDs,
  esiTransactionIDsOf,
  estimatedSalesTaxOutstanding,
  jobSlotsOf,
  materialRequirement,
  quantityProduced,
  salesByDate,
  salesNewestFirst,
  setupCount,
  totalBrokersFees,
  totalCost,
  totalCostPerItem,
  totalExtrasCost,
  totalInstallCost,
  totalInventionCost,
  totalJobSlots,
  totalMaterialCost,
  totalQuantityProduced,
  totalSales,
  totalTransactionFees,
} from "./jobSelectors";
import { describe, expect, it } from "vitest";

import Job from "../../../Classes/job";
import Material from "../../../Classes/jobMaterial";
import {
  countedFromPurchase,
  purchasedCost,
  quantityPurchased,
  quantityRemaining,
} from "./materialSelectors";

/**
 * A figure is checked against what it should be, written out, and a narrow form
 * against the whole-job one beside it.
 *
 * Some are also compared with the getter of the same name on `Job`, where the
 * class still carries one: two answers to one question, and where they disagree
 * one of them is wrong.
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

  it("names the runs, the orders and the sales the job holds", () => {
    expect(esiJobIDs(document)).toEqual(new Set([1, 2]));
    expect(esiOrderIDs(document)).toEqual(new Set([900, 901]));
    expect(esiTransactionIDs(document)).toEqual(new Set([7, 8]));
  });

  it("counts what the setups make", () => {
    expect(totalQuantityProduced(document)).toBe(70);
  });

  it("adds up what the installs, the extras and the invention cost", () => {
    expect(totalInstallCost(document)).toBe(750);
    expect(totalExtrasCost(document)).toBe(375.5);
    expect(totalInventionCost(document)).toBe(900);
  });

  it("builds the job's cost out of the four it is made of", () => {
    expect(totalMaterialCost(document)).toBe(640);
    expect(buildCost(document)).toBe(640 + 750 + 375.5 + 900);
  });

  it("divides the build cost by what the setups make", () => {
    expect(buildCostPerItem(document)).toBeCloseTo(38.0786, 4);
  });

  it.each([
    ["materials", totalMaterialCost, (held) => held.totalMaterialCost],
    ["broker fees", totalBrokersFees, (held) => held.totalBrokersFees],
    [
      "transaction fees",
      totalTransactionFees,
      (held) => held.totalTransactionFees,
    ],
    ["the job", totalCost, (held) => held.totalCost],
    ["one item in all", totalCostPerItem, (held) => held.totalCostPerItem()],
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

  it("asks for the material its setups call for", () => {
    expect(materialRequirement(document, TRITANIUM)).toBe(NEEDED);
  });

  it.each([
    ["setups", setupCount, (held) => held.setupCount],
    ["job slots", totalJobSlots, (held) => held.totalJobSlots],
    [
      "materials bought in full",
      completedMaterialCount,
      (held) => held.completedMaterialCount,
    ],
  ])("counts %s the same as the class", (_what, selector, getter) => {
    expect(selector(document)).toBe(getter(job));
  });

  it("counts the tax still to come on the order that has not sold", () => {
    expect(estimatedSalesTaxOutstanding(document)).toBe(9);
  });

  it("sums what the sales brought in", () => {
    expect(totalSales(document)).toBe(6000);
  });

  it("averages what sold over how many were sold", () => {
    expect(averageItemSalePrice(document)).toBe(240);
  });

  // Nothing sold has no average, and must not come back as NaN: the Selling
  // panel hands this straight to the number formatter.
  it("has no average for a job that has sold nothing", () => {
    expect(averageItemSalePrice({ esi: { transactions: {} } })).toBe(0);
    expect(averageItemSalePrice(undefined)).toBe(0);
  });

  // Newest first, because that is the order the panel lists them in.
  it("lists the sales newest first", () => {
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

    // The Tritanium row is bought in full and the spare is not wanted at all,
    // so one of the two counts.
    expect(completedMaterialCount(withSpare.toDocument())).toBe(1);
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

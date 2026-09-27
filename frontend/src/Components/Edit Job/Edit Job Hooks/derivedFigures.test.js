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
  remainingMaterialCount,
  totalBoughtMaterialCost,
  totalSales,
  totalTransactionFees,
} from "./jobSelectors";
import { describe, expect, it } from "vitest";

import {
  jobFromDocument,
  toDocument,
} from "../../../Functions/JobDocuments/jobDocument";
import Material from "../../../Classes/jobMaterial";
import {
  boughtCost,
  countedFromPurchase,
  purchaseComplete,
  purchasedCost,
  quantityPurchased,
  quantityRemaining,
} from "./materialSelectors";

const TRITANIUM = 34;

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
  jobFromDocument({
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

const NEEDED = 100;
const aMaterial = (purchasing = {}, requirement = NEEDED) =>
  new Material(
    { typeID: TRITANIUM, name: "Tritanium", purchasing },
    requirement,
  );

const purchases = {
  dear: { id: "dear", itemCount: 80, itemCost: 10 },
  cheap: { id: "cheap", itemCount: 60, itemCost: 4 },
};

describe("what a material has been bought", () => {
  const cases = {
    "nothing bought": { purchasing: {}, quantity: 0, cost: 0 },
    "one purchase that covers it": {
      purchasing: { only: { id: "only", itemCount: 100, itemCost: 5 } },
      quantity: 100,
      cost: 500,
    },
    "one that falls short": {
      purchasing: { only: { id: "only", itemCount: 40, itemCost: 5 } },
      quantity: 40,
      cost: 200,
    },
    "a purchase of nothing": {
      purchasing: { none: { id: "none", itemCount: 0, itemCost: 5 } },
      quantity: 0,
      cost: 0,
    },
    "a row with no figures at all": {
      purchasing: { bad: { id: "bad" } },
      quantity: 0,
      cost: 0,
    },
    "a row costing less than nothing": {
      purchasing: { bad: { id: "bad", itemCount: 10, itemCost: -1 } },
      quantity: 0,
      cost: 0,
    },
  };

  for (const [name, { purchasing, quantity, cost }] of Object.entries(cases)) {
    it(`counts ${name}`, () => {
      const row = aMaterial(purchasing).toDocument();

      expect(quantityPurchased(row, NEEDED)).toBe(quantity);
      expect(purchasedCost(row, NEEDED)).toBe(cost);
      expect(quantityRemaining(row, NEEDED)).toBe(NEEDED - quantity);
    });
  }

  it("fills the requirement from the cheapest row first", () => {
    const row = aMaterial(purchases).toDocument();

    expect(countedFromPurchase(row, NEEDED, "cheap")).toBe(60);
    expect(countedFromPurchase(row, NEEDED, "dear")).toBe(40);
    expect(purchasedCost(row, NEEDED)).toBe(60 * 4 + 40 * 10);
  });

  it("splits two rows of the same price by id", () => {
    const row = aMaterial({
      b: { id: "b", itemCount: 70, itemCost: 5 },
      a: { id: "a", itemCount: 70, itemCost: 5 },
    }).toDocument();

    expect(countedFromPurchase(row, NEEDED, "a")).toBe(70);
    expect(countedFromPurchase(row, NEEDED, "b")).toBe(30);
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
  const document = toDocument(job);

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

  it("adds up what selling the job cost", () => {
    expect(totalBrokersFees(document)).toBe(40 + 25);
    expect(totalTransactionFees(document)).toBe(12 + 4);
  });

  it("adds the cost of selling onto the cost of building", () => {
    expect(totalCost(document)).toBe(2665.5 + 65 + 16);
  });

  it("divides the whole cost by what the setups make", () => {
    expect(totalCostPerItem(document)).toBeCloseTo(2746.5 / 70, 4);
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

  it("counts the setups, their slots and the materials bought in full", () => {
    expect(setupCount(document)).toBe(2);
    expect(totalJobSlots(document)).toBe(3 + 1);
    expect(completedMaterialCount(document)).toBe(1);
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

  it("has no average for a job that has sold nothing", () => {
    expect(averageItemSalePrice({ esi: { transactions: {} } })).toBe(0);
    expect(averageItemSalePrice(undefined)).toBe(0);
  });

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

  it("does not count a material nothing asks for as bought", () => {
    const spare = new Material({ typeID: 999, name: "Spare" }, 0);
    const withSpare = aJob({
      materials: {
        [TRITANIUM]: aMaterial(purchases),
        999: spare,
      },
    });

    expect(completedMaterialCount(toDocument(withSpare))).toBe(1);
  });

  it("counts none where nothing has been bought", () => {
    const unbought = aJob({ materials: { [TRITANIUM]: aMaterial({}) } });

    expect(completedMaterialCount(toDocument(unbought))).toBe(0);
  });

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

describe("what buying a material actually cost", () => {
  it("counts every purchase in full, past the requirement", () => {
    expect(boughtCost({ purchasing: purchases })).toBe(80 * 10 + 60 * 4);
  });

  it("leaves out what a child job supplied", () => {
    const material = {
      purchasing: {
        bought: { id: "bought", itemCount: 10, itemCost: 5 },
        fromChild: {
          id: "fromChild",
          itemCount: 40,
          itemCost: 7,
          childJobImport: true,
        },
      },
    };

    expect(boughtCost(material)).toBe(50);
  });

  it("costs nothing for a material nothing was bought for", () => {
    expect(boughtCost({ purchasing: {} })).toBe(0);
    expect(boughtCost(undefined)).toBe(0);
  });
});

describe("whether a material is bought for", () => {
  const covered = { only: { id: "only", itemCount: 100, itemCost: 5 } };

  it("is complete once the requirement is covered", () => {
    expect(purchaseComplete({ purchasing: covered }, 100)).toBe(true);
  });

  it("is not complete while it is short", () => {
    expect(purchaseComplete({ purchasing: covered }, 140)).toBe(false);
  });

  it("is not complete for a material nothing calls for", () => {
    expect(purchaseComplete({ purchasing: covered }, 0)).toBe(false);
  });
});

describe("how much of a job is still to buy", () => {
  const jobNeedingBoth = (tritaniumBought) => ({
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          materialCount: {
            34: { typeID: 34, quantity: 100 },
            35: { typeID: 35, quantity: 50 },
          },
        },
      },
      materials: {
        34: {
          typeID: 34,
          purchasing: tritaniumBought
            ? { p: { id: "p", itemCount: tritaniumBought, itemCost: 2 } }
            : {},
        },
        35: {
          typeID: 35,
          purchasing: { p: { id: "p", itemCount: 50, itemCost: 3 } },
        },
      },
    },
  });

  it("counts the materials still short", () => {
    expect(remainingMaterialCount(jobNeedingBoth(0))).toBe(1);
  });

  it("counts none once every material is bought", () => {
    expect(remainingMaterialCount(jobNeedingBoth(100))).toBe(0);
  });

  it("counts none for a job with no materials", () => {
    expect(
      remainingMaterialCount({ build: { materials: {}, setup: {} } }),
    ).toBe(0);
  });

  it("adds up what was spent across every material", () => {
    expect(totalBoughtMaterialCost(jobNeedingBoth(100))).toBe(100 * 2 + 50 * 3);
  });

  it("spends nothing on a job that has bought nothing", () => {
    expect(totalBoughtMaterialCost(undefined)).toBe(0);
  });
});

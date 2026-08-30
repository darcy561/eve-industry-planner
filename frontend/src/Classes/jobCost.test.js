import { describe, expect, test } from "vitest";
import Job from "./job.js";

// What a job cost is pinned by the shared corpus, which the backend reads too.
// These cover what only the SPA does with it.

function jobWith({ materials = [], invention = 0, totalQuantity = 10 }) {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    build: {
      products: { totalQuantity },
      materials: materials.map((purchasedCost, i) => ({
        typeID: 34 + i,
        purchasedCost,
      })),
      costs: { installCosts: 5, extrasTotal: 3, inventionCosts: invention },
    },
  });
}

describe("cost per item", () => {
  test("build cost per item divides what it cost to make", () => {
    const job = jobWith({ materials: [60, 40], invention: 2 });

    // 100 materials + 5 install + 3 extras + 2 invention, over 10
    expect(job.buildCostPerItem()).toBe(11);
  });

  // A parent build pays a child's build cost, so these cannot be one method:
  // the parent is not paying the child's broker fees.
  test("total cost per item adds the cost of selling, build cost does not", () => {
    const job = jobWith({ materials: [100] });
    job.build.sale.brokersFee = [{ id: 0, amount: 10 }];
    job.build.sale.transactions = [
      { transaction_id: 0, tax: 10, amount: 0, quantity: 1 },
    ];

    expect(job.buildCostPerItem()).toBe(10.8);
    expect(job.totalCostPerItem()).toBe(12.8);
  });

  // Producing nothing must not divide by zero and report Infinity as a cost —
  // the figure is passed up into parent builds.
  test("a job producing nothing costs nothing per item", () => {
    const job = jobWith({ materials: [100], totalQuantity: 0 });

    expect(job.buildCostPerItem()).toBe(0);
    expect(job.totalCostPerItem()).toBe(0);
  });
});

describe("invention is its own cost", () => {
  // Folding invention into the material total is what left totalPurchaseCost
  // meaning two different things depending on the order of edits.
  test("recording invention does not change the material total", () => {
    const job = jobWith({ materials: [100] });
    const before = job.build.costs.totalPurchaseCost;

    job.addInventionCost({ id: "inv-1", itemCost: 25 });

    expect(job.build.costs.inventionCosts).toBe(25);
    expect(job.build.costs.totalPurchaseCost).toBe(before);
    expect(job.materialCost()).toBe(100);
    expect(job.buildCost()).toBe(133);
  });

  test("removing it puts the cost back", () => {
    const job = jobWith({ materials: [100] });
    job.addInventionCost({ id: "inv-1", itemCost: 25 });

    job.removeInventionCost({ id: "inv-1", itemCost: 25 });

    expect(job.build.costs.inventionCosts).toBe(0);
    expect(job.buildCost()).toBe(108);
  });
});

describe("what the job cost in total", () => {
  function sold(job, { fees = [], taxes = [], sales = [] }) {
    job.build.sale.brokersFee = fees.map((amount, i) => ({ id: i, amount }));
    job.build.sale.transactions = taxes.map((tax, i) => ({
      transaction_id: i,
      tax,
      amount: sales[i] ?? 0,
      quantity: 1,
    }));
    return job;
  }

  test("adds the cost of selling to the cost of building", () => {
    const job = sold(jobWith({ materials: [100] }), {
      fees: [1, 2],
      taxes: [0.5, 0.25],
      sales: [200, 50],
    });

    expect(job.buildCost()).toBe(108);
    expect(job.brokersFeeTotal()).toBe(3);
    expect(job.transactionFeeTotal()).toBe(0.75);
    expect(job.salesTotal()).toBe(250);
    expect(job.totalCost()).toBe(111.75);
  });

  test("a job that never sold cost only what it took to build", () => {
    const job = jobWith({ materials: [100] });

    expect(job.totalCost()).toBe(job.buildCost());
    expect(job.salesTotal()).toBe(0);
  });
});

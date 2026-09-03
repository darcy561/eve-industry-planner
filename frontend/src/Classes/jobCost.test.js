import { describe, expect, test } from "vitest";
import Job from "./job.js";
import Setup from "./jobSetup.js";

// What a job cost is pinned by the shared corpus, which the backend reads too.
// These cover what only the SPA does with it.

// A job produces what its setups are set to make, so the quantity is expressed
// as one setup of one run producing `totalQuantity` items.
function jobWith({ materials = [], invention = 0, totalQuantity = 10 }) {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: totalQuantity,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: Object.fromEntries(
            materials.map((spend, i) => [
              34 + i,
              { typeID: 34 + i, quantity: spend },
            ]),
          ),
        },
      },
      materials: materials.map((spend, i) => ({
        typeID: 34 + i,
        quantity: spend,
        purchasing: [
          { id: `p${i}`, typeID: 34 + i, itemCount: spend, itemCost: 1 },
        ],
      })),
      costs: {
        linkedJobs: [{ job_id: 1, cost: 5 }],
        extrasCosts: [
          { id: "extra-1", category: "0", extraText: "Courier", extraValue: 3 },
        ],
        inventionEntries: invention
          ? [{ id: 1, itemName: "Datacore", itemCost: invention }]
          : [],
      },
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

describe("what the installs cost", () => {
  // Summed on every call from the rows themselves, so linking and unlinking
  // cannot leave the figure behind.
  test("the linked ESI jobs are what the installs cost", () => {
    const job = jobWith({ materials: [100] });
    job.build.costs.linkedJobs = [
      { job_id: 1, cost: 12 },
      { job_id: 2, cost: 8 },
    ];

    expect(job.totalInstallCost()).toBe(20);
    expect(job.buildCost()).toBe(123);
  });

  // Setup estimates are a planning figure — getJobInstallCostForPlanning owns
  // them — so nothing linked costs nothing here.
  test("nothing linked costs nothing", () => {
    const job = jobWith({ materials: [100] });
    job.build.costs.linkedJobs = [];
    job.build.setup = {
      "setup-1": new Setup({
        id: "setup-1",
        jobType: 1,
        estimatedInstallCost: 15,
        jobCount: 2,
        materialCount: { 34: { typeID: 34, quantity: 100 } },
      }),
    };

    expect(job.totalInstallCost()).toBe(0);
    expect(job.buildCost()).toBe(103);
  });

  test("unlinking a job takes its cost back off", () => {
    const job = jobWith({ materials: [100] });
    job.build.costs.linkedJobs = [
      { job_id: 1, cost: 12 },
      { job_id: 2, cost: 8 },
    ];

    job.unlinkESIJob({ job_id: 2, cost: 8 });

    expect(job.totalInstallCost()).toBe(12);
  });
});

describe("invention is its own cost", () => {
  // Invention is its own component: a job that had to invent its blueprint paid
  // that on top of its materials, and neither figure belongs in the other.
  test("recording invention does not change the material total", () => {
    const job = jobWith({ materials: [100] });

    job.addInventionCost({ id: "inv-1", itemCost: 25 });

    expect(job.totalInventionCost()).toBe(25);
    expect(job.totalMaterialCost()).toBe(100);
    expect(job.buildCost()).toBe(133);
  });

  test("removing it puts the cost back", () => {
    const job = jobWith({ materials: [100] });
    job.addInventionCost({ id: "inv-1", itemCost: 25 });

    job.removeInventionCost({ id: "inv-1", itemCost: 25 });

    expect(job.totalInventionCost()).toBe(0);
    expect(job.buildCost()).toBe(108);
  });
});

describe("what a sold item went for", () => {
  test("the average is the sales over the items sold", () => {
    const job = jobWith({ materials: [100] });
    job.build.sale.transactions = [
      { transaction_id: 1, amount: 300, quantity: 2 },
      { transaction_id: 2, amount: 100, quantity: 2 },
    ];

    expect(job.averageItemSalePrice()).toBe(100);
  });

  // Nothing sold has no average price, and must not be reported as NaN: the
  // Selling panel hands this straight to the number formatter.
  test("nothing sold has no average", () => {
    expect(jobWith({ materials: [100] }).averageItemSalePrice()).toBe(0);
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

import {
  buildCost,
  buildCostPerItem,
  completedMaterialCount,
  involvedCharacters,
  remainingMaterialCount,
  setupCount,
  totalBrokersFees,
  totalCost,
  totalCostPerItem,
  totalInstallCost,
  totalInventionCost,
  totalJobSlots,
  totalMaterialCost,
  totalSales,
  totalTransactionFees,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors.js";
import { describe, expect, test } from "vitest";
import { jobFromDocument, toDocument } from "../Functions/Job/jobDocument";
import Setup from "./jobSetup.js";

function jobWith({ materials = [], invention = 0, totalQuantity = 10 }) {
  return jobFromDocument({
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
      materials: Object.fromEntries(
        materials.map((spend, i) => [
          String(34 + i),
          {
            typeID: 34 + i,
            quantity: spend,
            purchasing: {
              [`p${i}`]: { id: `p${i}`, itemCount: spend, itemCost: 1 },
            },
          },
        ]),
      ),
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

    expect(buildCostPerItem(job)).toBe(11);
  });

  test("total cost per item adds the cost of selling, build cost does not", () => {
    const job = jobWith({ materials: [100] });

    job.esi.marketOrders = { 700001: { order_id: 700001, fee: 10 } };
    job.esi.transactions = {
      0: { transaction_id: 0, tax: 10, amount: 0, quantity: 1 },
    };

    expect(buildCostPerItem(job)).toBe(10.8);
    expect(totalCostPerItem(job)).toBe(12.8);
  });

  test("a job producing nothing costs nothing per item", () => {
    const job = jobWith({ materials: [100], totalQuantity: 0 });

    expect(buildCostPerItem(job)).toBe(0);
    expect(totalCostPerItem(job)).toBe(0);
  });
});

describe("what the installs cost", () => {
  test("the linked ESI jobs are what the installs cost", () => {
    const job = jobWith({ materials: [100] });
    job.esi.industryJobs = {
      1: { job_id: 1, cost: 12 },
      2: { job_id: 2, cost: 8 },
    };

    expect(totalInstallCost(job)).toBe(20);
    expect(buildCost(job)).toBe(123);
  });

  test("nothing linked costs nothing", () => {
    const job = jobWith({ materials: [100] });
    job.esi.industryJobs = {};
    job.build.setup = {
      "setup-1": new Setup({
        id: "setup-1",
        jobType: 1,
        jobCount: 2,
        materialCount: { 34: { typeID: 34, quantity: 100 } },
      }),
    };

    expect(totalInstallCost(job)).toBe(0);
    expect(buildCost(job)).toBe(103);
  });
});

describe("invention is its own cost", () => {
  test("invention is counted on top of the material total", () => {
    const job = jobWith({ materials: [100], invention: 25 });

    expect(totalInventionCost(job)).toBe(25);
    expect(totalMaterialCost(job)).toBe(100);
    expect(buildCost(job)).toBe(133);
  });

  test("a job that invented nothing carries none of it", () => {
    const job = jobWith({ materials: [100] });

    expect(totalInventionCost(job)).toBe(0);
    expect(buildCost(job)).toBe(108);
  });
});

describe("what the job cost in total", () => {
  function sold(job, { fees = [], taxes = [], sales = [] }) {
    const document = toDocument(job);
    return jobFromDocument({
      ...document,
      esi: {
        ...document.esi,

        marketOrders: Object.fromEntries(
          fees.map((fee, i) => [
            String(700000 + i),
            { order_id: 700000 + i, fee },
          ]),
        ),
        transactions: Object.fromEntries(
          taxes.map((tax, i) => [
            String(i),
            { transaction_id: i, tax, amount: sales[i] ?? 0, quantity: 1 },
          ]),
        ),
      },
    });
  }

  test("adds the cost of selling to the cost of building", () => {
    const job = sold(jobWith({ materials: [100] }), {
      fees: [1, 2],
      taxes: [0.5, 0.25],
      sales: [200, 50],
    });

    expect(buildCost(job)).toBe(108);
    expect(totalBrokersFees(job)).toBe(3);
    expect(totalTransactionFees(job)).toBe(0.75);
    expect(totalSales(toDocument(job))).toBe(250);
    expect(totalCost(job)).toBe(111.75);
  });

  test("a job that never sold cost only what it took to build", () => {
    const job = jobWith({ materials: [100] });

    expect(totalCost(job)).toBe(buildCost(job));
    expect(totalSales(toDocument(job))).toBe(0);
  });
});

describe("reading a job's figures", () => {
  function sold(job) {
    const document = toDocument(job);
    return jobFromDocument({
      ...document,
      esi: {
        ...document.esi,
        marketOrders: { 700001: { order_id: 700001, fee: 3 } },
        transactions: {
          1: { transaction_id: 1, tax: 0.5, amount: 200, quantity: 2 },
          2: { transaction_id: 2, tax: 0.25, amount: 50, quantity: 1 },
        },
      },
    });
  }

  test("the sale totals read as values", () => {
    const job = sold(jobWith({ materials: [100] }));

    expect(totalSales(toDocument(job))).toBe(250);
    expect(totalBrokersFees(job)).toBe(3);
    expect(totalTransactionFees(job)).toBe(0.75);
  });

  test("the counts read as values", () => {
    const job = jobWith({ materials: [100, 0] });

    expect(setupCount(job)).toBe(1);
    expect(totalJobSlots(job)).toBe(1);
    expect(completedMaterialCount(job)).toBe(1);
    expect(remainingMaterialCount(job)).toBe(1);
  });

  test("who was involved is one set", () => {
    const job = jobWith({ materials: [100] });
    job.esi.industryJobs = {
      1: { job_id: 1, cost: 0, CharacterHash: "ABC" },
      2: { job_id: 2, cost: 0, CharacterHash: "ABC" },
    };
    job.esi.marketOrders = { 1: { order_id: 1, CharacterHash: "DEF" } };

    expect(involvedCharacters(job).size).toBe(2);
  });
});

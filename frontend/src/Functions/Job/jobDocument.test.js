import { describe, expect, it, vi } from "vitest";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { jobFromDocument, toDocument } = await import("./jobDocument.js");

const TRITANIUM = 34;
const PYERITE = 35;

function stored(overrides = {}) {
  return {
    jobID: "job-1",
    jobType: 1,
    name: "Rifter",
    jobStatus: 2,
    volume: 27289,
    itemID: 587,
    maxProductionLimit: 30,
    parentJobs: ["parent-1"],
    blueprintTypeID: 686,
    isReadyToSell: false,
    groupID: "",
    includedInGroup: false,
    displayOnPlanner: true,
    itemsProducedPerRun: 1,
    metaLevel: 0,
    rawData: { materials: [{ typeID: TRITANIUM, quantity: 100 }], time: 600 },
    skills: { 3380: { typeID: 3380, level: 4 } },
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 2,
          jobCount: 1,
          ME: 10,
          TE: 20,
          structureID: 35825,
          systemID: 30000142,
          materialCount: 200,
          rawTime: 600,
          jobType: 1,
        },
      },
      childJobs: { [TRITANIUM]: ["child-1"], [PYERITE]: [] },
      materials: {
        [TRITANIUM]: {
          typeID: TRITANIUM,
          name: "Tritanium",
          jobType: 1,
          volume: 0.01,
          purchasing: {
            "p-1": { id: "p-1", itemCount: 60, itemCost: 5 },
          },
        },
      },
      extrasCosts: { "e-1": { id: "e-1", category: "1", extraValue: 500 } },
      inventionEntries: { "i-1": { id: "i-1", runCount: 1 } },
      sellerCharacter: "hash-1",
      saleLocationID: "60003760",
      localPricing: {
        buying: { market: "jita", orderType: "sell" },
        selling: { market: null, orderType: null },
      },
      materialPriceOverrides: { [TRITANIUM]: 6 },
    },
    esi: {
      industryJobs: { 900: { job_id: 900, runs: 2 } },
      marketOrders: {
        800: { order_id: 800, price: 100, location_id: 60003760 },
      },
      transactions: {
        700: { transaction_id: 700, unit_price: 110, quantity: 1 },
      },
    },
    layout: {
      esiJobTab: "1",
      setupToEdit: "setup-1",
      resourceDisplayType: "2",
    },
    _meta: {
      lastModified: "2026-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      lastUpdatedBy: "account-1",
      revision: 7,
    },
    ...overrides,
  };
}

const preReshape = () => {
  const doc = stored();
  const { esi, build, ...rest } = doc;
  return {
    ...rest,
    build: {
      setup: build.setup,
      childJobs: build.childJobs,
      materials: Object.values(build.materials),
      costs: {
        extrasCosts: Object.values(build.extrasCosts),
        inventionEntries: Object.values(build.inventionEntries),
        linkedJobs: Object.values(esi.industryJobs),
      },
      sale: {
        marketOrders: Object.values(esi.marketOrders),
        transactions: Object.values(esi.transactions),
        brokersFee: [{ order_id: 800, amount: 12, journal_ref_id: 5 }],
        plan: { sellerCharacter: "hash-1", saleLocationID: "60003760" },
      },
    },
    skills: Object.values(doc.skills),
    layout: {
      ...doc.layout,
      materialPriceOverrides: build.materialPriceOverrides,
      localPricing: build.localPricing,
    },
  };
};

describe("a document written before the reshape", () => {
  const legacy = () => preReshape();

  it("reads the linked runs, orders and sales into `esi`", () => {
    const job = jobFromDocument(legacy());

    expect(Object.keys(job.esi.industryJobs)).toEqual(["900"]);
    expect(Object.keys(job.esi.marketOrders)).toEqual(["800"]);
    expect(Object.keys(job.esi.transactions)).toEqual(["700"]);
  });

  it("folds a stored broker fee onto the order it was charged against", () => {
    const job = jobFromDocument(legacy());

    expect(job.esi.marketOrders["800"].fee).toBe(12);
  });

  it("keys the materials and skills it held as arrays", () => {
    const job = jobFromDocument(legacy());

    expect(Object.keys(job.build.materials)).toEqual(["34"]);
    expect(Object.keys(job.skills)).toEqual(["3380"]);
  });

  it("reads the extras and invention entries out of `build.costs`", () => {
    const job = jobFromDocument(legacy());

    expect(Object.keys(job.build.extrasCosts)).toEqual(["e-1"]);
    expect(Object.keys(job.build.inventionEntries)).toEqual(["i-1"]);
  });

  it("reads the selling plan and the overrides layout used to hold", () => {
    const job = jobFromDocument(legacy());

    expect(job.build.sellerCharacter).toBe("hash-1");
    expect(job.build.saleLocationID).toBe("60003760");
    expect(job.build.materialPriceOverrides).toEqual({ 34: 6 });
    expect(job.build.localPricing.buying.market).toBe("jita");
  });

  it("writes it back in the shape it is now stored in", () => {
    const document = toDocument(jobFromDocument(legacy()));

    expect(document.build.costs).toBeUndefined();
    expect(document.build.sale).toBeUndefined();
    expect(Object.keys(document.esi)).toEqual([
      "industryJobs",
      "marketOrders",
      "transactions",
    ]);
  });
});

describe("what a job derives rather than reads", () => {
  it("mints a job id where the document carries none", () => {
    const job = jobFromDocument(stored({ jobID: undefined }));

    expect(job.jobID).toMatch(/^job-/);
  });

  it("shows a grouped job on the planner once it is ready to sell", () => {
    const job = jobFromDocument(
      stored({
        groupID: "group-1",
        includedInGroup: true,
        isReadyToSell: true,
        displayOnPlanner: undefined,
      }),
    );

    expect(job.displayOnPlanner).toBe(true);
  });

  it("keeps a grouped job off the planner while it is not", () => {
    const job = jobFromDocument(
      stored({
        groupID: "group-1",
        includedInGroup: true,
        displayOnPlanner: undefined,
      }),
    );

    expect(job.displayOnPlanner).toBe(false);
  });

  it("takes the group from the build request where the document names none", () => {
    const job = jobFromDocument(
      stored({ groupID: undefined, includedInGroup: undefined }),
      { groupID: "group-9" },
    );

    expect(job.groupID).toBe("group-9");
    expect(job.includedInGroup).toBe(true);
  });

  it("keeps a stored membership the build request disagrees with", () => {
    const job = jobFromDocument(
      stored({ groupID: undefined, includedInGroup: false }),
      { groupID: "group-9" },
    );

    expect(job.groupID).toBe("group-9");
    expect(job.includedInGroup).toBe(false);
  });

  it("carries a revision only where the document has one", () => {
    expect(jobFromDocument(stored())._meta.revision).toBe(7);
    expect("revision" in jobFromDocument(stored({ _meta: {} }))._meta).toBe(
      false,
    );
  });
});

describe("a document handed out of a job", () => {
  it("does not share a child job list with it", () => {
    const job = jobFromDocument(stored());

    toDocument(job).build.childJobs[TRITANIUM].push("child-2");

    expect(job.build.childJobs[TRITANIUM]).toEqual(["child-1"]);
  });

  it("holds no class instance anywhere a row is stored", () => {
    const job = jobFromDocument(stored());

    for (const row of [
      ...Object.values(job.build.setup),
      ...Object.values(job.build.materials),
      ...Object.values(job.build.extrasCosts),
      ...Object.values(job.build.inventionEntries),
      ...Object.values(job.esi.industryJobs),
      ...Object.values(job.esi.marketOrders),
      ...Object.values(job.esi.transactions),
    ]) {
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    }
  });
});

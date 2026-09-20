import { describe, expect, it } from "vitest";
import { produce } from "immer";

import Job from "../../../Classes/job";
import Setup from "../../../Classes/jobSetup";
import * as commands from "./jobCommands";

/**
 * Each command is checked against the method on `Job` it replaces: both are run
 * over the same document and the results are compared. A command writing the
 * paths its author had in mind proves much less than a command agreeing with
 * what runs today, and where the two differ one of them is wrong.
 *
 * The comparison is made on documents, because that is the shape the command
 * works in and the shape the class stores to.
 */

/* eslint-disable vitest/expect-expect --
 * Every case below asserts through `agree`, which the rule cannot see into: it
 * matches `expect` at the top level of a test. Naming the helper in the shared
 * config would turn the rule off for any function called `agree` anywhere,
 * which is a wider change than this file is owed.
 */

const documentFor = (overrides = {}) =>
  new Job({
    jobID: "job-1",
    name: "Job",
    jobStatus: 1,
    itemID: 34,
    parentJobs: ["parent-1", "parent-2"],
    groupID: "",
    includedInGroup: false,
    displayOnPlanner: true,
    isReadyToSell: false,
    build: {
      childJobs: { 34: ["child-1", "child-2"], 35: ["child-2"] },
      materials: {
        34: {
          typeID: 34,
          name: "Tritanium",
          purchasing: {
            "buy-1": { id: "buy-1", itemCount: 10, itemCost: 5 },
            "buy-2": { id: "buy-2", itemCount: 20, itemCost: 6 },
          },
        },
      },
      extrasCosts: { "extra-1": { id: "extra-1", extraValue: 100 } },
      inventionEntries: { "inv-1": { id: "inv-1", itemCost: 50 } },
    },
    esi: {
      industryJobs: { 900: { job_id: 900, status: "active" } },
      marketOrders: {
        700: { order_id: 700, location_id: 60003760, fee: 1, salesTax: 2 },
      },
      transactions: {
        800: { transaction_id: 800, location_id: 60003760 },
        801: { transaction_id: 801, location_id: 60008494 },
      },
    },
    ...overrides,
  }).toDocument();

/**
 * Runs the command and the method it replaces over the same document, and
 * returns both results for comparison.
 */
function bothWays(document, command, applyToInstance) {
  const viaCommand = structuredClone(document);
  command.recipe(viaCommand);

  const instance = new Job(structuredClone(document));
  applyToInstance(instance);

  return { viaCommand, viaClass: instance.toDocument() };
}

const agree = (document, command, applyToInstance) => {
  const { viaCommand, viaClass } = bothWays(document, command, applyToInstance);
  expect(viaCommand).toEqual(viaClass);
};

describe("moving between stages", () => {
  it("steps forward as the job does", () => {
    agree(documentFor(), commands.stepForward(), (job) => job.stepForward());
  });

  it("steps back as the job does", () => {
    agree(documentFor(), commands.stepBackward(), (job) => job.stepBackward());
  });

  it("sets a stage as the job does", () => {
    agree(documentFor(), commands.setJobStatus(3), (job) =>
      job.setJobStatus(3),
    );
  });

  it("ignores a stage that is not a number, as the job does", () => {
    agree(documentFor(), commands.setJobStatus("nonsense"), (job) =>
      job.setJobStatus("nonsense"),
    );
  });
});

describe("linking what ESI reported", () => {
  const linked = { job_id: 901, status: "active", station_id: 60003760 };

  it("links a job as the job does", () => {
    const owner = { CharacterHash: "hash", CharacterID: 500 };
    agree(documentFor(), commands.linkESIJob(linked, owner), (job) =>
      job.linkESIJob(linked, owner),
    );
  });

  it("leaves a job already linked alone, as the job does", () => {
    const already = { job_id: 900, status: "delivered" };
    const owner = { CharacterHash: "hash", CharacterID: 500 };
    agree(documentFor(), commands.linkESIJob(already, owner), (job) =>
      job.linkESIJob(already, owner),
    );
  });

  it("unlinks a job as the job does", () => {
    agree(documentFor(), commands.unlinkESIJob({ job_id: 900 }), (job) =>
      job.unlinkESIJob({ job_id: 900 }),
    );
  });

  it("unlinks an order and its sales as the job does", () => {
    const order = { order_id: 700, location_id: 60003760 };
    agree(documentFor(), commands.removeMarketOrder(order), (job) =>
      job.removeMarketOrder(order),
    );
  });

  it("unlinks a sale as the job does", () => {
    const sale = { transaction_id: 800 };
    agree(documentFor(), commands.removeTransaction(sale), (job) =>
      job.removeTransaction(sale),
    );
  });
});

describe("the costs a reader adds by hand", () => {
  it("adds an extra cost as the job does", () => {
    const extra = { id: "extra-2", category: "1", extraValue: 25 };
    agree(documentFor(), commands.addExtrasCost(extra), (job) =>
      job.addExtrasCost(extra),
    );
  });

  it("removes an extra cost as the job does", () => {
    agree(documentFor(), commands.removeExtrasCost({ id: "extra-1" }), (job) =>
      job.removeExtrasCost({ id: "extra-1" }),
    );
  });

  it("adds an invention cost as the job does", () => {
    const entry = { id: "inv-2", itemName: "Decryptor", itemCost: 10 };
    agree(documentFor(), commands.addInventionCost(entry), (job) =>
      job.addInventionCost(entry),
    );
  });

  it("removes an invention cost as the job does", () => {
    agree(documentFor(), commands.removeInventionCost({ id: "inv-1" }), (job) =>
      job.removeInventionCost({ id: "inv-1" }),
    );
  });

  it("removes a purchase as the job does", () => {
    agree(documentFor(), commands.removeMaterialPurchase(34, "buy-1"), (job) =>
      job.removeMaterialPurchase(34, "buy-1"),
    );
  });
});

describe("how a job relates to others", () => {
  it("removes a child job as the job does", () => {
    agree(documentFor(), commands.removeChildJob(34, "child-1"), (job) =>
      job.removeChildJob(34, "child-1"),
    );
  });

  it("removes several child jobs at once, as the job does", () => {
    const ids = ["child-1", "child-2"];
    agree(documentFor(), commands.removeChildJob(34, ids), (job) =>
      job.removeChildJob(34, ids),
    );
  });

  it("adds a child job as the job does", () => {
    agree(documentFor(), commands.addChildJob(34, "child-3"), (job) =>
      job.addChildJob(34, "child-3"),
    );
  });

  it("will not add one under a material the job does not build", () => {
    agree(documentFor(), commands.addChildJob(99, "child-3"), (job) =>
      job.addChildJob(99, "child-3"),
    );
  });

  it("keeps only the child jobs named, as the job does", () => {
    agree(documentFor(), commands.keepOnlyChildJobs(["child-2"]), (job) =>
      job.keepOnlyChildJobs(["child-2"]),
    );
  });

  it("adds a parent job as the job does", () => {
    agree(documentFor(), commands.addParentJob("parent-3"), (job) =>
      job.addParentJob("parent-3"),
    );
  });

  it("does not add a parent twice, as the job does", () => {
    agree(documentFor(), commands.addParentJob("parent-1"), (job) =>
      job.addParentJob("parent-1"),
    );
  });

  it("removes a parent job as the job does", () => {
    agree(documentFor(), commands.removeParentJob("parent-1"), (job) =>
      job.removeParentJob("parent-1"),
    );
  });

  it("keeps only the parent jobs named, as the job does", () => {
    agree(documentFor(), commands.keepOnlyParentJobs(["parent-2"]), (job) =>
      job.keepOnlyParentJobs(["parent-2"]),
    );
  });
});

describe("groups and selling", () => {
  const grouped = () =>
    documentFor({
      groupID: "group-1",
      includedInGroup: true,
      displayOnPlanner: false,
    });

  it("assigns to a group as the job does", () => {
    agree(documentFor(), commands.assignToGroup("group-1"), (job) =>
      job.assignToGroup("group-1"),
    );
  });

  it("releases to the planner as the job does", () => {
    agree(grouped(), commands.releaseFromGroupToPlanner(), (job) =>
      job.releaseFromGroupToPlanner(),
    );
  });

  it("marks ready for sale as the job does", () => {
    agree(grouped(), commands.toggleGroupJobReadyForSale(), (job) =>
      job.toggleGroupJobReadyForSale(),
    );
  });

  it("takes the mark back off as the job does", () => {
    const ready = documentFor({
      groupID: "group-1",
      includedInGroup: true,
      isReadyToSell: true,
      displayOnPlanner: true,
    });
    agree(ready, commands.toggleGroupJobReadyForSale(), (job) =>
      job.toggleGroupJobReadyForSale(),
    );
  });

  it("chooses a seller and a place as the job does", () => {
    const plan = { sellerCharacter: "hash-1", saleLocationID: "60003760" };
    agree(documentFor(), commands.setSellingPlan(plan), (job) =>
      job.setSellingPlan(plan),
    );
  });

  // A player taking their seller off is not the same as a caller saying nothing
  // about it, and a null that falls through leaves the old choice in place.
  it("clears a choice given as null, as the job does", () => {
    const chosen = documentFor({
      build: {
        ...documentFor().build,
        sellerCharacter: "hash-9",
        saleLocationID: "60003760",
      },
    });
    const plan = { sellerCharacter: null };

    const { viaCommand, viaClass } = bothWays(
      chosen,
      commands.setSellingPlan(plan),
      (job) => job.setSellingPlan(plan),
    );

    expect(viaCommand).toEqual(viaClass);
    expect(viaCommand.build.sellerCharacter).toBeNull();
    expect(viaCommand.build.saleLocationID).toBe("60003760");
  });

  it("leaves a choice it was told nothing about, as the job does", () => {
    const plan = { saleLocationID: "60008494" };
    agree(documentFor(), commands.setSellingPlan(plan), (job) =>
      job.setSellingPlan(plan),
    );
  });
});

// A command is handed the document and changes it; it must not reach anything
// else, or the change it records is not the whole change it made.
describe("what a command is allowed to touch", () => {
  it("changes nothing but the document it was given", () => {
    const extra = { id: "extra-2", extraValue: 25 };
    const document = documentFor();
    const held = structuredClone(document);

    commands.addExtrasCost(extra).recipe(structuredClone(document));

    expect(document).toEqual(held);
  });

  it("names the step for the reader", () => {
    expect(commands.stepForward().name).toBe("move to the next stage");
    expect(commands.removeMaterialPurchase(34, "buy-1").name).toBe(
      "remove purchase",
    );
  });
});

describe("sales and orders ESI reported", () => {
  it("links a sale as the job does", () => {
    const sale = { transaction_id: 802, location_id: 60003760, quantity: 5 };
    agree(documentFor(), commands.addTransaction(sale), (job) =>
      job.addTransaction(sale),
    );
  });

  it("links several sales at once, as the job does", () => {
    const sales = [
      { transaction_id: 802, location_id: 60003760 },
      { transaction_id: 803, location_id: 60003760 },
    ];
    agree(documentFor(), commands.addTransaction(sales), (job) =>
      job.addTransaction(sales),
    );
  });

  // One order is the only case where a sale can be attributed at all.
  it("attributes a sale to the only order, as the job does", () => {
    const sale = { transaction_id: 802, location_id: 60003760 };
    const { viaCommand, viaClass } = bothWays(
      documentFor(),
      commands.addTransaction(sale),
      (job) => job.addTransaction(sale),
    );

    expect(viaCommand).toEqual(viaClass);
    expect(viaCommand.esi.transactions["802"].order_id).toBe(700);
  });

  it("attributes to nothing where the job has two orders", () => {
    const twoOrders = documentFor({
      esi: {
        industryJobs: {},
        marketOrders: {
          700: { order_id: 700, location_id: 60003760 },
          701: { order_id: 701, location_id: 60008494 },
        },
        transactions: {},
      },
    });
    const sale = { transaction_id: 802, location_id: 60003760 };
    const { viaCommand, viaClass } = bothWays(
      twoOrders,
      commands.addTransaction(sale),
      (job) => job.addTransaction(sale),
    );

    expect(viaCommand).toEqual(viaClass);
    expect(viaCommand.esi.transactions["802"].order_id).toBeNull();
  });

  it("links an order as the job does", () => {
    const order = {
      order_id: 701,
      location_id: 60008494,
      issued: "2026-01-01T00:00:00Z",
    };
    agree(documentFor(), commands.addMarketOrder(order), (job) =>
      job.addMarketOrder(order),
    );
  });

  it("records the fee charged for listing it, as the job does", () => {
    const order = { order_id: 701, location_id: 60008494 };
    const fee = {
      order_id: 701,
      amount: 250,
      salesTax: 10,
      date: "2026-01-01",
    };
    agree(documentFor(), commands.addMarketOrder(order, fee), (job) =>
      job.addMarketOrder(order, fee),
    );
  });

  it("takes the latest figures for a linked run, as the job does", () => {
    const latest = [
      { job_id: 900, status: "delivered", end_date: "2026-01-02" },
    ];
    agree(documentFor(), commands.updateLinkedJobData(latest), (job) =>
      job.updateLinkedJobData(latest),
    );
  });
});

describe("what was bought for a material", () => {
  const purchase = { id: "buy-3", itemCount: 30, itemCost: 7 };

  it("records a purchase as the job does", () => {
    agree(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, { availableToBuy: 100 }),
      (job) =>
        job.importPurchaseToMaterial(34, purchase, { availableToBuy: 100 }),
    );
  });

  it("takes only what the job still needs, as the job does", () => {
    agree(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, { availableToBuy: 10 }),
      (job) =>
        job.importPurchaseToMaterial(34, purchase, { availableToBuy: 10 }),
    );
  });

  it("keeps the whole purchase when asked to record the excess", () => {
    const options = { availableToBuy: 10, recordExcess: true };
    agree(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, options),
      (job) => job.importPurchaseToMaterial(34, purchase, options),
    );
  });

  it("reports what a purchase takes and leaves, as the job does", () => {
    const instance = new Job(structuredClone(documentFor()));
    const fromClass = instance.importPurchaseToMaterial(34, purchase, {
      availableToBuy: 10,
    });

    expect(commands.importedQuantities(purchase, 10)).toEqual(fromClass);
  });
});

describe("the setups a job builds from", () => {
  const withSetups = () =>
    documentFor({
      build: {
        ...documentFor().build,
        setup: {
          "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 },
          "setup-2": { id: "setup-2", runCount: 2, jobCount: 1 },
        },
      },
      layout: { setupToEdit: "setup-1" },
    });

  // Callers build a Setup and hand it over; the class stores the instance it is
  // given, so a plain row would break its own toDocument later. The command
  // stores the row either way, which is why it is handed the instance here.
  it("attaches a setup and opens it, as the job does", () => {
    const setup = new Setup({ id: "setup-3", runCount: 5, jobCount: 1 });
    agree(withSetups(), commands.attachNewSetupToJob(setup), (job) =>
      job.attachNewSetupToJob(setup),
    );
  });

  it("stores a plain row too, which the class cannot", () => {
    const row = { id: "setup-3", runCount: 5, jobCount: 1 };
    const document = structuredClone(withSetups());
    commands.attachNewSetupToJob(row).recipe(document);

    expect(document.build.setup["setup-3"]).toEqual(row);
    expect(document.layout.setupToEdit).toBe("setup-3");
  });

  it("removes the setup being edited, as the job does", () => {
    agree(withSetups(), commands.deleteActiveSetup(), (job) =>
      job.deleteActiveSetup(),
    );
  });

  it("will not remove the last setup, as the job does", () => {
    const one = documentFor({
      build: {
        ...documentFor().build,
        setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
      },
      layout: { setupToEdit: "setup-1" },
    });
    agree(one, commands.deleteActiveSetup(), (job) => job.deleteActiveSetup());
  });
});

// Marking a grouped job for sale is one thing the reader did, so it is one
// command: the job moves on a stage and is offered at the same time. Taking the
// mark off leaves the stage alone — the job was built either way.
describe("offering a grouped job for sale", () => {
  const ran = (document) =>
    produce(document, commands.toggleReadyForSaleFromGroup().recipe);

  it("finishes the job as it offers it", () => {
    const offered = ran(documentFor({ jobStatus: 3, isReadyToSell: false }));

    expect(offered.isReadyToSell).toBe(true);
    expect(offered.displayOnPlanner).toBe(true);
    expect(offered.jobStatus).toBe(4);
  });

  it("leaves the stage where it is when the mark comes off", () => {
    const withdrawn = ran(
      documentFor({
        jobStatus: 4,
        isReadyToSell: true,
        displayOnPlanner: true,
      }),
    );

    expect(withdrawn.isReadyToSell).toBe(false);
    expect(withdrawn.displayOnPlanner).toBe(false);
    expect(withdrawn.jobStatus).toBe(4);
  });
});

// The setup a reader changes is stored as they set it and worked out again in
// the same step — storing it without the second half leaves a job whose figures
// no longer follow the setup they come from.
describe("storing a changed setup", () => {
  const withSetup = (overrides = {}) =>
    documentFor({
      layout: { setupToEdit: "setup-1" },
      // A setup is worked out from the job's own copy of the recipe.
      rawData: { materials: [{ typeID: 34, quantity: 10 }] },
      build: {
        ...documentFor().build,
        setup: {
          "setup-1": { id: "setup-1", runCount: 1, jobCount: 1, ...overrides },
        },
      },
    });

  it("keeps what the reader set", () => {
    const changed = { id: "setup-1", runCount: 25, jobCount: 3 };

    const stored = produce(
      withSetup(),
      commands.storeSetup(changed, "set the runs").recipe,
    ).build.setup["setup-1"];

    expect(stored.runCount).toBe(25);
    expect(stored.jobCount).toBe(3);
  });

  it("works out what it needs from the job's own blueprint", () => {
    const stored = produce(
      withSetup(),
      commands.storeSetup({ id: "setup-1", runCount: 2 }, "set the runs")
        .recipe,
    ).build.setup["setup-1"];

    // The recipe's own figure, which only appears once the setup has been
    // worked out against it — the class starts with an empty count either way.
    expect(stored.materialCount["34"].rawQuantity).toBe(10);
  });

  it("leaves the job alone when handed nothing to store", () => {
    const document = withSetup();

    expect(
      produce(document, commands.storeSetup(undefined, "set the runs").recipe),
    ).toBe(document);
  });
});

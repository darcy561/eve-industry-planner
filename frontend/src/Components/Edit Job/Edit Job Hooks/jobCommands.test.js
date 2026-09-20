import { describe, expect, it } from "vitest";

import Job from "../../../Classes/job";
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

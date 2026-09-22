import { describe, expect, it } from "vitest";
import { produce } from "immer";

import ExtraCost from "../../../Classes/extraCost";
import InventionEntry from "../../../Classes/inventionEntry";
import Job from "../../../Classes/job";
import Setup from "../../../Classes/jobSetup";
import LinkedESIJob from "../../../Classes/linkedESIJob";
import MarketOrder from "../../../Classes/marketOrder";
import BrokerFee from "../../../Classes/brokerFee";
import Transaction from "../../../Classes/transaction";
import * as commands from "./jobCommands";

/**
 * A command is checked one of two ways.
 *
 * `changes` compares the document the command produced with the same document
 * changed by hand. `agree` compares it with what the method of the same name on
 * `Job` produces, for the commands whose method the class still carries: a
 * command writing the paths its author had in mind proves much less than two
 * answers agreeing, and where they differ one of them is wrong.
 *
 * Either way the comparison is on whole documents, because that is the shape a
 * command works in, and because a command that also moved something the case
 * did not name then fails.
 */

/* eslint-disable vitest/expect-expect --
 * A case asserting through `agree` or `changes` is one the rule cannot see
 * into: it matches `expect` at the top level of a test. Naming either helper in
 * the shared config would turn the rule off for any function of that name
 * anywhere, which is a wider change than this file is owed.
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

/**
 * Runs the command over the document and compares the result with the same
 * document changed by hand.
 *
 * The comparison is still on whole documents, so a command that also moved
 * something the case did not name fails. What it does not do is ask the class:
 * a method with no caller left is one this project is removing, and a test
 * holding the only reference to it would have to be rewritten on the way out.
 */
function changes(document, command, applyToDocument) {
  const viaCommand = structuredClone(document);
  command.recipe(viaCommand);

  const expected = structuredClone(document);
  applyToDocument(expected);

  expect(viaCommand).toEqual(expected);
}

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

  const owner = { CharacterHash: "hash", CharacterID: 500 };

  it("stores the run against the character who installed it", () => {
    changes(documentFor(), commands.linkESIJob(linked, owner), (job) => {
      job.esi.industryJobs["901"] = LinkedESIJob.fromESI(
        linked,
        owner,
      ).toDocument();
    });
  });

  // The panel links on a delay, so a second click or a "link all" can arrive
  // before the first has landed; linking twice would show the run twice and
  // charge its install cost twice.
  it("leaves a run it already holds alone", () => {
    const already = { job_id: 900, status: "delivered" };

    changes(documentFor(), commands.linkESIJob(already, owner), () => {});
  });

  it("will not store a run whose installer it cannot name", () => {
    changes(documentFor(), commands.linkESIJob(linked, null), () => {});
  });

  it("takes a linked run off again", () => {
    changes(documentFor(), commands.unlinkESIJob({ job_id: 900 }), (job) => {
      delete job.esi.industryJobs["900"];
    });
  });

  // A sale is attributed to an order by where it happened, so taking the order
  // off takes the sales made at that place with it — and leaves the one made
  // somewhere else.
  it("takes an order off with the sales made where it was listed", () => {
    const order = { order_id: 700, location_id: 60003760 };

    changes(documentFor(), commands.removeMarketOrder(order), (job) => {
      delete job.esi.marketOrders["700"];
      delete job.esi.transactions["800"];
    });
  });

  it("takes a sale off by its own id", () => {
    changes(
      documentFor(),
      commands.removeTransaction({ transaction_id: 800 }),
      (job) => {
        delete job.esi.transactions["800"];
      },
    );
  });
});

describe("the costs a reader adds by hand", () => {
  // Stored as the row class writes it rather than as the reader typed it: the
  // row carries defaults the panel reading it back expects to find.
  it("stores an extra cost under its own id", () => {
    const extra = { id: "extra-2", category: "1", extraValue: 25 };

    changes(documentFor(), commands.addExtrasCost(extra), (job) => {
      job.build.extrasCosts["extra-2"] = new ExtraCost(extra).toDocument();
    });
  });

  it("takes an extra cost off by id", () => {
    changes(
      documentFor(),
      commands.removeExtrasCost({ id: "extra-1" }),
      (job) => {
        delete job.build.extrasCosts["extra-1"];
      },
    );
  });

  it("stores an invention cost under its own id", () => {
    const entry = { id: "inv-2", itemName: "Decryptor", itemCost: 10 };

    changes(documentFor(), commands.addInventionCost(entry), (job) => {
      job.build.inventionEntries["inv-2"] = new InventionEntry(
        entry,
      ).toDocument();
    });
  });

  // Rows written before the change carry a number rather than a string. The id
  // is only ever compared, never parsed, so both kinds sit in one job without
  // anything having to know which it is holding.
  it("takes off an invention cost whose id is a number", () => {
    const numbered = documentFor({
      build: {
        ...documentFor().build,
        inventionEntries: {
          1789083363901: { id: 1789083363901, itemName: "Old", itemCost: 5 },
          "inv-1": { id: "inv-1", itemCost: 50 },
        },
      },
    });

    changes(
      numbered,
      commands.removeInventionCost({ id: 1789083363901 }),
      (job) => {
        delete job.build.inventionEntries["1789083363901"];
      },
    );
  });

  // Two rows minted in the same moment are told apart by their ids alone, so a
  // remove matching on id has to take one of a pair without the other.
  it("takes off one of a pair minted together, leaving the other", () => {
    const datacore = InventionEntry.forItem("Datacore", 100).toDocument();
    const decryptor = InventionEntry.forItem("Decryptor", 200).toDocument();
    const pair = documentFor({
      build: {
        ...documentFor().build,
        inventionEntries: {
          [datacore.id]: datacore,
          [decryptor.id]: decryptor,
        },
      },
    });

    changes(pair, commands.removeInventionCost(datacore), (job) => {
      delete job.build.inventionEntries[datacore.id];
    });
  });

  it("takes an invention cost off by id", () => {
    changes(
      documentFor(),
      commands.removeInventionCost({ id: "inv-1" }),
      (job) => {
        delete job.build.inventionEntries["inv-1"];
      },
    );
  });

  it("takes a purchase off the material it was bought for", () => {
    changes(
      documentFor(),
      commands.removeMaterialPurchase(34, "buy-1"),
      (job) => {
        delete job.build.materials["34"].purchasing["buy-1"];
      },
    );
  });

  it("leaves the job alone where the material is not one it builds", () => {
    changes(
      documentFor(),
      commands.removeMaterialPurchase(99, "buy-1"),
      () => {},
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

  // A job inside a group is not on the planner until it is ready to sell, and
  // then it is: the two move together in both directions.
  it("marks ready for sale, and puts the job on the planner", () => {
    changes(grouped(), commands.toggleGroupJobReadyForSale(), (job) => {
      job.isReadyToSell = true;
      job.displayOnPlanner = true;
    });
  });

  it("takes the mark back off, and the job off the planner with it", () => {
    const ready = documentFor({
      groupID: "group-1",
      includedInGroup: true,
      isReadyToSell: true,
      displayOnPlanner: true,
    });

    changes(ready, commands.toggleGroupJobReadyForSale(), (job) => {
      job.isReadyToSell = false;
      job.displayOnPlanner = false;
    });
  });

  it("records the seller and the place chosen", () => {
    const plan = { sellerCharacter: "hash-1", saleLocationID: "60003760" };

    changes(documentFor(), commands.setSellingPlan(plan), (job) => {
      job.build.sellerCharacter = "hash-1";
      job.build.saleLocationID = "60003760";
    });
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

    changes(chosen, commands.setSellingPlan(plan), (job) => {
      job.build.sellerCharacter = null;
    });
  });

  it("leaves a choice it was told nothing about", () => {
    const plan = { saleLocationID: "60008494" };

    changes(documentFor(), commands.setSellingPlan(plan), (job) => {
      job.build.saleLocationID = "60008494";
    });
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
  it("stores a sale under its own id", () => {
    const sale = { transaction_id: 802, location_id: 60003760, quantity: 5 };

    changes(documentFor(), commands.addTransaction(sale), (job) => {
      job.esi.transactions["802"] = {
        ...new Transaction(sale).toDocument(),
        order_id: 700,
      };
    });
  });

  it("stores several sales at once", () => {
    const sales = [
      { transaction_id: 802, location_id: 60003760 },
      { transaction_id: 803, location_id: 60003760 },
    ];

    changes(documentFor(), commands.addTransaction(sales), (job) => {
      for (const sale of sales) {
        job.esi.transactions[String(sale.transaction_id)] = {
          ...new Transaction(sale).toDocument(),
          order_id: 700,
        };
      }
    });
  });

  // One order is the only case where a sale can be attributed at all.
  it("attributes a sale to the only order there is", () => {
    const sale = { transaction_id: 802, location_id: 60003760 };

    changes(documentFor(), commands.addTransaction(sale), (job) => {
      job.esi.transactions["802"] = {
        ...new Transaction(sale).toDocument(),
        order_id: 700,
      };
    });
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

    changes(twoOrders, commands.addTransaction(sale), (job) => {
      job.esi.transactions["802"] = {
        ...new Transaction(sale).toDocument(),
        order_id: null,
      };
    });
  });

  it("stores an order under its own id", () => {
    const order = {
      order_id: 701,
      location_id: 60008494,
      issued: "2026-01-01T00:00:00Z",
    };
    changes(documentFor(), commands.addMarketOrder(order), (job) => {
      job.esi.marketOrders["701"] = MarketOrder.fromESI(order).toDocument();
    });
  });

  it("records the fee charged for listing it", () => {
    const order = { order_id: 701, location_id: 60008494 };
    const fee = {
      order_id: 701,
      amount: 250,
      salesTax: 10,
      date: "2026-01-01",
    };
    changes(documentFor(), commands.addMarketOrder(order, fee), (job) => {
      const row = MarketOrder.fromESI(order);
      row.recordBrokerFee(new BrokerFee(fee));
      job.esi.marketOrders["701"] = row.toDocument();
    });
  });

  it("takes the latest figures for a linked run", () => {
    const latest = [
      { job_id: 900, status: "delivered", end_date: "2026-01-02" },
    ];

    changes(documentFor(), commands.updateLinkedJobData(latest), (job) => {
      job.esi.industryJobs["900"] = {
        ...job.esi.industryJobs["900"],
        status: "delivered",
        completed_date: null,
        end_date: "2026-01-02",
      };
    });
  });

  // A run the game has already finished with is not asked about again: what it
  // ended as is what the job records, and a later report cannot move it.
  it("leaves a run that is no longer active where it stands", () => {
    const finished = documentFor({
      esi: {
        ...documentFor().esi,
        industryJobs: { 900: { job_id: 900, status: "delivered" } },
      },
    });
    const latest = [{ job_id: 900, status: "active", end_date: "2026-01-09" }];

    changes(finished, commands.updateLinkedJobData(latest), () => {});
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

  it("removes the setup being edited, and opens what is left", () => {
    changes(withSetups(), commands.deleteActiveSetup(), (job) => {
      delete job.build.setup["setup-1"];
      job.layout.setupToEdit = "setup-2";
    });
  });

  // A job always builds from something, so there is no state in which it has
  // none: the control that removes one is what stops at the last.
  it("will not remove the last setup", () => {
    const one = documentFor({
      build: {
        ...documentFor().build,
        setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 1 } },
      },
      layout: { setupToEdit: "setup-1" },
    });

    changes(one, commands.deleteActiveSetup(), () => {});
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

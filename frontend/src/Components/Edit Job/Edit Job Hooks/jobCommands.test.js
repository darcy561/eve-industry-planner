import { describe, expect, it } from "vitest";
import { produce } from "immer";

import ExtraCost from "../../../Classes/extraCost";
import InventionEntry from "../../../Classes/inventionEntry";
import {
  jobFromDocument,
  toDocument,
} from "../../../Functions/Job/jobDocument";
import Setup from "../../../Classes/jobSetup";
import LinkedESIJob from "../../../Classes/linkedESIJob";
import MarketOrder from "../../../Classes/marketOrder";
import BrokerFee from "../../../Classes/brokerFee";
import Transaction from "../../../Classes/transaction";
import * as commands from "./jobCommands";

/* eslint-disable vitest/expect-expect */

const documentFor = (overrides = {}) =>
  toDocument(
    jobFromDocument({
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
    }),
  );

function changes(document, command, applyToDocument) {
  const viaCommand = structuredClone(document);
  command.recipe(viaCommand);

  const expected = structuredClone(document);
  applyToDocument(expected);

  expect(viaCommand).toEqual(expected);
}

describe("moving between stages", () => {
  it("steps forward as the reader asked", () => {
    changes(documentFor(), commands.stepForward(), (job) => {
      job.jobStatus = 2;
    });
  });

  it("steps back as the reader asked", () => {
    changes(documentFor(), commands.stepBackward(), (job) => {
      job.jobStatus = 0;
    });
  });

  it("sets a stage as the reader asked", () => {
    changes(documentFor(), commands.setJobStatus(3), (job) => {
      job.jobStatus = 3;
    });
  });

  it("ignores a stage that is not a number, as the reader asked", () => {
    changes(documentFor(), commands.setJobStatus("nonsense"), () => {});
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
  it("removes a child job as the reader asked", () => {
    changes(documentFor(), commands.removeChildJob(34, "child-1"), (job) => {
      job.build.childJobs[34] = ["child-2"];
    });
  });

  it("removes several child jobs at once, as the reader asked", () => {
    const ids = ["child-1", "child-2"];
    changes(documentFor(), commands.removeChildJob(34, ids), (job) => {
      job.build.childJobs[34] = [];
    });
  });

  it("adds a child job as the reader asked", () => {
    changes(documentFor(), commands.addChildJob(34, "child-3"), (job) => {
      job.build.childJobs[34] = ["child-1", "child-2", "child-3"];
    });
  });

  it("will not add one under a material the job does not build", () => {
    changes(documentFor(), commands.addChildJob(99, "child-3"), () => {});
  });

  it("keeps only the child jobs named, as the reader asked", () => {
    changes(documentFor(), commands.keepOnlyChildJobs(["child-2"]), (job) => {
      job.build.childJobs[34] = ["child-2"];
      job.build.childJobs[35] = ["child-2"];
    });
  });

  it("adds a parent job as the reader asked", () => {
    changes(documentFor(), commands.addParentJob("parent-3"), (job) => {
      job.parentJobs = ["parent-1", "parent-2", "parent-3"];
    });
  });

  it("does not add a parent twice, as the reader asked", () => {
    changes(documentFor(), commands.addParentJob("parent-1"), () => {});
  });

  it("removes a parent job as the reader asked", () => {
    changes(documentFor(), commands.removeParentJob("parent-1"), (job) => {
      job.parentJobs = ["parent-2"];
    });
  });

  it("keeps only the parent jobs named, as the reader asked", () => {
    changes(documentFor(), commands.keepOnlyParentJobs(["parent-2"]), (job) => {
      job.parentJobs = ["parent-2"];
    });
  });
});

describe("groups and selling", () => {
  const grouped = () =>
    documentFor({
      groupID: "group-1",
      includedInGroup: true,
      displayOnPlanner: false,
    });

  it("assigns to a group as the reader asked", () => {
    changes(documentFor(), commands.assignToGroup("group-1"), (job) => {
      job.includedInGroup = true;
      job.groupID = "group-1";
      job.displayOnPlanner = false;
    });
  });

  it("releases to the planner as the reader asked", () => {
    changes(grouped(), commands.releaseFromGroupToPlanner(), (job) => {
      job.includedInGroup = false;
      job.groupID = "";
      job.displayOnPlanner = true;
    });
  });

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

  it("clears a choice given as null, as the reader asked", () => {
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

  it("records the whole purchase where the job needs that many", () => {
    changes(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, { availableToBuy: 100 }),
      (job) => {
        job.build.materials["34"].purchasing["buy-3"] = {
          id: "buy-3",
          childID: null,
          childJobImport: false,
          itemCount: 30,
          itemCost: 7,
        };
      },
    );
  });

  it("records only what the job still needs", () => {
    changes(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, { availableToBuy: 10 }),
      (job) => {
        job.build.materials["34"].purchasing["buy-3"] = {
          id: "buy-3",
          childID: null,
          childJobImport: false,
          itemCount: 10,
          itemCost: 7,
        };
      },
    );
  });

  it("keeps the whole purchase when asked to record the excess", () => {
    changes(
      documentFor(),
      commands.importPurchaseToMaterial(34, purchase, {
        availableToBuy: 10,
        recordExcess: true,
      }),
      (job) => {
        job.build.materials["34"].purchasing["buy-3"] = {
          id: "buy-3",
          childID: null,
          childJobImport: false,
          itemCount: 30,
          itemCost: 7,
        };
      },
    );
  });

  it("reports what a purchase takes and leaves", () => {
    expect(commands.importedQuantities(purchase, 10)).toEqual({
      taken: 10,
      leftOver: 20,
    });
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

  it("attaches a setup built through its own class, as the row it says", () => {
    const setup = new Setup({ id: "setup-3", runCount: 5, jobCount: 1 });
    changes(withSetups(), commands.attachNewSetupToJob(setup), (job) => {
      job.build.setup["setup-3"] = setup.toDocument();
      job.layout.setupToEdit = "setup-3";
    });
  });

  it("stores a plain row as it is given", () => {
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

describe("storing a changed setup", () => {
  const withSetup = (overrides = {}) =>
    documentFor({
      layout: { setupToEdit: "setup-1" },

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

    expect(stored.materialCount["34"].rawQuantity).toBe(10);
  });

  it("leaves the job alone when handed nothing to store", () => {
    const document = withSetup();

    expect(
      produce(document, commands.storeSetup(undefined, "set the runs").recipe),
    ).toBe(document);
  });
});

describe("running a command without a draft", () => {
  const jobWithChild = () => ({
    parentJobs: ["old-parent"],
    build: { childJobs: { 34: ["child-1", "child-2"] } },
  });

  it("changes the job it is given", () => {
    const job = jobWithChild();

    commands.applyCommands(job, commands.removeChildJob(34, "child-1"));

    expect(job.build.childJobs[34]).toEqual(["child-2"]);
  });

  it("runs them in the order they are given", () => {
    const job = jobWithChild();

    commands.applyCommands(
      job,
      commands.removeParentJob("old-parent"),
      commands.addParentJob("new-parent"),
    );

    expect(job.parentJobs).toEqual(["new-parent"]);
  });

  it("answers the job, so a caller can read what it left", () => {
    const job = jobWithChild();

    expect(commands.applyCommands(job, commands.addParentJob("extra"))).toBe(
      job,
    );
  });

  it("leaves a job alone when it is given no commands", () => {
    const job = jobWithChild();

    commands.applyCommands(job);

    expect(job).toEqual(jobWithChild());
  });
});

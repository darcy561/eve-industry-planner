import BrokerFee from "../../../Classes/brokerFee";
import ExtraCost from "../../../Classes/extraCost";
import InventionEntry from "../../../Classes/inventionEntry";
import Setup from "../../../Classes/jobSetup";
import LinkedESIJob from "../../../Classes/linkedESIJob";
import MarketOrder from "../../../Classes/marketOrder";
import Transaction from "../../../Classes/transaction";
import { asIDList } from "../../../Functions/Helper/ids";

/**
 * What a reader can do to a job, each as a named recipe changing the document it
 * is handed in place.
 */

/** @typedef {(job: object) => void} Recipe */

const command = (name, recipe) => ({ name, recipe });

/**
 * Applies commands to a job in order, changing it in place, for a caller outside
 * the editor that has no draft to run them through.
 *
 * @param {object} job
 * @param {...{recipe: Recipe}} commands
 * @returns {object} The job it was given
 */
export function applyCommands(job, ...commands) {
  for (const command of commands) command.recipe(job);
  return job;
}

/** Moves the job on a stage. */
export const stepForward = () =>
  command("move to the next stage", (job) => {
    job.jobStatus += 1;
  });

/** Takes the job back a stage. */
export const stepBackward = () =>
  command("move to the previous stage", (job) => {
    job.jobStatus -= 1;
  });

/** @param {number|string} statusID */
export const setJobStatus = (statusID) =>
  command("move to another stage", (job) => {
    const status = Number(statusID);
    if (Number.isNaN(status)) return;
    job.jobStatus = status;
  });

/**
 * Links an industry job ESI reported to this job, taking the owner rather than
 * looking it up.
 *
 * @param {object} esiJob - The run as ESI reported it
 * @param {{CharacterHash: string, CharacterID?: number}} jobOwner
 */
export const linkESIJob = (esiJob, jobOwner) =>
  command("link industry job", (job) => {
    if (!esiJob || !jobOwner) return;
    const linked = LinkedESIJob.fromESI(esiJob, jobOwner);
    const id = String(linked.job_id);
    if (job.esi.industryJobs[id]) return;
    job.esi.industryJobs[id] = linked.toDocument();
  });

/** @param {{job_id: number}} linkedJob */
export const unlinkESIJob = (linkedJob) =>
  command("unlink industry job", (job) => {
    if (!linkedJob) return;
    delete job.esi.industryJobs[String(linkedJob.job_id)];
  });

/** @param {object} newItem - The row to store, carrying its own id */
export const addExtrasCost = (newItem) =>
  command("add extra cost", (job) => {
    if (!newItem) return;
    const extra = new ExtraCost(newItem);
    job.build.extrasCosts[extra.id] = extra.toDocument();
  });

/** @param {{id: string}} item */
export const removeExtrasCost = (item) =>
  command("remove extra cost", (job) => {
    if (!item) return;
    delete job.build.extrasCosts[item.id];
  });

/** @param {object} inputObject - The row to store, carrying its own id */
export const addInventionCost = (inputObject) =>
  command("add invention cost", (job) => {
    if (!inputObject) return;
    const entry = new InventionEntry(inputObject);
    job.build.inventionEntries[entry.id] = entry.toDocument();
  });

/** @param {{id: string}} entry */
export const removeInventionCost = (entry) =>
  command("remove invention cost", (job) => {
    if (!entry) return;
    delete job.build.inventionEntries[entry.id];
  });

/**
 * @param {number|string} materialTypeID
 * @param {string|Array<string>|Set<string>} childIDToRemove
 */
export const removeChildJob = (materialTypeID, childIDToRemove) =>
  command("remove child job", (job) => {
    if (!materialTypeID || !childIDToRemove) return;
    const held = job.build.childJobs[materialTypeID];
    if (!held) return;

    const removing = asIDList(childIDToRemove);
    job.build.childJobs[materialTypeID] = held.filter(
      (id) => !removing.includes(id),
    );
  });

/** @param {string|Array<string>|Set<string>} includedJobIDs */
export const keepOnlyChildJobs = (includedJobIDs) =>
  command("remove child jobs", (job) => {
    if (!includedJobIDs) return;

    const keeping = asIDList(includedJobIDs);
    for (const [typeID, held] of Object.entries(job.build.childJobs)) {
      job.build.childJobs[typeID] = held.filter((id) => keeping.includes(id));
    }
  });

/**
 * Adds a child job under a material, which has to be one the job already builds
 * from.
 *
 * @param {number|string} materialTypeID
 * @param {string|Array<string>|Set<string>} childIDToAdd
 */
export const addChildJob = (materialTypeID, childIDToAdd) =>
  command("add child job", (job) => {
    if (!materialTypeID || !childIDToAdd) return;
    const held = job.build.childJobs[materialTypeID];
    if (!held) return;

    job.build.childJobs[materialTypeID] = [
      ...new Set([...held, ...asIDList(childIDToAdd)]),
    ];
  });

/** @param {string|Array<string>|Set<string>} parentJobID */
export const addParentJob = (parentJobID) =>
  command("add parent job", (job) => {
    if (!parentJobID) return;
    job.parentJobs = [
      ...new Set([...job.parentJobs, ...asIDList(parentJobID)]),
    ];
  });

/** @param {string|Array<string>|Set<string>} parentJobID */
export const removeParentJob = (parentJobID) =>
  command("remove parent job", (job) => {
    if (!parentJobID) return;
    const removing = asIDList(parentJobID);
    job.parentJobs = job.parentJobs.filter((id) => !removing.includes(id));
  });

/** @param {string|Array<string>|Set<string>} includedJobIDs */
export const keepOnlyParentJobs = (includedJobIDs) =>
  command("remove parent jobs", (job) => {
    if (!includedJobIDs) return;
    const keeping = asIDList(includedJobIDs);
    job.parentJobs = job.parentJobs.filter((id) => keeping.includes(id));
  });

export const releaseFromGroupToPlanner = () =>
  command("remove from group", (job) => {
    job.includedInGroup = false;
    job.groupID = "";
    job.displayOnPlanner = true;
  });

/** @param {string} groupID */
export const assignToGroup = (groupID) =>
  command("add to group", (job) => {
    job.includedInGroup = true;
    job.groupID = groupID;
    job.displayOnPlanner = false;
  });

/**
 * Marks a grouped job ready to sell, or takes the mark off, showing it on the
 * planner while it still belongs to its group.
 */
export const toggleGroupJobReadyForSale = () =>
  command("mark ready for sale", (job) => {
    const ready = !job.isReadyToSell;
    job.isReadyToSell = ready;
    job.displayOnPlanner = ready;
  });

/**
 * Brings the job's linked market orders up to date with what ESI now says.
 *
 * @param {Array<object>} latestOrders - Every order the caches hold
 */
export const refreshLinkedMarketOrders = (latestOrders) =>
  command("refresh linked orders", (job) => {
    if (!latestOrders?.length) return;

    for (const [id, stored] of Object.entries(job.esi.marketOrders)) {
      const reported = latestOrders.filter(
        (candidate) => candidate.order_id === stored.order_id,
      );
      if (reported.length === 0) continue;

      const latest =
        reported.find((order) => order.is_corporation) ?? reported[0];
      const order = new MarketOrder(stored);
      if (order.applyLatest(latest)) {
        job.esi.marketOrders[id] = order.toDocument();
      }
    }
  });

/**
 * Offers a grouped job for sale, moving it on a stage; taking the mark off leaves
 * the stage where it is.
 */
export const toggleReadyForSaleFromGroup = () =>
  command("offer for sale", (job) => {
    if (!job.isReadyToSell) job.jobStatus += 1;
    const ready = !job.isReadyToSell;
    job.isReadyToSell = ready;
    job.displayOnPlanner = ready;
  });

/**
 * Records a sale the reader entered by hand, with no order stamped onto it.
 *
 * @param {object} transaction
 */
export const addCustomTransaction = (transaction) =>
  command("add sale", (job) => {
    if (!transaction) return;
    const sale = new Transaction(transaction);
    job.esi.transactions[String(sale.transaction_id)] = sale.toDocument();
  });

/**
 * The reader's choices about the job's own screens.
 *
 * @param {object} patch - The layout keys to set
 */
export const setJobLayout = (patch) =>
  command("change the view", (job) => {
    if (!patch) return;
    Object.assign(job.layout, patch);
  });

/**
 * The job's own pricing choice — which market and order type each side is read at.
 *
 * @param {object} patch - The build keys to set
 */
export const setJobPricing = (patch) =>
  command("choose where prices come from", (job) => {
    if (!patch) return;
    Object.assign(job.build, patch);
  });

/** @param {{transaction_id: number}} transaction */
export const removeTransaction = (transaction) =>
  command("unlink sale", (job) => {
    if (!transaction) return;
    delete job.esi.transactions[String(transaction.transaction_id)];
  });

/**
 * Records who is selling and from where, leaving a key the caller does not name
 * alone and clearing one given as null.
 *
 * @param {{sellerCharacter?: string|null, saleLocationID?: string|null}} plan
 */
export const setSellingPlan = (plan) =>
  command("choose where to sell", (job) => {
    if (!plan) return;
    if ("sellerCharacter" in plan)
      job.build.sellerCharacter = plan.sellerCharacter;
    if ("saleLocationID" in plan)
      job.build.saleLocationID = plan.saleLocationID;
  });

/**
 * Unlinks a market order, and the sales recorded against where it was listed.
 *
 * @param {{order_id: number, location_id: number}} order
 */
export const removeMarketOrder = (order) =>
  command("unlink market order", (job) => {
    if (!order) return;
    delete job.esi.marketOrders[String(order.order_id)];

    for (const [id, sale] of Object.entries(job.esi.transactions)) {
      if (sale.location_id === order.location_id) {
        delete job.esi.transactions[id];
      }
    }
  });

/**
 * @param {number|string} materialID
 * @param {string} purchaseID
 */
export const removeMaterialPurchase = (materialID, purchaseID) =>
  command("remove purchase", (job) => {
    const material = job.build.materials[String(materialID)];
    if (!material) return;
    delete material.purchasing[purchaseID];
  });

/**
 * Records sales ESI reported against this job, attributing one to the job's order
 * only where the job has exactly one.
 *
 * @param {object|Array<object>} transaction - One sale, or several
 */
export const addTransaction = (transaction) =>
  command("link sale", (job) => {
    if (!transaction) return;

    const rows = (Array.isArray(transaction) ? transaction : [transaction]).map(
      (row) => new Transaction(row).toDocument(),
    );

    const orders = Object.values(job.esi.marketOrders);
    const soleOrderID = orders.length === 1 ? orders[0].order_id : null;

    for (const row of rows) {
      row.order_id = soleOrderID;
      job.esi.transactions[String(row.transaction_id)] = row;
    }
  });

/**
 * Records a market order, and the fee charged for listing it.
 *
 * @param {object} order - The order as ESI reported it
 * @param {object} [brokersFee] - The fee, where one was found for it
 */
export const addMarketOrder = (order, brokersFee) =>
  command("link market order", (job) => {
    if (!order) return;

    const row = MarketOrder.fromESI(order);
    if (brokersFee) {
      row.recordBrokerFee(
        brokersFee instanceof BrokerFee
          ? brokersFee
          : new BrokerFee(brokersFee),
      );
    }
    job.esi.marketOrders[String(row.order_id)] = row.toDocument();
  });

/**
 * Takes the latest figures ESI reported for the runs already linked.
 *
 * @param {Array<object>} latestESIJobs - Every run ESI reported
 */
export const updateLinkedJobData = (latestESIJobs) =>
  command("update linked jobs", (job) => {
    if (!latestESIJobs) return;

    for (const [id, held] of Object.entries(job.esi.industryJobs)) {
      const linked = new LinkedESIJob(held);
      linked.applyLatest(latestESIJobs.find((i) => i.job_id === linked.job_id));
      job.esi.industryJobs[id] = linked.toDocument();
    }
  });

/**
 * Records what was bought for a material, taking how many the job still needs
 * rather than working it out.
 *
 * @param {number|string} materialID
 * @param {object} purchase - What was bought, carrying its own id
 * @param {{availableToBuy: number, recordExcess?: boolean}} options
 */
export const importPurchaseToMaterial = (materialID, purchase, options) =>
  command("add purchase", (job) => {
    recordPurchase(job, materialID, purchase, options);
  });

/**
 * Imports several purchases as one step, so taking a paste back takes all of it
 * back.
 *
 * @param {Array<{materialID: number|string, purchase: object, options?: object}>} imports
 */
export const importPurchasesToMaterials = (imports) =>
  command("import purchases", (job) => {
    for (const { materialID, purchase, options } of imports ?? []) {
      recordPurchase(job, materialID, purchase, options);
    }
  });

function recordPurchase(job, materialID, purchase, options) {
  const material = job.build.materials[String(materialID)];
  if (!material) return;

  const { availableToBuy = 0, recordExcess = false } = options ?? {};
  const offered = Number(purchase?.itemCount) || 0;
  if (offered <= 0) return;

  const taken = Math.max(0, Math.min(offered, availableToBuy));
  const recorded = recordExcess ? offered : taken;
  if (recorded <= 0) return;

  const childID = purchase.childID ?? null;
  const id = String(purchase.id);
  material.purchasing[id] = {
    id,
    childID,
    childJobImport: Boolean(childID),
    itemCount: recorded,
    itemCost: purchase.itemCost,
  };
}

/**
 * What a purchase of this size would take and leave, asked before the change is
 * made by a caller deciding where the rest goes.
 *
 * @param {object} purchase
 * @param {number} availableToBuy
 * @returns {{taken: number, leftOver: number}}
 */
export function importedQuantities(purchase, availableToBuy) {
  const offered = Number(purchase?.itemCount) || 0;
  if (offered <= 0) return { taken: 0, leftOver: 0 };

  const taken = Math.max(0, Math.min(offered, availableToBuy));
  return { taken, leftOver: offered - taken };
}

/**
 * Puts a setup on the job and opens it for editing, the caller having built what
 * it holds.
 *
 * @param {object} setup - The setup to attach, carrying its own id
 */
export const attachNewSetupToJob = (setup) =>
  command("add setup", (job) => {
    if (!setup?.id) return;
    job.build.setup[setup.id] =
      typeof setup.toDocument === "function" ? setup.toDocument() : setup;
    job.layout.setupToEdit = setup.id;
  });

/**
 * Removes one setup, opening another when it was the one open; the last setup cannot be removed.
 *
 * @param {string} setupID
 */
export const deleteSetup = (setupID) =>
  command("remove setup", (job) => {
    const ids = Object.keys(job.build.setup);
    if (ids.length <= 1 || !ids.includes(setupID)) return;

    delete job.build.setup[setupID];
    if (job.layout.setupToEdit === setupID) {
      job.layout.setupToEdit = Object.keys(job.build.setup).at(-1);
    }
  });

/**
 * Stores a changed setup — a copy, not the one on screen — and works out again
 * what it needs.
 *
 * @param {object} setup - The setup as the reader has now set it
 * @param {string} name - What the reader did, for the undo step
 */
export const storeSetup = (setup, name) =>
  command(name, (job) => {
    if (!setup?.id) return;
    const next = new Setup(setup);
    next.recalculateMaterials(job.rawData.materials, job.itemID);
    job.build.setup[next.id] = next.toDocument();
  });

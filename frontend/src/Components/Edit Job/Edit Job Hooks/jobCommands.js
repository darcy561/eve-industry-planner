import BrokerFee from "../../../Classes/brokerFee";
import ExtraCost from "../../../Classes/extraCost";
import InventionEntry from "../../../Classes/inventionEntry";
import Setup from "../../../Classes/jobSetup";
import LinkedESIJob from "../../../Classes/linkedESIJob";
import MarketOrder from "../../../Classes/marketOrder";
import Transaction from "../../../Classes/transaction";
import { asIDList } from "../../../Functions/Helper/ids";

/**
 * What a reader can do to a job, as changes against the document rather than
 * writes into an object.
 *
 * Each command is a plain function of the job and its input: it is handed the
 * document and changes it in place, and the store around it records which paths
 * moved and what puts them back. A command therefore has no access to anything
 * outside the job — whatever it needs that the document does not hold, such as a
 * minted id or a figure read from a store, is an argument.
 *
 * `name` is what an undo step is called, so it reads as the thing the player
 * did rather than as the field that moved.
 *
 * A command that stores a new row builds it through the row's own class and
 * stores what that says. The classes are cheap and read only their own fields,
 * and they are where a row's defaults live — a command filling those in itself
 * would be a second statement of the row's shape, and the two would part.
 */

/** @typedef {(job: object) => void} Recipe */

const command = (name, recipe) => ({ name, recipe });

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
 * Links an industry job ESI reported to this job.
 *
 * Which character read the run is not something the job knows, so the owner is
 * given rather than looked up.
 *
 * @param {object} esiJob - The run as ESI reported it
 * @param {{CharacterHash: string, CharacterID?: number}} jobOwner
 */
export const linkESIJob = (esiJob, jobOwner) =>
  command("link industry job", (job) => {
    if (!esiJob) return;
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
 * Adds a child job under a material.
 *
 * The material has to be one the job already builds: a child job is a decision
 * about how a material is sourced, so there is nothing to attach one to where
 * the job does not need that material.
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
 * Marks a grouped job ready to sell, or takes the mark off.
 *
 * A job ready for sale shows on the planner while still belonging to its group,
 * so the two flags move together.
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

      // A corporation order is reported by every character holding the role,
      // and the corporation's own reading is the one that owns it.
      const latest =
        reported.find((order) => order.is_corporation) ?? reported[0];
      const order = new MarketOrder(stored);
      if (order.applyLatest(latest)) {
        job.esi.marketOrders[id] = order.toDocument();
      }
    }
  });

/**
 * Offers a grouped job for sale, which also finishes it.
 *
 * Marking a job for sale is the reader saying it is built and on the market, so
 * it moves on a stage with the mark. Taking the mark off leaves the stage alone
 * — the job was built either way.
 */
export const toggleReadyForSaleFromGroup = () =>
  command("offer for sale", (job) => {
    if (!job.isReadyToSell) job.jobStatus += 1;
    const ready = !job.isReadyToSell;
    job.isReadyToSell = ready;
    job.displayOnPlanner = ready;
  });

/**
 * Records a sale the reader entered by hand.
 *
 * `addTransaction` is for a sale that came from a linked order and stamps that
 * order onto it, which a sale typed in by hand has none of.
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
 * The job's own pricing choice — which market and basis each side is read at.
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
 * Records who is selling and from where.
 *
 * A key the caller does not name is left alone, while a key given as null
 * clears it — a player taking an override off is saying something different
 * from a caller that had nothing to say about it.
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
 * ESI carries no link between an order and the sales made from it, so where it
 * was listed is the only thing tying them together.
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
 * Records sales ESI reported against this job.
 *
 * A sale is attributed to the job's order only where there is exactly one to
 * attribute it to: ESI carries no link between an order and a transaction, so
 * with two orders on a job there is nothing to choose between them. The
 * attribution is made when the sale is recorded and never revisited, so an
 * order linked afterwards does not claim sales recorded before it.
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
 * Records what was bought for a material.
 *
 * How many the job still needs is a figure over the whole job — every setup's
 * requirement, less what is already bought — so it is given rather than read
 * here, and the command reports what it took through {@link importedQuantities}.
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
 * Imports several purchases as one step, for a paste covering many materials.
 *
 * One command rather than one per row, so taking the paste back takes all of it
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
 * What a purchase of this size would take and leave, for a caller deciding
 * where the rest goes.
 *
 * Kept beside the command rather than inside it because the answer is wanted
 * before the change is made: a caller spreading one purchase across several
 * materials needs to know what each will absorb.
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
 * Puts a setup on the job and opens it for editing.
 *
 * What a new setup holds is decided from the player's settings and their
 * blueprints, so it is built by the caller and attached here.
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
 * Removes the setup being edited, and opens another.
 *
 * A job always builds from something, so the last setup cannot be removed.
 */
export const deleteActiveSetup = () =>
  command("remove setup", (job) => {
    const ids = Object.keys(job.build.setup);
    if (ids.length <= 1) return;

    delete job.build.setup[job.layout.setupToEdit];
    job.layout.setupToEdit = Object.keys(job.build.setup).at(-1);
  });

/**
 * Stores a changed setup and works out again what it needs.
 *
 * The caller changes a copy rather than the setup on screen, because the job the
 * page reads is rebuilt from what the session holds and a change written into it
 * reaches nothing.
 *
 * @param {object} setup - The setup as the reader has now set it
 * @param {string} name - What the reader did, for the undo step
 */
export const storeSetup = (setup, name) =>
  command(name, (job) => {
    if (!setup?.id) return;
    const next = new Setup(setup);
    next.recalculateMaterials(job.rawData.materials);
    job.build.setup[next.id] = next.toDocument();
  });

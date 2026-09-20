import ExtraCost from "../../../Classes/extraCost";
import InventionEntry from "../../../Classes/inventionEntry";
import LinkedESIJob from "../../../Classes/linkedESIJob";
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

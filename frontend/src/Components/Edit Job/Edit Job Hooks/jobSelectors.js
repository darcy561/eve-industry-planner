/**
 * Figures read off a job as functions of the document, each `…Of` variant taking
 * only the rows its figure is read from.
 */

import { asNumberIDList, asStringIDList } from "../../../Functions/Helper/ids";
import { finishesAt } from "./linkedRunSelectors";
import {
  boughtCost,
  purchaseComplete,
  purchasedCost,
} from "./materialSelectors";

/**
 * The jobs this one feeds.
 *
 * @param {object} job
 * @returns {Array<string>}
 */
export function parentJobIDs(job) {
  return asStringIDList(job?.parentJobs);
}

/**
 * The jobs building this one's materials, across every material.
 *
 * @param {object} job
 * @returns {Array<string>}
 */
export function childJobIDs(job) {
  return Object.values(job?.build?.childJobs ?? {}).flat();
}

/**
 * Every job this one is linked to in either direction, parents first.
 *
 * @param {object} job
 * @returns {Array<string>}
 */
export function relatedJobIDs(job) {
  return [...parentJobIDs(job), ...childJobIDs(job)];
}

/**
 * The systems the job's setups build in, one entry each.
 *
 * @param {object} job
 * @returns {Array<number>}
 */
export function setupSystemIDs(job) {
  return systemIDsOf(job?.build?.setup);
}

/**
 * @param {object} setups
 * @returns {Array<number>}
 */
function systemIDsOf(setups) {
  return [
    ...new Set(Object.values(setups ?? {}).map((setup) => setup?.systemID)),
  ];
}

/**
 * Every type the job prices: what it makes, and what it is made of.
 *
 * @param {object} job
 * @returns {Array<number>}
 */
export function materialIDs(job) {
  return [job?.itemID, ...materialTypeIDsOf(job?.build?.materials)];
}

/**
 * @param {object} materials
 * @returns {Array<number>}
 */
export function materialTypeIDsOf(materials) {
  return asNumberIDList(Object.keys(materials ?? {}));
}

/**
 * The setup the reader has open.
 *
 * @param {object} job
 * @returns {object|undefined} The setup row, or undefined where none is open
 */
export function selectedSetup(job) {
  return selectedSetupOf(job?.build?.setup, job?.layout?.setupToEdit);
}

/**
 * @param {object} setups
 * @param {string} setupToEdit
 * @returns {object|undefined}
 */
export function selectedSetupOf(setups, setupToEdit) {
  return setups?.[setupToEdit];
}

/**
 * The setup another one should continue from: the one open, or the first, rather
 * than the player's defaults.
 *
 * @param {object} job
 * @returns {object|undefined}
 */
export function setupToBuildFrom(job) {
  return selectedSetup(job) ?? Object.values(job?.build?.setup ?? {})[0];
}

/**
 * The parents this job will have once the links the reader asked for are carried
 * out, which is the document's list with those intents folded over it.
 *
 * @param {Array<string>|undefined} parentJobIDs - What the job holds
 * @param {{add?: Array<string>, remove?: Array<string>}} [parentJobEdits]
 * @returns {Array<string>}
 */
export function parentJobIDsAfterEdits(parentJobIDs, parentJobEdits = {}) {
  return foldLinks(parentJobIDs, parentJobEdits);
}

/**
 * The child jobs a material would have once those links are carried out, counting
 * an unsaved child job as linked where one is given.
 *
 * @param {object} job
 * @param {number|string} materialTypeID
 * @param {Object<string, {add?: Array<string>, remove?: Array<string>}>} childJobEdits
 * @param {object} [temporaryChildJob] - The unsaved child job for this material
 * @returns {Array<string>}
 */
export function childJobsAfterEdits(
  job,
  materialTypeID,
  childJobEdits = {},
  temporaryChildJob,
) {
  return childJobIDsAfterEdits(
    job?.build?.childJobs?.[materialTypeID],
    childJobEdits[materialTypeID],
    temporaryChildJob,
  );
}

/**
 * @param {Array<string>|undefined} linkedChildJobIDs - What the job holds
 * @param {{add?: Array<string>, remove?: Array<string>}} [edits] - What the
 *   reader has marked for this material
 * @param {object} [temporaryChildJob] - The unsaved child job for it
 * @returns {Array<string>}
 */
export function childJobIDsAfterEdits(
  linkedChildJobIDs,
  edits,
  temporaryChildJob,
) {
  return foldLinks(
    [
      ...(linkedChildJobIDs ?? []),
      ...(temporaryChildJob ? [temporaryChildJob.jobID] : []),
    ],
    edits,
  );
}

function foldLinks(held, edits = {}) {
  const remove = edits?.remove || [];
  return [
    ...new Set(
      [...(held || []), ...(edits?.add || [])].filter(
        (id) => !remove.includes(id),
      ),
    ),
  ];
}

/**
 * The ESI industry jobs linked to this job. These ids release the run back to
 * the account when the job is archived, deleted or merged.
 *
 * @param {object} job
 * @returns {Set<number>}
 */
export function esiJobIDs(job) {
  return esiJobIDsOf(job?.esi?.industryJobs);
}

/**
 * @param {object} industryJobs
 * @returns {Set<number>}
 */
export function esiJobIDsOf(industryJobs) {
  return idsOf(industryJobs, "job_id");
}

/**
 * @param {object} job
 * @returns {Set<number>} The ESI market orders linked to this job
 */
export function esiOrderIDs(job) {
  return esiOrderIDsOf(job?.esi?.marketOrders);
}

/**
 * @param {object} marketOrders
 * @returns {Set<number>}
 */
export function esiOrderIDsOf(marketOrders) {
  return idsOf(marketOrders, "order_id");
}

/**
 * @param {object} job
 * @returns {Set<number>} The ESI transactions linked to this job
 */
export function esiTransactionIDs(job) {
  return esiTransactionIDsOf(job?.esi?.transactions);
}

/**
 * @param {object} transactions
 * @returns {Set<number>}
 */
export function esiTransactionIDsOf(transactions) {
  return idsOf(transactions, "transaction_id");
}

function idsOf(rows, field) {
  return new Set(Object.values(rows ?? {}).map((row) => row[field]));
}

/**
 * What the linked runs were charged to install, which is what the job actually
 * paid rather than what its setups estimate.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalInstallCost(job) {
  return costOfInstalls(job?.esi?.industryJobs);
}

/**
 * @param {object} industryJobs
 * @returns {number}
 */
export function costOfInstalls(industryJobs) {
  return sumOf(industryJobs, (linked) => linked?.cost);
}

/**
 * What the extras cost, summed from the rows the Extras panel keeps.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalExtrasCost(job) {
  return costOfExtras(job?.build?.extrasCosts);
}

/**
 * @param {object} extrasCosts
 * @returns {number}
 */
export function costOfExtras(extrasCosts) {
  return sumOf(extrasCosts, (extra) => extra?.extraValue);
}

/**
 * What invention cost, summed from the entries recorded against the job.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalInventionCost(job) {
  return costOfInvention(job?.build?.inventionEntries);
}

/**
 * @param {object} inventionEntries
 * @returns {number}
 */
export function costOfInvention(inventionEntries) {
  return sumOf(inventionEntries, (entry) => entry?.itemCost);
}

function sumOf(rows, figure) {
  return Object.values(rows ?? {}).reduce(
    (total, row) => total + (Number(figure(row)) || 0),
    0,
  );
}

/**
 * How many of a material the job's setups call for.
 *
 * @param {object} job
 * @param {number|string} typeID
 * @returns {number}
 */
export function materialRequirement(job, typeID) {
  return materialRequirementOf(job?.build?.setup, typeID);
}

/**
 * @param {object} setups
 * @param {number|string} typeID
 * @returns {number}
 */
export function materialRequirementOf(setups, typeID) {
  return Object.values(setups ?? {}).reduce(
    (total, setup) =>
      total + (Number(setup?.materialCount?.[String(typeID)]?.quantity) || 0),
    0,
  );
}

/**
 * What the materials the job was charged for cost.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalMaterialCost(job) {
  return costOfMaterials(job?.build?.materials, job?.build?.setup);
}

/**
 * @param {object} materials
 * @param {object} setups
 * @returns {number}
 */
export function costOfMaterials(materials, setups) {
  return Object.values(materials ?? {}).reduce(
    (total, material) =>
      total +
      purchasedCost(material, materialRequirementOf(setups, material.typeID)),
    0,
  );
}

/**
 * How many of the job's materials have been bought in full.
 *
 * @param {object} job
 * @returns {number}
 */
export function completedMaterialCount(job) {
  return materialsBoughtInFull(job?.build?.materials, job?.build?.setup);
}

/**
 * How many of the job's materials are still short of what it needs.
 *
 * @param {object} job
 * @returns {number}
 */
export function remainingMaterialCount(job) {
  const materials = job?.build?.materials ?? {};
  return (
    Object.keys(materials).length -
    materialsBoughtInFull(materials, job?.build?.setup)
  );
}

/**
 * What the job spent buying materials rather than building them, leaving out
 * anything imported from a child job.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalBoughtMaterialCost(job) {
  return Object.values(job?.build?.materials ?? {}).reduce(
    (total, material) => total + boughtCost(material),
    0,
  );
}

/**
 * Whether every material the job calls for has been bought, with a job calling
 * for nothing not yet ready.
 *
 * @param {object} job
 * @returns {boolean}
 */
export function isReadyToBuild(job) {
  const count = Object.keys(job?.build?.materials ?? {}).length;
  if (count === 0) return false;
  return count === completedMaterialCount(job);
}

/**
 * Whether the job is bought for and has not been started, which is the group
 * tree's "Ready" chip.
 *
 * @param {object} job
 * @returns {boolean}
 */
export function isReadyToStart(job) {
  const status = Number(job?.jobStatus);
  if (status === 3 || status === 4) return false;
  if (!isReadyToBuild(job)) return false;
  return Object.keys(job?.esi?.industryJobs ?? {}).length === 0;
}

/**
 * The linked run that finishes first, which is what the planner counts down to.
 *
 * @param {object} job
 * @returns {object|null}
 */
export function nextRunToFinish(job) {
  return runFinishingAt(job, (a, b) => a < b);
}

/**
 * The linked run that finishes last, which is when the job as a whole is done.
 *
 * @param {object} job
 * @returns {object|null}
 */
export function lastRunToFinish(job) {
  return runFinishingAt(job, (a, b) => a > b);
}

/**
 * The linked run whose finish wins the given comparison, ignoring any run with no
 * end date.
 *
 * @param {object} job
 * @param {(a: number, b: number) => boolean} wins
 * @returns {object|null}
 */
function runFinishingAt(job, wins) {
  return Object.values(job?.esi?.industryJobs ?? {}).reduce((held, run) => {
    if (finishesAt(run) === null) return held;
    if (!held || wins(finishesAt(run), finishesAt(held))) return run;
    return held;
  }, null);
}

/**
 * The characters the job has actually used, by hash: the ones that ran it and
 * the ones that listed it.
 *
 * @param {object} job
 * @returns {Set<string>}
 */
export function involvedCharacters(job) {
  const characters = new Set();
  for (const run of Object.values(job?.esi?.industryJobs ?? {})) {
    characters.add(run.CharacterHash);
  }
  for (const order of Object.values(job?.esi?.marketOrders ?? {})) {
    characters.add(order.CharacterHash);
  }
  return characters;
}

/**
 * @param {object} materials
 * @param {object} setups
 * @returns {number}
 */
export function materialsBoughtInFull(materials, setups) {
  return Object.values(materials ?? {}).filter((material) =>
    purchaseComplete(material, materialRequirementOf(setups, material.typeID)),
  ).length;
}

/**
 * How many setups the job is built from.
 *
 * @param {object} job
 * @returns {number}
 */
export function setupCount(job) {
  return Object.values(job?.build?.setup ?? {}).length;
}

/**
 * How many items the job produces: what its setups are set to make.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalQuantityProduced(job) {
  return quantityProduced(job?.build?.setup, job?.itemsProducedPerRun);
}

/**
 * @param {object} setups
 * @param {number} itemsProducedPerRun
 * @returns {number}
 */
export function quantityProduced(setups, itemsProducedPerRun) {
  return Object.values(setups ?? {}).reduce(
    (total, { runCount, jobCount }) =>
      total + (Number(itemsProducedPerRun) || 0) * runCount * jobCount,
    0,
  );
}

/**
 * What it cost to build the item, before any cost of selling it.
 *
 * @param {object} job
 * @returns {number}
 */
export function buildCost(job) {
  return buildCostOf({
    materials: job?.build?.materials,
    setups: job?.build?.setup,
    industryJobs: job?.esi?.industryJobs,
    extrasCosts: job?.build?.extrasCosts,
    inventionEntries: job?.build?.inventionEntries,
  });
}

/**
 * What a build costs: these four figures and nothing else, totalled in one place
 * so no panel adds them up itself.
 *
 * @param {object} parts
 * @returns {number}
 */
export function buildCostOf({
  materials,
  setups,
  industryJobs,
  extrasCosts,
  inventionEntries,
}) {
  return (
    costOfMaterials(materials, setups) +
    costOfInstalls(industryJobs) +
    costOfExtras(extrasCosts) +
    costOfInvention(inventionEntries)
  );
}

/**
 * How many job slots the build takes: one per job on each setup.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalJobSlots(job) {
  return jobSlotsOf(job?.build?.setup);
}

/**
 * @param {object} setups
 * @returns {number}
 */
export function jobSlotsOf(setups) {
  return Object.values(setups ?? {}).reduce(
    (total, setup) => total + (Number(setup?.jobCount) || 0),
    0,
  );
}

/**
 * Broker fees paid to list the output.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalBrokersFees(job) {
  return brokersFeesOf(job?.esi?.marketOrders);
}

/**
 * @param {object} marketOrders
 * @returns {number}
 */
export function brokersFeesOf(marketOrders) {
  return sumOf(marketOrders, (order) => order?.fee);
}

/**
 * Fees taken on the sales. `transaction.tax` keeps ESI's own name for the same
 * figure, which is where it is read from.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalTransactionFees(job) {
  return transactionFeesOf(job?.esi?.transactions);
}

/**
 * @param {object} transactions
 * @returns {number}
 */
export function transactionFeesOf(transactions) {
  return sumOf(transactions, (transaction) => transaction?.tax);
}

/**
 * What the sales brought in.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalSales(job) {
  return salesOf(job?.esi?.transactions);
}

/**
 * @param {object} transactions
 * @returns {number}
 */
export function salesOf(transactions) {
  return sumOf(transactions, (transaction) => transaction?.amount);
}

/**
 * Tax expected on orders that have not sold yet, counted only while an order has
 * produced no transaction of its own.
 *
 * @param {object} job
 * @returns {number}
 */
export function estimatedSalesTaxOutstanding(job) {
  return taxOutstandingOn(job?.esi?.marketOrders, job?.esi?.transactions);
}

/**
 * @param {object} marketOrders
 * @param {object} transactions
 * @returns {number}
 */
export function taxOutstandingOn(marketOrders, transactions) {
  const sold = new Set(
    Object.values(transactions ?? {}).map((row) => row.order_id),
  );

  return Object.values(marketOrders ?? {}).reduce(
    (total, order) =>
      sold.has(order.order_id) ? total : total + (Number(order?.salesTax) || 0),
    0,
  );
}

/**
 * What the job cost: building it, and then selling it.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalCost(job) {
  return totalCostOf({
    buildCost: buildCost(job),
    brokersFees: totalBrokersFees(job),
    transactionFees: totalTransactionFees(job),
  });
}

/**
 * @param {{buildCost: number, brokersFees: number, transactionFees: number}} parts
 * @returns {number}
 */
export function totalCostOf({ buildCost, brokersFees, transactionFees }) {
  return buildCost + brokersFees + transactionFees;
}

/**
 * What one unit cost to make, before any cost of selling it, which is what a
 * parent build pays for a child job's output.
 *
 * @param {object} job
 * @returns {number}
 */
export function buildCostPerItem(job) {
  return costPerItem(job, buildCost(job));
}

/**
 * What one unit cost in total, selling included.
 *
 * @param {object} job
 * @returns {number}
 */
export function totalCostPerItem(job) {
  return costPerItem(job, totalCost(job));
}

function costPerItem(job, cost) {
  return perItem(cost, totalQuantityProduced(job));
}

/**
 * A cost divided between the items it made, or nothing where none were.
 *
 * @param {number} cost
 * @param {number} produced
 * @returns {number}
 */
export function perItem(cost, produced) {
  return produced ? cost / produced : 0;
}

/**
 * What a sold item went for on average.
 *
 * @param {object} job
 * @returns {number} Sales over items sold, or 0 when nothing has sold
 */
export function averageItemSalePrice(job) {
  return averageSalePriceOf(job?.esi?.transactions);
}

/**
 * @param {object} transactions
 * @returns {number}
 */
export function averageSalePriceOf(transactions) {
  const itemsSold = sumOf(transactions, (transaction) => transaction?.quantity);
  return itemsSold ? salesOf(transactions) / itemsSold : 0;
}

/**
 * The job's sales, newest first; a panel reads them through
 * {@link salesNewestFirst} rather than selecting this out of a draft.
 *
 * @param {object} job
 * @returns {Array<object>}
 */
export function salesByDate(job) {
  return salesNewestFirst(job?.esi?.transactions);
}

/**
 * @param {object} transactions
 * @returns {Array<object>}
 */
export function salesNewestFirst(transactions) {
  return Object.values(transactions ?? {}).sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
}

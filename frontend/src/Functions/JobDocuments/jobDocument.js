import { jobTypes } from "../../Context/defaultValues";
import Setup from "../../Classes/jobSetup";
import Material from "../../Classes/jobMaterial";
import LinkedESIJob from "../../Classes/linkedESIJob";
import BrokerFee from "../../Classes/brokerFee";
import ExtraCost from "../../Classes/extraCost";
import InventionEntry from "../../Classes/inventionEntry";
import MarketOrder from "../../Classes/marketOrder";
import Transaction from "../../Classes/transaction";
import { asStringID } from "../Helper/ids";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A job's own choice of where each side of it is priced, or null where it made
 * none and the account's defaults price it.
 *
 * @param {object|null|undefined} stored - `build.localPricing` as stored
 * @returns {{buying: {market: string|null, orderType: string|null},
 *   selling: {market: string|null, orderType: string|null}}|null}
 */
function jobPricingOverride(stored) {
  const side = (name) => ({
    market: stored?.[name]?.market || null,
    orderType: stored?.[name]?.orderType || null,
  });

  const buying = side("buying");
  const selling = side("selling");
  const chosenAnywhere =
    buying.market || buying.orderType || selling.market || selling.orderType;

  return chosenAnywhere ? { buying, selling } : null;
}

/**
 * A job as the planner holds one: plain data, read from a stored document or
 * from what the SDE gives a job being created.
 *
 * @param {Object} itemJson - A stored job document, or the item a job is built from
 * @param {Object} [buildRequest] - What the reader asked to build
 * @param {string} [buildRequest.groupID]
 * @param {Array<string>} [buildRequest.parentJobs]
 * @param {Array<Object>} [buildRequest.childJobs]
 * @returns {Object} The job, holding no class instances
 */
export function jobFromDocument(itemJson, buildRequest) {
  const build = itemJson?.build;
  const groupID = asStringID(itemJson?.groupID ?? buildRequest?.groupID) ?? "";
  const isReadyToSell = itemJson?.isReadyToSell || false;
  const includedInGroup = itemJson?.includedInGroup ?? groupID.trim() !== "";
  const displayFromDoc =
    itemJson?.displayOnPlanner ?? itemJson?.isIncludedOnPlanner;
  const storedOverrides =
    build && "materialPriceOverrides" in build
      ? build.materialPriceOverrides
      : itemJson?.layout?.materialPriceOverrides;
  const accountID = useUsersStore.getState().account.accountID || "";

  const job = {
    metaLevel:
      itemJson?.metaLevel ??
      itemJson?.metaGroupID ??
      itemJson?.metaGroup ??
      null,
    jobType: itemJson.jobType,
    name: itemJson.name,
    jobID: itemJson?.jobID || `job-${crypto.randomUUID()}`,
    jobStatus: itemJson?.jobStatus || 0,
    volume: itemJson.volume,
    itemID: itemJson.itemID,
    maxProductionLimit: itemJson.maxProductionLimit,
    parentJobs:
      itemJson?.parentJobs ||
      itemJson?.parentJob ||
      buildRequest?.parentJobs ||
      [],
    blueprintTypeID: itemJson?.blueprintTypeID || null,
    isReadyToSell,
    groupID,
    includedInGroup,
    displayOnPlanner:
      displayFromDoc !== undefined && displayFromDoc !== null
        ? Boolean(displayFromDoc)
        : !includedInGroup || isReadyToSell,
    build: {
      setup: setupRows(itemJson),
      childJobs: build?.childJobs || {},
      extrasCosts: keyRowsBy(
        build?.extrasCosts ?? build?.costs?.extrasCosts,
        "id",
        (row) => new ExtraCost(row),
      ),
      inventionEntries: keyRowsBy(
        build?.inventionEntries ?? build?.costs?.inventionEntries,
        "id",
        (row) => new InventionEntry(row),
      ),
      sellerCharacter:
        build?.sellerCharacter ?? build?.sale?.plan?.sellerCharacter ?? null,
      saleLocationID:
        build?.saleLocationID ?? build?.sale?.plan?.saleLocationID ?? null,
      materials: materialRows(itemJson?.build?.materials),
      materialPriceOverrides:
        storedOverrides &&
        typeof storedOverrides === "object" &&
        !Array.isArray(storedOverrides)
          ? storedOverrides
          : {},
      localPricing: jobPricingOverride(
        build && "localPricing" in build
          ? build.localPricing
          : itemJson?.layout?.localPricing,
      ),
    },
    esi: esiRows(itemJson),
    rawData: itemJson?.rawData || {},
    skills: keyByTypeID(itemJson?.skills),
    itemsProducedPerRun: itemJson?.itemsProducedPerRun || 0,
    layout: {
      esiJobTab: itemJson?.layout?.esiJobTab || null,
      setupToEdit: itemJson?.layout?.setupToEdit || null,
      resourceDisplayType: itemJson?.layout?.resourceDisplayType || null,
    },
    _meta: {
      lastModified: itemJson?._meta?.lastModified || new Date().toISOString(),
      createdAt: itemJson?._meta?.createdAt || new Date().toISOString(),
      lastUpdatedBy: itemJson?._meta?.lastUpdatedBy || accountID || "",
    },
  };

  if (itemJson?._meta && "revision" in itemJson._meta) {
    job._meta.revision = itemJson._meta.revision;
  }

  return job;
}

/**
 * Fills a new job in from the recipe the SDE gives for the item it makes, and
 * links the child jobs the reader asked for.
 *
 * @param {Object} job - The job being created, as {@link jobFromDocument} made it
 * @param {Object} itemJson - The item, carrying its `activities`
 * @param {Object} [buildRequest] - What the reader asked to build
 * @returns {Object} The same job
 */
export function applyRecipeToJob(job, itemJson, buildRequest) {
  const activity =
    itemJson.jobType === jobTypes.manufacturing
      ? itemJson.activities.manufacturing
      : itemJson.jobType === jobTypes.reaction
        ? itemJson.activities.reaction
        : null;

  if (activity) {
    job.rawData.materials = activity.materials;
    job.rawData.products = activity.products;
    job.rawData.time = activity.time;
    job.skills = keyByTypeID(activity.skills);
    job.build.materials = materialRows(activity.materials);
    job.itemsProducedPerRun = activity.products[0].quantity;
  }

  for (const typeID of Object.keys(job.build.materials)) {
    const buildItem = buildRequest?.childJobs?.find(
      (i) => String(i.typeID) === typeID,
    );

    job.build.childJobs[typeID] = buildItem?.childJobs
      ? [...buildItem.childJobs]
      : [];
  }

  job.layout.setupToEdit = Object.keys(job.build.setup)[0];

  return job;
}

/**
 * What a job stores, which is every field the document carries and nothing a
 * reader added to it.
 *
 * @param {Object} job
 * @returns {Object} The document, sharing no child job list with the job
 */
export function toDocument(job) {
  const build = job.build ?? {};
  const esi = job.esi ?? {};
  const layout = job.layout ?? {};

  return {
    metaLevel: job.metaLevel,
    jobType: job.jobType,
    name: job.name,
    jobID: job.jobID,
    jobStatus: job.jobStatus,
    volume: job.volume,
    itemID: job.itemID,
    maxProductionLimit: job.maxProductionLimit,
    parentJobs: job.parentJobs,
    blueprintTypeID: job.blueprintTypeID,
    groupID: job.groupID ?? "",
    includedInGroup: job.includedInGroup,
    displayOnPlanner: job.displayOnPlanner,
    isReadyToSell: job.isReadyToSell,
    build: {
      setup: build.setup ?? {},
      childJobs: copiedChildJobs(build.childJobs),
      materials: build.materials ?? {},
      extrasCosts: build.extrasCosts ?? {},
      inventionEntries: build.inventionEntries ?? {},
      sellerCharacter: build.sellerCharacter ?? null,
      saleLocationID: build.saleLocationID ?? null,
      localPricing: build.localPricing ?? null,
      materialPriceOverrides: build.materialPriceOverrides || {},
    },
    esi: {
      industryJobs: esi.industryJobs ?? {},
      marketOrders: esi.marketOrders ?? {},
      transactions: esi.transactions ?? {},
    },
    rawData: job.rawData ?? {},
    skills: job.skills ?? {},
    itemsProducedPerRun: job.itemsProducedPerRun,
    layout: {
      esiJobTab: layout.esiJobTab ?? null,
      setupToEdit: layout.setupToEdit ?? null,
      resourceDisplayType: layout.resourceDisplayType ?? null,
    },
    _meta: { ...job._meta },
  };
}

/**
 * A job that can be changed without disturbing the one it was copied from.
 *
 * @param {Object} job
 * @returns {Object}
 */
export function copyOfJob(job) {
  return structuredClone(toDocument(job));
}

/**
 * The job's setups as stored rows, each built through the class that owns a
 * setup's shape so its defaults are stated once.
 *
 * @param {Object} object - A job document
 * @returns {Object<string, Object>} The setups, keyed by id
 */
function setupRows(object) {
  if (!object?.build?.setup) return {};

  return Object.values(object.build.setup).reduce((acc, value) => {
    const setup = new Setup(value);
    acc[setup.id] = setup.toDocument();
    return acc;
  }, {});
}

/**
 * Material rows keyed by the typeID each carries, dropping a row without one,
 * read from the stored map or the array the SDE's recipe arrives as.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @returns {Object<string, Object>} The rows keyed by typeID
 */
function materialRows(rows) {
  const out = {};
  for (const row of asRows(rows)) {
    if (row?.typeID === undefined || row?.typeID === null) continue;
    out[String(row.typeID)] = new Material(row).toDocument();
  }
  return out;
}

/**
 * Keys skill rows by the typeID each carries, dropping a row without one.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @returns {Object<string, Object>} The rows keyed by typeID
 */
function keyByTypeID(rows) {
  const out = {};
  for (const row of asRows(rows)) {
    if (row?.typeID === undefined || row?.typeID === null) continue;
    out[String(row.typeID)] = row;
  }
  return out;
}

/**
 * What ESI observed about a job, each collection keyed by the id ESI assigned,
 * folding each stored broker fee onto the order it was charged against.
 *
 * @param {Object} object - A job document
 * @returns {{industryJobs: Object<string, Object>,
 *   marketOrders: Object<string, Object>,
 *   transactions: Object<string, Object>}} What ESI reported
 */
function esiRows(object) {
  const esi = object?.esi;
  const sale = object?.build?.sale;

  const orders = {};
  for (const row of asRows(esi?.marketOrders ?? sale?.marketOrders)) {
    const order = new MarketOrder(row);
    if (order?.order_id === undefined || order?.order_id === null) continue;
    orders[String(order.order_id)] = order;
  }
  for (const row of asRows(sale?.brokersFee)) {
    const order = orders[String(row?.order_id)];
    order?.recordBrokerFee(row instanceof BrokerFee ? row : new BrokerFee(row));
  }

  return {
    industryJobs: keyRowsBy(
      esi?.industryJobs ?? object?.build?.costs?.linkedJobs,
      "job_id",
      (row) => new LinkedESIJob(row),
    ),
    marketOrders: Object.fromEntries(
      Object.entries(orders).map(([id, order]) => [id, order.toDocument()]),
    ),
    transactions: keyRowsBy(
      esi?.transactions ?? sale?.transactions,
      "transaction_id",
      (row) => new Transaction(row),
    ),
  };
}

/** Rows as a list, whichever of the two shapes they are held in. */
function asRows(rows) {
  return Array.isArray(rows) ? rows : Object.values(rows ?? {});
}

/**
 * Copies the child job lists, so a document does not hand out the job's own and
 * a clone made from it can be changed on its own.
 *
 * @param {Object<string, Array<string>>} childJobs
 * @returns {Object<string, Array<string>>} The same keys, holding their own lists
 */
function copiedChildJobs(childJobs) {
  return Object.fromEntries(
    Object.entries(childJobs ?? {}).map(([typeID, childIDs]) => [
      typeID,
      Array.isArray(childIDs) ? [...childIDs] : childIDs,
    ]),
  );
}

/**
 * Keys rows by a named id field, building each through the class that owns its
 * shape and storing what that says, dropping a row whose id is missing.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @param {string} idField - The field holding the id ESI assigned
 * @param {Function} build - Makes the instance a row's shape comes from
 * @returns {Object<string, Object>} The rows keyed by that id
 */
function keyRowsBy(rows, idField, build) {
  const out = {};
  for (const row of asRows(rows)) {
    const instance = build(row);
    const id = instance?.[idField];
    if (id === undefined || id === null) continue;
    out[String(id)] = instance.toDocument();
  }
  return out;
}

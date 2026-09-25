import { jobTypes } from "../Context/defaultValues";
import Setup from "./jobSetup";
import Material from "./jobMaterial";
import LinkedESIJob from "./linkedESIJob";
import BrokerFee from "./brokerFee";
import { asStringID } from "../Functions/Helper/ids";
import { materialRequirementOf } from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import ExtraCost from "./extraCost";
import InventionEntry from "./inventionEntry";
import MarketOrder from "./marketOrder";
import Transaction from "./transaction";
import useUsersStore from "../Zustand/usersStore";

/**
 * A job's own choice of where each side of it is priced, or null where it has
 * made none.
 *
 * Null rather than a pair of empty sides, because a job that chose nothing is
 * priced by the account's defaults and a stored shape saying otherwise would
 * outrank them.
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
 * An industry job: its setups, materials, and the ESI rows linked to it.
 *
 * The job holds what it is made of, and reads and writes it as a document.
 * What it is worth is derived by the selectors in
 * `Edit Job Hooks/jobSelectors.js`, and what a reader does to it is a command
 * in `jobCommands.js`; neither is answered here.
 *
 * @class Job
 */
class Job {
  /**
   * @param {Object} itemJson - Job data object containing job configuration
   * @param {number} itemJson.jobType - Type of job (manufacturing, reaction, etc.)
   * @param {string} itemJson.name - Name of the item being produced
   * @param {number} itemJson.volume - Volume of the item
   * @param {number} itemJson.itemID - EVE Online type ID of the item
   * @param {number} itemJson.maxProductionLimit - Maximum production limit
   * @param {string} [itemJson.jobID] - Unique job identifier
   * @param {number} [itemJson.jobStatus] - Current job status (0-3)
   * @param {number} [itemJson.metaGroup] - Meta level of the item
   * @param {Array<string>} [itemJson.parentJobs] - Array of parent job IDs
   * @param {number} [itemJson.blueprintTypeID] - Blueprint type ID
   * @param {string|null} [itemJson.groupID] - Group ID when the job belongs to a group (omit or null when not grouped)
   * @param {boolean} [itemJson.includedInGroup] - Whether the job belongs to a group; derived from groupID when omitted
   * @param {boolean} [itemJson.displayOnPlanner] - Whether the job appears on the planner (derived when omitted)
   * @param {boolean} [itemJson.isReadyToSell] - Whether job is ready for sale
   * @param {Object} [itemJson.build] - Build configuration object
   * @param {Object} [itemJson.rawData] - Raw EVE API data
   * @param {Object|Array<Object>} [itemJson.skills] - Required skills, keyed by
   *   typeID in a stored document and an array from the SDE
   * @param {number} [itemJson.itemsProducedPerRun] - Items produced per run
   * @param {Object} [itemJson.layout] - UI layout preferences
   * @param {Object} buildRequest - Build request object for job creation
   * @param {string} [buildRequest.groupID] - Group ID for the job
   * @param {Array<Object>} [buildRequest.parentJobs] - Parent jobs array
   * @param {Object} [buildRequest.childJobs] - Child jobs configuration
   */
  constructor(itemJson, buildRequest) {
    // `metaGroupID` is what the SDE conversion emits and what a job is built
    // from; `metaLevel` is what a stored document carries. Reading only the
    // stored name left every new job at null, and the invention costs — offered
    // for T2 and T3 items, which is what the meta group says — never appeared.
    this.metaLevel =
      itemJson?.metaLevel ??
      itemJson?.metaGroupID ??
      itemJson?.metaGroup ??
      null;
    this.jobType = itemJson.jobType;
    this.name = itemJson.name;
    this.jobID = itemJson?.jobID || `job-${crypto.randomUUID()}`;
    this.jobStatus = itemJson?.jobStatus || 0;
    this.volume = itemJson.volume;
    this.itemID = itemJson.itemID;
    this.maxProductionLimit = itemJson.maxProductionLimit;
    this.parentJobs =
      itemJson?.parentJobs ||
      itemJson?.parentJob ||
      buildRequest?.parentJobs ||
      [];
    this.blueprintTypeID = itemJson?.blueprintTypeID || null;
    this.isReadyToSell = itemJson?.isReadyToSell || false;
    const mergedGroupID = itemJson?.groupID ?? buildRequest?.groupID;
    this.groupID = asStringID(mergedGroupID) ?? "";
    this.includedInGroup =
      itemJson?.includedInGroup ?? this.groupID.trim() !== "";
    const displayFromDoc =
      itemJson?.displayOnPlanner ?? itemJson?.isIncludedOnPlanner;
    this.displayOnPlanner =
      displayFromDoc !== undefined && displayFromDoc !== null
        ? Boolean(displayFromDoc)
        : !this.includedInGroup || this.isReadyToSell;
    const build = itemJson?.build;
    this.build = {
      setup: documentToSetups(itemJson),
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
      // Where the output is meant to go, as against the orders under `esi`,
      // which are where it went. Null on almost every job: absent means the
      // account's defaults apply.
      sellerCharacter:
        build?.sellerCharacter ?? build?.sale?.plan?.sellerCharacter ?? null,
      saleLocationID:
        build?.saleLocationID ?? build?.sale?.plan?.saleLocationID ?? null,
      materials: documentToMaterials(itemJson, (typeID) =>
        this.#materialRequirement(typeID),
      ),
    };
    this.esi = documentToESI(itemJson);
    this.rawData = itemJson?.rawData || {};
    this.skills = documentToSkills(itemJson);
    this.itemsProducedPerRun = itemJson?.itemsProducedPerRun || 0;
    // `in` rather than `??`: a job whose pricing the player cleared holds an
    // explicit null under `build`, and falling through on that would reinstate
    // whatever `layout` still carried from a save made before the move.
    const storedOverrides =
      build && "materialPriceOverrides" in build
        ? build.materialPriceOverrides
        : itemJson?.layout?.materialPriceOverrides;
    this.build.materialPriceOverrides =
      storedOverrides &&
      typeof storedOverrides === "object" &&
      !Array.isArray(storedOverrides)
        ? storedOverrides
        : {};

    this.build.localPricing = jobPricingOverride(
      build && "localPricing" in build
        ? build.localPricing
        : itemJson?.layout?.localPricing,
    );

    this.layout = {
      esiJobTab: itemJson?.layout?.esiJobTab || null,
      setupToEdit: itemJson?.layout?.setupToEdit || null,
      resourceDisplayType: itemJson?.layout?.resourceDisplayType || null,
    };
    // `_meta` names who owns the document, and the server states that: it owns
    // the block, overwrites whatever is uploaded, and takes identity from the
    // request headers. So nothing here carries an account id — the store is the
    // only place the SPA reads its own.
    const accountID = useUsersStore.getState().account.accountID || "";
    this._meta = {
      lastModified: itemJson?._meta?.lastModified || new Date().toISOString(),
      createdAt: itemJson?._meta?.createdAt || new Date().toISOString(),
      lastUpdatedBy: itemJson?._meta?.lastUpdatedBy || accountID || "",
    };
    // The revision is the server's count of writes to this document, and a write
    // carrying one is only made if the document is still at it. A job built from
    // anything but a stored document has none, and its write is a create — so it
    // is carried when it is there and absent when it is not, never defaulted.
    if (itemJson?._meta && "revision" in itemJson._meta) {
      this._meta.revision = itemJson._meta.revision;
    }
  }

  /**
   * @param {Object} itemJson - Raw EVE API item data
   * @param {Object} itemJson.activities - Activity data from EVE API
   * @param {Object} itemJson.activities.manufacturing - Manufacturing activity data
   * @param {Object} itemJson.activities.reaction - Reaction activity data
   * @param {Object} buildRequest - Build request configuration
   * @param {Object} [buildRequest.childJobs] - Child jobs configuration
   */
  buildJobObject(itemJson, buildRequest) {
    if (itemJson.jobType === jobTypes.manufacturing) {
      this.rawData.materials = itemJson.activities.manufacturing.materials;
      this.rawData.products = itemJson.activities.manufacturing.products;
      this.rawData.time = itemJson.activities.manufacturing.time;
      this.skills = keyByTypeID(itemJson.activities.manufacturing.skills);
      this.build.materials = keyMaterialsByTypeID(
        itemJson.activities.manufacturing.materials,
        (typeID) => this.#materialRequirement(typeID),
      );
      this.itemsProducedPerRun =
        itemJson.activities.manufacturing.products[0].quantity;
    }
    if (itemJson.jobType === jobTypes.reaction) {
      this.rawData.materials = itemJson.activities.reaction.materials;
      this.rawData.products = itemJson.activities.reaction.products;
      this.rawData.time = itemJson.activities.reaction.time;
      this.skills = keyByTypeID(itemJson.activities.reaction.skills);
      this.build.materials = keyMaterialsByTypeID(
        itemJson.activities.reaction.materials,
        (typeID) => this.#materialRequirement(typeID),
      );
      this.itemsProducedPerRun =
        itemJson.activities.reaction.products[0].quantity;
    }

    for (const typeID of Object.keys(this.build.materials)) {
      const buildItem = buildRequest?.childJobs?.find(
        (i) => String(i.typeID) === typeID,
      );

      this.build.childJobs[typeID] = buildItem?.childJobs
        ? [...buildItem.childJobs]
        : [];
    }

    this.layout.setupToEdit = Object.keys(this.build.setup)[0];
  }

  /**
   * `build.extrasCosts` stays in SPA form: `{ id, category, extraText,
   * extraValue }`, with `category` as the string id.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      metaLevel: this.metaLevel,
      jobType: this.jobType,
      name: this.name,
      jobID: this.jobID,
      jobStatus: this.jobStatus,
      volume: this.volume,
      itemID: this.itemID,
      maxProductionLimit: this.maxProductionLimit,
      parentJobs: this.parentJobs,
      blueprintTypeID: this.blueprintTypeID,
      groupID: this.groupID ?? "",
      includedInGroup: this.includedInGroup,
      displayOnPlanner: this.displayOnPlanner,
      isReadyToSell: this.isReadyToSell,
      // Every key is named rather than spread from `this.build`: a spread
      // carries the live instances the job holds, which store as whatever their
      // class happens to serialise to rather than as the row's own shape.
      build: {
        setup: rowsToDocuments(this.build.setup),
        childJobs: copiedChildJobs(this.build.childJobs),
        materials: rowsToDocuments(this.build.materials),
        extrasCosts: rowsToDocuments(this.build.extrasCosts),
        inventionEntries: rowsToDocuments(this.build.inventionEntries),
        sellerCharacter: this.build.sellerCharacter,
        saleLocationID: this.build.saleLocationID,
        localPricing: this.build.localPricing,
        materialPriceOverrides: this.build.materialPriceOverrides || {},
      },
      esi: {
        industryJobs: rowsToDocuments(this.esi.industryJobs),
        marketOrders: rowsToDocuments(this.esi.marketOrders),
        transactions: rowsToDocuments(this.esi.transactions),
      },
      rawData: this.rawData,
      skills: this.skills,
      itemsProducedPerRun: this.itemsProducedPerRun,
      layout: {
        esiJobTab: this.layout.esiJobTab,
        setupToEdit: this.layout.setupToEdit,
        resourceDisplayType: this.layout.resourceDisplayType,
      },
      _meta: { ...this._meta },
    };
  }

  /**
   * How many of a material the job's setups call for.
   *
   * @param {number} typeID - EVE type id of the material
   * @returns {number} Quantity required
   */
  #materialRequirement(typeID) {
    return materialRequirementOf(this.build.setup, typeID);
  }

  /**
   * Records a purchase against one of the job's materials.
   *
   * @param {number} materialID - Type ID of the material
   * @param {Object} purchase - What was bought, as {@link Material#importPurchase} takes it
   * @param {Object} [options] - Passed through to {@link Material#importPurchase}
   * @returns {{ taken: number, leftOver: number }} What the material took, and
   *   what is left for the caller to offer elsewhere
   */
  importPurchaseToMaterial(materialID, purchase, options) {
    const material = this.build.materials?.[String(materialID)];
    if (!material || !purchase) return { taken: 0, leftOver: 0 };

    return material.importPurchase(purchase, options);
  }

  /**
   * @param {Setup} setup
   */
  attachNewSetupToJob(setup) {
    this.build.setup[setup.id] = setup;
    this.layout.setupToEdit = setup.id;
  }

  recalculateSelectedSetup(setupId) {
    if (!setupId || !this.build.setup[setupId]) {
      console.error("Setup ID not provided or setup not found");
      return;
    }

    this.build.setup[setupId].recalculateMaterials(this.rawData.materials);
  }
}

/**
 * Helper function that converts document setup data to Setup instances.
 *
 * @param {Object} object - Object containing setup data
 * @param {Object} [object.build] - Build configuration object
 * @param {Object} [object.build.setup] - Setup data object
 * @returns {Object} Object with setup IDs as keys and Setup instances as values
 */
function documentToSetups(object) {
  if (!object?.build?.setup) {
    return {};
  }

  return Object.values(object.build.setup).reduce((acc, value) => {
    acc[value.id] = new Setup(value);
    return acc;
  }, {});
}

/**
 * Helper function that reads a document's required skills.
 *
 * Keyed by the typeID each row carries, which is how they are stored and how
 * they are held here — one shape everywhere rather than a conversion on each
 * side of the class.
 *
 * An array is still read because the SDE's blueprint data arrives as one.
 *
 * @param {Object} object - Object containing job data
 * @returns {Object<string, Object>} The skills the job requires, keyed by typeID
 */
function documentToSkills(object) {
  return keyByTypeID(object?.skills);
}

/**
 * Helper function that keys skill rows by the typeID each carries.
 *
 * A row without one is dropped rather than filed under `undefined`, which would
 * collapse every such row onto a single key.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @returns {Object<string, Object>} The rows keyed by typeID
 */
function keyByTypeID(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : Object.values(rows ?? {})) {
    if (row?.typeID === undefined || row?.typeID === null) continue;
    out[String(row.typeID)] = row;
  }
  return out;
}

/**
 * Helper function that reads what ESI observed about a job.
 *
 * Each collection is keyed by the id ESI itself assigns, so a row is found by
 * the id it already carries. A document written before the reshape holds them
 * as arrays under `build.costs` and `build.sale`, which is why both are read.
 *
 * A broker fee has no identity of its own — the journal id it arrives with is
 * shared between orders sold together in one multi-sell — so a stored fee row
 * folds onto the order it was charged against. Where two rows name one order
 * the oldest is kept, and a fee naming no order is dropped: there is nowhere
 * for it to live.
 *
 * @param {Object} object - Object containing job data
 * @returns {{industryJobs: Object<string, LinkedESIJob>,
 *   marketOrders: Object<string, MarketOrder>,
 *   transactions: Object<string, Transaction>}} What ESI reported
 */
function documentToESI(object) {
  const esi = object?.esi;
  const sale = object?.build?.sale;

  const marketOrders = keyRowsBy(
    esi?.marketOrders ?? sale?.marketOrders,
    "order_id",
    (row) => new MarketOrder(row),
  );
  for (const row of asRows(sale?.brokersFee)) {
    const order = marketOrders[String(row?.order_id)];
    order?.recordBrokerFee(row instanceof BrokerFee ? row : new BrokerFee(row));
  }

  return {
    industryJobs: keyRowsBy(
      esi?.industryJobs ?? object?.build?.costs?.linkedJobs,
      "job_id",
      (row) => new LinkedESIJob(row),
    ),
    marketOrders,
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
 * Helper function that copies the child job lists, so a document does not hand
 * out the job's own.
 *
 * A document is what a job is copied through — `new Job(source.toDocument())` is
 * how this app clones one before changing it, and a merge or a delete relies on
 * that copy to leave the planner alone until its writes have landed. Every other
 * member is rebuilt on the way out; this one was passed by reference, so a
 * change to the copy reached the job it was copied from and a write that failed
 * still left the planner altered.
 *
 * `parentJobs`, `rawData`, `skills` and `materialPriceOverrides` are still
 * handed out live, and are safe only because every mutator replaces them rather
 * than changing them in place. A mutator that does not needs copying here too.
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
 * Helper function that turns a keyed collection of instances into the rows a
 * document stores, keeping each under its own key.
 *
 * @param {Object<string, {toDocument: Function}>} rows
 * @returns {Object<string, Object>} The same keys, holding plain rows
 */
function rowsToDocuments(rows) {
  return Object.fromEntries(
    Object.entries(rows ?? {}).map(([key, row]) => [key, row.toDocument()]),
  );
}

/**
 * Helper function that keys rows by a named id field, building each one through
 * the class that owns its shape.
 *
 * A row whose id field is missing is dropped rather than filed under
 * `undefined`, which would collapse every such row onto a single key.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @param {string} idField - The field holding the id ESI assigned
 * @param {Function} build - Makes the instance held for a row
 * @returns {Object<string, Object>} The rows keyed by that id
 */
function keyRowsBy(rows, idField, build) {
  const out = {};
  for (const row of asRows(rows)) {
    const instance = build(row);
    const id = instance?.[idField];
    if (id === undefined || id === null) continue;
    out[String(id)] = instance;
  }
  return out;
}

/**
 * Helper function that converts a document's material rows to Material instances.
 *
 * Keyed by the typeID each row carries, which is how they are stored and how
 * they are held. A job with no materials holds none rather than null: the empty
 * collection says the same thing and every reader can walk it.
 *
 * An array is still read because the SDE's blueprint data arrives as one.
 *
 * @param {Object} object - Object containing job data
 * @param {Function} requirement - Looks up how many of a material the job needs
 * @returns {Object<string, Material>} The job's materials, keyed by typeID
 */
function documentToMaterials(object, requirement) {
  return keyMaterialsByTypeID(object?.build?.materials, requirement);
}

/**
 * Helper function that keys material rows by the typeID each carries.
 *
 * A row without one is dropped rather than filed under `undefined`, which would
 * collapse every such row onto a single key.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @param {Function} requirement - Looks up how many of a material the job needs
 * @returns {Object<string, Material>} The rows keyed by typeID
 */
function keyMaterialsByTypeID(rows, requirement) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : Object.values(rows ?? {})) {
    if (row?.typeID === undefined || row?.typeID === null) continue;
    out[String(row.typeID)] = new Material(row, requirement);
  }
  return out;
}

export default Job;

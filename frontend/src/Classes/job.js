import { jobTypes } from "../Context/defaultValues";
import Setup from "./jobSetup";
import Material from "./jobMaterial";
import LinkedESIJob from "./linkedESIJob";
import BrokerFee from "./brokerFee";
import {
  asIDList,
  asNumberIDList,
  asStringID,
  asStringIDList,
} from "../Functions/Helper/ids";
import ExtraCost from "./extraCost";
import InventionEntry from "./inventionEntry";
import MarketOrder from "./marketOrder";
import Transaction from "./transaction";
import useUsersStore from "../Zustand/usersStore";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
} from "../Functions/JobPlanner/setupBuildHelpers";

/**
 * An industry job: its setups, materials, costs, and the ESI rows linked to it.
 *
 * Figures the job derives — costs, totals and quantities — are getters computed
 * from the rows they come from, so none of them can fall behind an edit.
 *
 * @class Job
 */
/**
 * A job's own choice of where each side of it is priced, or null where it has
 * made none.
 *
 * A job stored before the sides were told apart carries one market and one order
 * type. Both sides seed from it: naming one market said nothing about which side
 * of the job it meant, so neither side may claim it over the other.
 *
 * @param {object|null|undefined} stored - `build.localPricing` as stored
 * @param {string|null} market - The job's single market, already resolved
 * @param {string|null} basis - The job's single order type, already resolved
 * @returns {{buying: {market: string|null, basis: string|null},
 *   selling: {market: string|null, basis: string|null}}|null}
 */
function jobPricingOverride(stored, market, basis) {
  const side = (name) => {
    const chosen = stored?.[name];
    if (chosen?.market || chosen?.basis) {
      return { market: chosen.market || null, basis: chosen.basis || null };
    }
    return { market: market ?? null, basis: basis ?? null };
  };

  const buying = side("buying");
  const selling = side("selling");
  const chosenAnywhere =
    buying.market || buying.basis || selling.market || selling.basis;

  return chosenAnywhere ? { buying, selling } : null;
}

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
        this.materialRequirement(typeID),
      ),
    };
    this.esi = documentToESI(itemJson);
    this.rawData = itemJson?.rawData || {};
    this.skills = documentToSkills(itemJson);
    this.itemsProducedPerRun = itemJson?.itemsProducedPerRun || 0;
    const storedOverrides =
      build?.materialPriceOverrides ?? itemJson?.layout?.materialPriceOverrides;
    this.build.materialPriceOverrides =
      storedOverrides &&
      typeof storedOverrides === "object" &&
      !Array.isArray(storedOverrides)
        ? storedOverrides
        : {};

    const localMarketDisplay =
      itemJson?.layout?.localMarketDisplay ??
      itemJson?.layout?.marketLocation ??
      null;
    const localOrderDisplay =
      itemJson?.layout?.localOrderDisplay ??
      itemJson?.layout?.orderType ??
      null;

    this.build.localPricing = jobPricingOverride(
      build?.localPricing ?? itemJson?.layout?.localPricing,
      localMarketDisplay,
      localOrderDisplay,
    );

    this.layout = {
      localMarketDisplay,
      localOrderDisplay,
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
        (typeID) => this.materialRequirement(typeID),
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
        (typeID) => this.materialRequirement(typeID),
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
        childJobs: this.build.childJobs,
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
        localMarketDisplay: this.layout.localMarketDisplay,
        localOrderDisplay: this.layout.localOrderDisplay,
        esiJobTab: this.layout.esiJobTab,
        setupToEdit: this.layout.setupToEdit,
        resourceDisplayType: this.layout.resourceDisplayType,
      },
      _meta: { ...this._meta },
    };
  }

  /**
   * Parent job IDs, each as a string. A hydrated document may carry `parentJob` as
   * a single value rather than an array.
   *
   * @returns {string[]}
   */
  get parentJobIDs() {
    return asStringIDList(this.parentJobs);
  }

  /**
   * The ESI industry jobs linked to this job. These ids release the run back to
   * the account when the job is archived, deleted or merged.
   *
   * @returns {Set<number>}
   */
  get esiJobIDs() {
    return new Set(Object.values(this.esi.industryJobs).map((j) => j.job_id));
  }

  /**
   * @returns {Set<number>} The ESI market orders linked to this job
   */
  get esiOrderIDs() {
    return new Set(Object.values(this.esi.marketOrders).map((o) => o.order_id));
  }

  /**
   * @returns {Set<number>} The ESI transactions linked to this job
   */
  get esiTransactionIDs() {
    return new Set(
      Object.values(this.esi.transactions).map(
        (transaction) => transaction.transaction_id,
      ),
    );
  }

  /**
   * @returns {Array<string>} Array of related job IDs
   */
  get relatedJobIDs() {
    return [...this.parentJobIDs, ...this.childJobIDs];
  }

  /**
   * @returns {Array<string>} Array of child job IDs
   */
  get childJobIDs() {
    return Object.values(this.build.childJobs).flat();
  }

  /**
   * @returns {Array<number>} Array of material type IDs
   */
  get materialIDs() {
    return [this.itemID, ...asNumberIDList(Object.keys(this.build.childJobs))];
  }

  /**
   * @returns {Array<number>} Array of system IDs
   */
  get setupSystemIDs() {
    return [
      ...Object.values(this.build.setup).reduce((prev, { systemID }) => {
        return prev.add(systemID);
      }, new Set()),
    ];
  }

  stepForward() {
    this.jobStatus++;
  }

  stepBackward() {
    this.jobStatus--;
  }

  /**
   * @param {number} statusID - The status ID to set (0-3)
   */
  setJobStatus(statusID) {
    const n = Number(statusID);
    if (Number.isNaN(n)) return;
    this.jobStatus = n;
  }

  /**
   * The linked rows are what the installs cost — see {@link Job#totalInstallCost}
   * — so there is no separate total to keep in step.
   *
   * @param {Object} esiJob - ESI job data from EVE Online API
   * @param {number} esiJob.job_id - ESI job ID
   * @param {number} esiJob.cost - Installation cost
   * @param {Object} jobOwner - The character the job was read for
   * @param {string} jobOwner.CharacterHash
   * @param {number} [jobOwner.CharacterID]
   */
  linkESIJob(esiJob, jobOwner) {
    if (!esiJob || !jobOwner) return;
    // Linking the same run twice would show it twice and charge its install
    // cost twice, and the panel links on a delay, so a second click or a "link
    // all" can arrive before the first has landed.
    if (this.esiJobIDs.has(esiJob.job_id)) return;
    const linked = LinkedESIJob.fromESI(esiJob, jobOwner);
    this.esi.industryJobs[String(linked.job_id)] = linked;
  }

  /**
   * Its install cost goes with it, because {@link Job#totalInstallCost} reads the
   * remaining rows.
   *
   * @param {Object} linkedJob - Linked ESI job object to remove
   * @param {number} linkedJob.job_id - ESI job ID to remove
   */
  unlinkESIJob(linkedJob) {
    if (!linkedJob) return;
    delete this.esi.industryJobs[String(linkedJob.job_id)];
  }

  /**
   * Canonical row shape (same as Extras panel): `{ id, category, extraText, extraValue }`.
   *
   * @param {Object} newItem - Extra cost row
   * @param {string} newItem.id
   * @param {string|number} newItem.category - coerced to string before store
   * @param {string} newItem.extraText
   * @param {number} newItem.extraValue
   */
  addExtrasCost(newItem) {
    if (!newItem) return;
    const extra =
      newItem instanceof ExtraCost ? newItem : new ExtraCost(newItem);
    this.build.extrasCosts[extra.id] = extra;
  }

  /**
   * @param {Object} item - Extra cost item to remove
   * @param {string} item.id - Unique identifier for the cost item
   */
  removeExtrasCost(item) {
    if (!item) return;
    delete this.build.extrasCosts[item.id];
  }
  /**
   * @param {Object} inputObject - Invention cost object
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost of the invention item
   */
  addInventionCost(inputObject) {
    if (!inputObject) return;
    const entry =
      inputObject instanceof InventionEntry
        ? inputObject
        : new InventionEntry(inputObject);
    this.build.inventionEntries[entry.id] = entry;
  }

  /**
   * @param {Object} inputObject - Invention cost object to remove
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost to subtract
   */
  removeInventionCost(inputObject) {
    if (!inputObject) return;
    delete this.build.inventionEntries[inputObject.id];
  }

  /**
   * @returns {number} Number of setups
   */
  get setupCount() {
    return Object.values(this.build.setup).length;
  }

  /**
   * @returns {number} Number of completed materials
   */
  get completedMaterialCount() {
    return Object.values(this.build.materials).filter(
      (material) => material.purchaseComplete,
    ).length;
  }

  /**
   * True when the job has at least one material and every material is purchase-complete.
   * Stage-independent (Planning / Purchasing / Building can all match once mats are bought).
   *
   * @returns {boolean}
   */
  get isReadyToBuild() {
    const count = Object.keys(this.build?.materials ?? {}).length;
    if (count === 0) return false;
    return count === this.completedMaterialCount;
  }

  /**
   * Group job tree “Ready” chip: all materials bought and no linked ESI industry jobs yet
   * (link runs → Building / progress). Hidden on Complete and For Sale.
   *
   * @returns {boolean}
   */
  get isReadyToStart() {
    const status = Number(this.jobStatus);
    if (status === 3 || status === 4) return false;
    if (!this.isReadyToBuild) return false;
    return this.esiJobIDs.size === 0;
  }

  /**
   * @returns {number} Number of remaining materials
   */
  get remainingMaterialCount() {
    return Object.values(this.build.materials).filter(
      (material) => !material.purchaseComplete,
    ).length;
  }

  /**
   * @returns {number} Total job count
   */
  get totalJobSlots() {
    return Object.values(this.build.setup).reduce(
      (total, { jobCount }) => total + jobCount,
      0,
    );
  }

  /**
   * Summed from the linked rows at call time, so linking or unlinking a run moves
   * it and there is no stored total to keep in step.
   *
   * Backend twin: `models.Job.TotalInstallCost`.
   *
   * @returns {number} Install cost
   */
  get totalInstallCost() {
    return Object.values(this.esi.industryJobs).reduce(
      (total, linkedJob) => total + (Number(linkedJob?.cost) || 0),
      0,
    );
  }

  /**
   * What the extras cost, summed from the rows the Extras panel keeps.
   *
   * Backend twin: `models.Job.TotalExtrasCost`.
   *
   * @returns {number} Extras total
   */
  get totalExtrasCost() {
    return Object.values(this.build.extrasCosts).reduce(
      (total, extra) => total + (Number(extra?.extraValue) || 0),
      0,
    );
  }

  /**
   * What invention cost, summed from the entries recorded against the job.
   *
   * Backend twin: `models.Job.TotalInventionCost`.
   *
   * @returns {number} Invention total
   */
  get totalInventionCost() {
    return Object.values(this.build.inventionEntries).reduce(
      (total, entry) => total + (Number(entry?.itemCost) || 0),
      0,
    );
  }

  /**
   * What it cost to build the item, before any cost of selling it.
   *
   * @returns {number} Build cost
   */
  get buildCost() {
    return (
      this.totalMaterialCost +
      this.totalInstallCost +
      this.totalExtrasCost +
      this.totalInventionCost
    );
  }

  /**
   * What the job cost: building it, and then selling it.
   *
   * @returns {number} Total cost
   */
  get totalCost() {
    return this.buildCost + this.totalBrokersFees + this.totalTransactionFees;
  }

  /**
   * Broker fees paid to list the output.
   *
   * @returns {number} Fee total
   */
  get totalBrokersFees() {
    return Object.values(this.esi.marketOrders).reduce(
      (total, order) => total + (order.fee || 0),
      0,
    );
  }

  /**
   * Fees taken on the sales.
   *
   * `transaction.tax` keeps ESI's own name for the same figure, which is where
   * it is read from.
   *
   * @returns {number} Transaction fee total
   */
  get totalTransactionFees() {
    return Object.values(this.esi.transactions).reduce(
      (total, transaction) => total + (transaction.tax || 0),
      0,
    );
  }

  /**
   * Tax expected on orders that have not sold yet.
   *
   * The estimate stored with each order's fee, counted only while the order has
   * produced no transaction. Once it has, `totalTransactionFees` carries what
   * EVE actually charged, and that is the figure the job's cost is built from —
   * counting both would charge the same sale twice.
   *
   * @returns {number} Estimated tax still to come
   */
  get estimatedSalesTaxOutstanding() {
    const sold = new Set(
      Object.values(this.esi.transactions).map((t) => t.order_id),
    );

    return Object.values(this.esi.marketOrders).reduce(
      (total, order) =>
        sold.has(order.order_id) ? total : total + (order.salesTax || 0),
      0,
    );
  }

  /**
   * What the sales brought in.
   *
   * @returns {number} Sales total
   */
  get totalSales() {
    return Object.values(this.esi.transactions).reduce(
      (total, transaction) => total + (transaction.amount || 0),
      0,
    );
  }

  /**
   * What the materials cost the job: what each material's purchases bought,
   * summed. `models.Job.TotalMaterialCost` is the same method on the backend.
   *
   * @returns {number} Material cost
   */
  get totalMaterialCost() {
    return Object.values(this.build.materials).reduce(
      (total, material) => total + material.purchasedCost,
      0,
    );
  }

  /**
   * How many of a material the job's setups call for.
   *
   * @param {number} typeID - EVE type id of the material
   * @returns {number} Quantity required
   */
  materialRequirement(typeID) {
    return Object.values(this.build.setup).reduce(
      (total, setup) => total + setup.materialQuantity(typeID),
      0,
    );
  }

  /**
   * How many items the job produces: what its setups are set to make.
   *
   * Backend twin: `models.Job.TotalQuantityProduced`.
   *
   * @returns {number} Items produced
   */
  get totalQuantityProduced() {
    return Object.values(this.build.setup).reduce(
      (total, { runCount, jobCount }) =>
        total + this.itemsProducedPerRun * runCount * jobCount,
      0,
    );
  }

  /**
   * What one unit cost to make, before any cost of selling it.
   *
   * This is the figure a parent build pays for a child job's output, so it must
   * not carry the child's selling costs.
   *
   * @returns {number} Build cost per item (rounded to 2 decimal places)
   */
  buildCostPerItem() {
    return this.#costPerItem(this.buildCost);
  }

  /**
   * What one unit cost in total, selling included.
   *
   * Matches `totalCostPerItem` on an archived job, so the planner and the
   * archive mean the same thing by the name.
   *
   * @returns {number} Total cost per item (rounded to 2 decimal places)
   */
  totalCostPerItem() {
    return this.#costPerItem(this.totalCost);
  }

  /**
   * Takes a total cost and calculates the item cost.
   *
   * @param {number} cost - A total cost
   * @returns {number} Cost per item
   */
  #costPerItem(cost) {
    if (!this.totalQuantityProduced) return 0;

    return cost / this.totalQuantityProduced;
  }

  /**
   * What a sold item went for on average.
   *
   * @returns {number} Sales over items sold, or 0 when nothing has sold
   */
  averageItemSalePrice() {
    const itemsSold = Object.values(this.esi.transactions).reduce(
      (total, transaction) => total + (transaction.quantity || 0),
      0,
    );
    if (!itemsSold) return 0;
    return this.totalSales / itemsSold;
  }

  /**
   * @param {number} materialTypeID - Type ID of the material
   * @param {string|Array<string>|Set<string>} childIDToRemove - Child job ID(s) to remove
   */
  removeChildJob(materialTypeID, childIDToRemove) {
    if (!materialTypeID || !childIDToRemove) {
      console.error(
        `Missing input data: materialTypeID=${materialTypeID}, childIDToRemove=${childIDToRemove}`,
      );

      return;
    }
    const childLocation = this.build.childJobs[materialTypeID];

    if (!childLocation) {
      console.error(`Material not present: materialTypeID=${materialTypeID}`);
      return;
    }

    const childrenToRemove = asIDList(childIDToRemove);

    this.build.childJobs[materialTypeID] = childLocation.filter(
      (i) => !childrenToRemove.includes(i),
    );
  }

  /**
   * Keeps only the given child jobs, on every material.
   *
   * @param {string|Array<string>|Set<string>} includedJobIDs - Job IDs to keep
   */
  keepOnlyChildJobs(includedJobIDs) {
    if (!includedJobIDs) {
      console.error("Missing Input IDs");
      return;
    }

    const childrenToKeep = asIDList(includedJobIDs);

    Object.entries(this.build.childJobs).forEach(([key, value]) => {
      this.build.childJobs[key] = value.filter((i) =>
        childrenToKeep.includes(i),
      );
    });
  }

  /**
   * Adds child jobs to a specific material type.
   *
   * @param {number} materialTypeID - Type ID of the material
   * @param {string|Array<string>|Set<string>} childIDToAdd - Child job ID(s) to add
   */
  addChildJob(materialTypeID, childIDToAdd) {
    if (
      !materialTypeID ||
      !childIDToAdd ||
      !this.build.childJobs[materialTypeID]
    ) {
      console.error(
        `Missing input data: materialTypeID=${materialTypeID}, childIDToAdd=${childIDToAdd}`,
      );
      return;
    }
    const childLocation = this.build.childJobs[materialTypeID];

    const childrenToAdd = asIDList(childIDToAdd);

    this.build.childJobs[materialTypeID] = [
      ...new Set([...childLocation, ...childrenToAdd]),
    ];
  }

  /**
   * Adds parent jobs to this job.
   *
   * @param {string|Array<string>|Set<string>} parentJobID - Parent job ID(s) to add
   */
  addParentJob(parentJobID) {
    if (!parentJobID) {
      console.error("Missing Input ID");
      return;
    }

    const parentsToAdd = asIDList(parentJobID);

    if (parentsToAdd.length === 0) return;

    this.parentJobs = [...new Set([...this.parentJobs, ...parentsToAdd])];
  }

  /**
   * Removes parent jobs from this job.
   *
   * @param {string|Array<string>|Set<string>} parentJobID - Parent job ID(s) to remove
   */
  removeParentJob(parentJobID) {
    if (!parentJobID) {
      console.error("Missing Input ID");
      return;
    }

    const parentsToRemove = asIDList(parentJobID);

    if (parentsToRemove.length === 0) return;

    this.parentJobs = this.parentJobs.filter(
      (id) => !parentsToRemove.includes(id),
    );
  }

  /**
   * Keeps only the given parent jobs.
   *
   * @param {string|Array<string>|Set<string>} includedJobIDs - Job IDs to keep
   */
  keepOnlyParentJobs(includedJobIDs) {
    if (!includedJobIDs) {
      console.error("Missing Input IDs");
      return;
    }

    const parentsToKeep = asIDList(includedJobIDs);

    this.parentJobs = this.parentJobs.filter((id) =>
      parentsToKeep.includes(id),
    );
  }

  /**
   * Clears group membership and forces the job onto the planner (e.g. deleting a group without archiving jobs).
   */
  releaseFromGroupToPlanner() {
    this.includedInGroup = false;
    this.groupID = "";
    this.displayOnPlanner = true;
  }

  /**
   * Puts the job in a group: same fields as {@link releaseFromGroupToPlanner} in reverse
   * (new builds, add-to-group flows).
   *
   * @param {string} groupID
   */
  assignToGroup(groupID) {
    this.includedInGroup = true;
    this.groupID = groupID;
    this.displayOnPlanner = false;
  }

  /**
   * Group edit flow: **Ready for sale** flags (`sellGroupJob` UI). Workflow stage changes stay with the caller.
   */
  toggleGroupJobReadyForSale() {
    if (!this.isReadyToSell) {
      this.isReadyToSell = true;
      this.displayOnPlanner = true;
    } else {
      this.isReadyToSell = false;
      this.displayOnPlanner = false;
    }
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
   * Removes a purchase from one of the job's materials.
   *
   * @param {number} materialID - Type ID of the material
   * @param {string} purchaseID
   * @returns {boolean} Whether a purchase was removed
   */
  removeMaterialPurchase(materialID, purchaseID) {
    const material = this.build.materials?.[String(materialID)];
    if (!material) return false;

    return material.removePurchase(purchaseID);
  }

  /**
   * What the job spent buying materials rather than building them: every
   * purchase except the ones imported from a child job, which are that child's
   * cost and not a spend of this job's.
   *
   * @returns {number} Bought material cost
   */
  get totalBoughtMaterialCost() {
    return Object.values(this.build.materials).reduce(
      (total, material) => total + material.boughtCost,
      0,
    );
  }

  /**
   * Adds transaction data to the job's sales tracking.
   *
   * Which order a sale belongs to is a guess, and on a job selling through more
   * than one order it is only that. ESI carries no reference between a market
   * order and a transaction or journal entry — a journal entry and a transaction
   * name each other, an order names neither — and matching on item, location and
   * time stops working as soon as a character holds two orders for the same item
   * in the same station. Figures derived per order from linked sales are
   * approximate for multi-order jobs.
   *
   * A sale is attributed to the job's order when it has exactly one, and left
   * unattributed otherwise — with several orders there is nothing to choose
   * between them, and with none there is nothing to name.
   *
   * @param {Object|Array<Object>} transaction - Transaction data or array of transactions
   */
  addTransaction(transaction) {
    if (!transaction) return;

    const transactionsToAdd = (
      Array.isArray(transaction) ? transaction : [transaction]
    ).map((row) => (row instanceof Transaction ? row : new Transaction(row)));

    const orders = Object.values(this.esi.marketOrders);
    const soleOrderID = orders.length === 1 ? orders[0].order_id : null;
    for (let trans of transactionsToAdd) {
      trans.order_id = soleOrderID;
    }
    for (const trans of transactionsToAdd) {
      this.esi.transactions[String(trans.transaction_id)] = trans;
    }
  }

  /**
   * This job's sales, newest first.
   *
   * The collection is keyed rather than ordered, so a reader that shows sales in
   * the order they happened asks for it here rather than relying on the order
   * rows were added in.
   *
   * @returns {Array<Transaction>} Sales, newest first
   */
  get salesByDate() {
    return Object.values(this.esi.transactions).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  }

  /**
   * Removes a transaction from the job's sales tracking.
   *
   * @param {Object} transaction - Transaction object to remove
   * @param {number} transaction.transaction_id - Transaction ID to remove
   */
  removeTransaction(transaction) {
    if (!transaction) return;
    delete this.esi.transactions[String(transaction.transaction_id)];
  }

  /**
   * Names where this job's output is meant to go.
   *
   * Passing null for either puts that half back on the account's default, which
   * is what most jobs use — the override exists for the minority that sell
   * somewhere other than the usual place.
   *
   * @param {{sellerCharacter?: string|null, saleLocationID?: string|null}} plan
   */
  setSellingPlan(plan) {
    if ("sellerCharacter" in plan) {
      this.build.sellerCharacter = plan.sellerCharacter;
    }
    if ("saleLocationID" in plan) {
      this.build.saleLocationID = plan.saleLocationID;
    }
  }

  /**
   * Adds a market order to the job's sales tracking.
   *
   * The fee is carried by the order rather than stored beside it: a fee has no
   * identity of its own, since the journal entry it arrives from is shared
   * between orders sold together in one multi-sell.
   *
   * @param {Object} order - Market order data
   * @param {Object} brokersFee - Broker's fee information
   */
  addMarketOrder(order, brokersFee) {
    if (!order) return;

    const row = MarketOrder.fromESI(order);
    if (brokersFee) {
      row.recordBrokerFee(
        brokersFee instanceof BrokerFee
          ? brokersFee
          : new BrokerFee(brokersFee),
      );
    }
    this.esi.marketOrders[String(row.order_id)] = row;
  }

  /**
   * Removes a market order from the job's sales tracking.
   *
   * Sales made through the order go with it, matched on location.
   *
   * @param {Object} order - Market order object to remove
   * @param {number} order.order_id - Order ID to remove
   * @param {number} order.location_id - Location ID for related transactions
   */
  removeMarketOrder(order) {
    if (!order) return;

    // The fee goes with the order it sits on.
    delete this.esi.marketOrders[String(order.order_id)];

    for (const [id, trans] of Object.entries(this.esi.transactions)) {
      if (trans.location_id === order.location_id) {
        delete this.esi.transactions[id];
      }
    }
  }

  /**
   * Updates linked ESI job data with latest information.
   *
   * @param {Array<Object>} latestESIJobs - Array of latest ESI job data
   */
  updateLinkedJobData(latestESIJobs) {
    if (!latestESIJobs) return;
    Object.values(this.esi.industryJobs).forEach((linkedJob) => {
      linkedJob.applyLatest(
        latestESIJobs.find((i) => i.job_id === linkedJob.job_id),
      );
    });
  }

  /**
   * The linked job that finishes last, which is when the job as a whole is done.
   * Jobs with no end date are not waited on.
   *
   * @returns {LinkedESIJob|null}
   */
  get lastRunToFinish() {
    return Object.values(this.esi.industryJobs).reduce((latest, linkedJob) => {
      if (linkedJob.finishesAt === null) return latest;
      if (!latest || linkedJob.finishesAt > latest.finishesAt) {
        return linkedJob;
      }
      return latest;
    }, null);
  }

  /**
   * The linked job that finishes first, which is what the planner counts down
   * to. Jobs with no end date are not waited on.
   *
   * @returns {LinkedESIJob|null}
   */
  get nextRunToFinish() {
    return Object.values(this.esi.industryJobs).reduce((soonest, linkedJob) => {
      if (linkedJob.finishesAt === null) return soonest;
      if (!soonest || linkedJob.finishesAt < soonest.finishesAt) {
        return linkedJob;
      }
      return soonest;
    }, null);
  }

  /**
   * The setup the editor is on, or undefined when nothing is selected, which is
   * the state of a job loaded without a stored selection.
   *
   * @returns {Setup|undefined}
   */

  get selectedSetup() {
    return this.build.setup[this.layout.setupToEdit];
  }

  /**
   * The setup another one should continue from: the selected one, or the first.
   *
   * @returns {Setup|undefined}
   */

  get setupToBuildFrom() {
    return this.selectedSetup ?? Object.values(this.build.setup)[0];
  }

  /**
   * @param {Setup} setup
   */

  attachNewSetupToJob(setup) {
    this.build.setup[setup.id] = setup;
    this.layout.setupToEdit = setup.id;
  }

  /**
   * Adds a setup to the job, copying the one being edited: another run of the same
   * production line, made where that one is made. It starts at a single run,
   * whatever the copied setup is sized at.
   */
  addNewSetup(queryClient) {
    const newSetup = buildSetupFromQuantity(
      this,
      { runCount: 1, jobCount: 1 },
      queryClient,
      buildSetupContextForJob(this, queryClient),
      { basedOn: this.setupToBuildFrom },
    );
    this.attachNewSetupToJob(newSetup);
  }

  /**
   * Deletes the active setup from the job.
   *
   * @returns {boolean} True if the setup was deleted, false if not
   */

  deleteActiveSetup() {
    if (Object.keys(this.build.setup).length === 1) {
      return false;
    }
    delete this.build.setup[this.layout.setupToEdit];
    this.layout.setupToEdit = Object.keys(this.build.setup).at(-1);
    return true;
  }

  recalculateSelectedSetup(setupId) {
    if (!setupId || !this.build.setup[setupId]) {
      console.error("Setup ID not provided or setup not found");
      return;
    }

    this.build.setup[setupId].recalculateMaterials(this.rawData.materials);
  }
  /**
   * Calculates the total number of involved characters for the job.
   *
   * Characters named only by an invention cost are not counted.
   */

  get involvedCharacters() {
    const characters = new Set();

    for (const linkedJob of Object.values(this.esi.industryJobs)) {
      characters.add(linkedJob.CharacterHash);
    }

    for (const order of Object.values(this.esi.marketOrders)) {
      characters.add(order.CharacterHash);
    }

    return characters;
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
 * Helper function that converts a document's linked ESI jobs to instances.
 *
 * @param {Object} object - Object containing job data
 * @returns {Array<LinkedESIJob>}
 */
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

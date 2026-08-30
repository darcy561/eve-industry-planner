import uuid from "react-uuid";
import { jobTypes } from "../Context/defaultValues";
import Setup from "./jobSetup";
import LinkedESIJob from "./linkedESIJob";
import JobSnapshot from "./jobSnapshot";
import createESIMarketOrder from "../Functions/MarketOrders/createMarketOrder";
import useUsersStore from "../Zustand/usersStore";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
} from "../Functions/JobPlanner/setupBuildHelpers";

/** @param {unknown} category */
function normalizeExtrasCostCategoryString(category) {
  if (category == null || category === "") return "0";
  return String(category);
}

/**
 * Ensures each extras row's `category` matches API/Go `ExtraCost.category` (string).
 * @param {Array<Record<string, unknown>>} rows
 */
function normalizeExtrasCostsIncoming(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Array.isArray(rows) ? rows : [];
  }
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    return {
      ...row,
      category: normalizeExtrasCostCategoryString(row.category),
    };
  });
}

/**
 * Main Job class for EVE Online industry planning and management.
 *
 * This class represents a complete industry job in EVE Online, handling:
 * - Manufacturing and reaction job types with full material tracking
 * - Job setup management with multiple configurations per job
 * - Cost tracking including materials, installation, and extras
 * - ESI API integration for linked jobs, orders, and transactions
 * - Parent-child job relationships for complex production chains
 * - Material purchasing and completion tracking
 * - Market order and transaction management for sales
 * - Job status progression and lifecycle management
 *
 * The Job class provides comprehensive industry planning capabilities:
 * - Multi-setup job configurations with different structures and parameters
 * - Material requirement calculation and purchasing tracking
 * - Cost analysis including installation fees and extras
 * - ESI API integration for real-time job and market data
 * - Parent-child job relationships for production chains
 * - Sales tracking with market orders and transactions
 * - Job status management and progression tracking
 *
 * @class Job
 * @example
 * // Create a new manufacturing job
 * const job = new Job({
 *   jobType: jobTypes.manufacturing,
 *   name: "Tritanium",
 *   volume: 1000,
 *   itemID: 34,
 *   maxProductionLimit: 10000
 * });
 *
 * @example
 * // Create job from existing data
 * const job = new Job(existingJobData, buildRequest);
 * job.buildJobObject(itemJson, buildRequest);
 *
 * @example
 * // Link ESI job to track real-time progress
 * job.linkESIJob(esiJobData, jobOwner);
 *
 * @example
 * // Add material purchase
 * job.addPurchaseCostToMaterial(materialID, purchaseObject);
 *
 * @example
 * // Add market order for sales
 * job.addMarketOrder(orderData, brokersFee);
 */
class Job {
  /**
   * Creates a new Job instance for EVE Online industry planning.
   *
   * @param {Object} itemJson - Job data object containing job configuration
   * @param {number} itemJson.jobType - Type of job (manufacturing, reaction, etc.)
   * @param {string} itemJson.name - Name of the item being produced
   * @param {number} itemJson.volume - Volume of the item
   * @param {number} itemJson.itemID - EVE Online type ID of the item
   * @param {number} itemJson.maxProductionLimit - Maximum production limit
   * @param {string} [itemJson.jobID] - Unique job identifier
   * @param {number} [itemJson.jobStatus] - Current job status (0-3)
   * @param {number} [itemJson.metaGroup] - Meta level of the item
   * @param {Set<number>} [itemJson.apiJobs] - Set of linked ESI job IDs
   * @param {Set<number>} [itemJson.apiOrders] - Set of linked ESI order IDs
   * @param {Set<number>} [itemJson.apiTransactions] - Set of linked ESI transaction IDs
   * @param {Array<string>} [itemJson.parentJobs] - Array of parent job IDs
   * @param {number} [itemJson.blueprintTypeID] - Blueprint type ID
   * @param {string|null} [itemJson.groupID] - Group ID when the job belongs to a group (omit or null when not grouped)
   * @param {boolean} [itemJson.includedInGroup] - Whether the job belongs to a group; derived from groupID when omitted
   * @param {boolean} [itemJson.displayOnPlanner] - Whether the job appears on the planner (derived when omitted)
   * @param {boolean} [itemJson.isReadyToSell] - Whether job is ready for sale
   * @param {Object} [itemJson.build] - Build configuration object
   * @param {Object} [itemJson.rawData] - Raw EVE API data
   * @param {Array<Object>} [itemJson.skills] - Required skills array
   * @param {number} [itemJson.itemsProducedPerRun] - Items produced per run
   * @param {Object} [itemJson.layout] - UI layout preferences
   * @param {Object} buildRequest - Build request object for job creation
   * @param {string} [buildRequest.groupID] - Group ID for the job
   * @param {Array<Object>} [buildRequest.parentJobs] - Parent jobs array
   * @param {Object} [buildRequest.childJobs] - Child jobs configuration
   */
  constructor(itemJson, buildRequest) {
    this.metaLevel =
      itemJson?.metaLevel ??
      itemJson?.metaGroup ??
      null;
    this.jobType = itemJson.jobType;
    this.name = itemJson.name;
    this.jobID = itemJson?.jobID || `job-${uuid()}`;
    this.jobStatus = itemJson?.jobStatus || 0;
    this.volume = itemJson.volume;
    this.itemID = itemJson.itemID;
    this.maxProductionLimit = itemJson.maxProductionLimit;
    this.apiJobs = new Set(itemJson?.apiJobs || []);
    this.apiOrders = new Set(itemJson?.apiOrders || []);
    this.apiTransactions = new Set(itemJson?.apiTransactions || []);
    this.parentJobs = itemJson?.parentJobs || itemJson?.parentJob || buildRequest?.parentJobs || [];
    this.blueprintTypeID = itemJson?.blueprintTypeID || null;
    this.isReadyToSell = itemJson?.isReadyToSell || false;
    const mergedGroupID = itemJson?.groupID ?? buildRequest?.groupID;
    this.groupID = mergedGroupID == null ? "" : String(mergedGroupID);
    this.includedInGroup =
      itemJson?.includedInGroup ?? this.groupID.trim() !== "";
    const displayFromDoc =
      itemJson?.displayOnPlanner ?? itemJson?.isIncludedOnPlanner;
    this.displayOnPlanner =
      displayFromDoc !== undefined && displayFromDoc !== null
        ? Boolean(displayFromDoc)
        : !this.includedInGroup || this.isReadyToSell;
    this.build = {
      setup: documentToSetups(itemJson),
      products: {
        totalQuantity: itemJson?.build?.products?.totalQuantity || 0,
      },
      childJobs: itemJson?.build?.childJobs || {},
      costs: {
        totalPurchaseCost: itemJson?.build?.costs?.totalPurchaseCost || 0,
        extrasCosts: normalizeExtrasCostsIncoming(
          itemJson?.build?.costs?.extrasCosts || []
        ),
        extrasTotal: itemJson?.build?.costs?.extrasTotal || 0,
        linkedJobs: itemJson?.build?.costs?.linkedJobs || [],
        installCosts: itemJson?.build?.costs?.installCosts || 0,
        inventionCosts: itemJson?.build?.costs?.inventionCosts || 0,
        inventionEntries: itemJson?.build?.costs?.inventionEntries || [],
      },
      sale: {
        totalSold: itemJson?.build?.sale?.totalSold || 0,
        totalSale: itemJson?.build?.sale?.totalSale || 0,
        marketOrders: itemJson?.build?.sale?.marketOrders || [],
        transactions: itemJson?.build?.sale?.transactions || [],
        brokersFee: itemJson?.build?.sale?.brokersFee || [],
      },
      materials: itemJson?.build?.materials || null,
    };
    this.build.sale.transactions = normalizeTransactions(
      this.build.sale.transactions
    );
    this.apiTransactions = new Set(
      [...this.apiTransactions].map((id) => normalizeTransactionID(id))
    );
    this.rawData = itemJson?.rawData || {};
    this.skills = itemJson?.skills || [];
    this.itemsProducedPerRun = itemJson?.itemsProducedPerRun || 0;
    const materialPriceOverrides =
      itemJson?.layout?.materialPriceOverrides &&
      typeof itemJson.layout.materialPriceOverrides === "object" &&
      !Array.isArray(itemJson.layout.materialPriceOverrides)
        ? itemJson.layout.materialPriceOverrides
        : {};

    this.layout = {
      localMarketDisplay:
        itemJson?.layout?.localMarketDisplay ??
        itemJson?.layout?.marketLocation ??
        null,
      localOrderDisplay:
        itemJson?.layout?.localOrderDisplay ??
        itemJson?.layout?.orderType ??
        null,
      esiJobTab: itemJson?.layout?.esiJobTab || null,
      setupToEdit: itemJson?.layout?.setupToEdit || null,
      resourceDisplayType: itemJson?.layout?.resourceDisplayType || null,
      materialPriceOverrides,
    };
    const accountID =
      itemJson?._meta?.accountID ||
      useUsersStore.getState().account.accountID ||
      "";
    this._meta = {
      lastModified: itemJson?._meta?.lastModified || new Date().toISOString(),
      createdAt: itemJson?._meta?.createdAt || new Date().toISOString(),
      accountID,
      lastUpdatedBy: itemJson?._meta?.lastUpdatedBy || accountID || "",
    };
  }

  /**
   * Builds the job object with material data and child job relationships.
   *
   * This method processes the raw EVE API data and builds the complete job structure:
   * - Extracts material requirements from manufacturing or reaction activities
   * - Sets up material tracking with purchasing arrays and completion status
   * - Establishes child job relationships for material production
   * - Sorts materials alphabetically for consistent display
   * - Sets the first setup as the default for editing
   *
   * @param {Object} itemJson - Raw EVE API item data
   * @param {Object} itemJson.activities - Activity data from EVE API
   * @param {Object} itemJson.activities.manufacturing - Manufacturing activity data
   * @param {Object} itemJson.activities.reaction - Reaction activity data
   * @param {Object} buildRequest - Build request configuration
   * @param {Object} [buildRequest.childJobs] - Child jobs configuration
   *
   * @example
   * // Build job from EVE API data
   * job.buildJobObject({
   *   activities: {
   *     manufacturing: {
   *       materials: [...],
   *       products: [...],
   *       time: 3600,
   *       skills: [...]
   *     }
   *   }
   * }, buildRequest);
   */
  buildJobObject(itemJson, buildRequest) {
    if (itemJson.jobType === jobTypes.manufacturing) {
      this.rawData.materials = itemJson.activities.manufacturing.materials;
      this.rawData.products = itemJson.activities.manufacturing.products;
      this.rawData.time = itemJson.activities.manufacturing.time;
      this.skills = itemJson.activities.manufacturing.skills || [];
      this.build.materials = JSON.parse(
        JSON.stringify(itemJson.activities.manufacturing.materials)
      );
      this.itemsProducedPerRun =
        itemJson.activities.manufacturing.products[0].quantity;
    }
    if (itemJson.jobType === jobTypes.reaction) {
      this.rawData.materials = itemJson.activities.reaction.materials;
      this.rawData.products = itemJson.activities.reaction.products;
      this.rawData.time = itemJson.activities.reaction.time;
      this.skills = itemJson.activities.reaction.skills || [];
      this.build.materials = JSON.parse(
        JSON.stringify(itemJson.activities.reaction.materials)
      );
      this.itemsProducedPerRun =
        itemJson.activities.reaction.products[0].quantity;
    }

    this.build.materials.forEach((material) => {
      material.purchasing = [];
      material.quantityPurchased = 0;
      material.purchasedCost = 0;
      material.purchaseComplete = false;
      const buildItem = buildRequest?.childJobs?.find(
        (i) => i.typeID === material.typeID
      );

      this.build.childJobs[material.typeID] = buildItem?.childJobs
        ? [...buildItem.childJobs]
        : [];
    });

    this.layout.setupToEdit = Object.keys(this.build.setup)[0];
    this.build.materials.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Converts the job instance to a document object for storage.
   *
   * This method serialises the job data for persistence:
   * - Converts Sets to Arrays for JSON serialisation
   * - Recursively converts Setup objects to documents
   * - `build.costs.extrasCosts[]` stays in SPA form: `{ id, category, extraText, extraValue }` (see Extras panel; `category` is string id, e.g. `"0"`…`"5"`)
   * - Preserves all job configuration and state data
   * - Maintains data integrity for storage and retrieval
   *
   * @returns {Object} Document object ready for storage
   *
   * @example
   * // Convert job to document for storage
   * const jobDocument = job.toDocument();
   * await saveJobToDatabase(jobDocument);
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
      apiJobs: [...this.apiJobs],
      apiOrders: [...this.apiOrders],
      apiTransactions: [...this.apiTransactions],
      parentJobs: this.parentJobs,
      blueprintTypeID: this.blueprintTypeID,
      groupID: this.groupID ?? "",
      includedInGroup: this.includedInGroup,
      displayOnPlanner: this.displayOnPlanner,
      isReadyToSell: this.isReadyToSell,
      build: {
        ...this.build,
        setup: Object.entries(this.build.setup).reduce((acc, [key, value]) => {
          acc[key] = value.toDocument();
          return acc;
        }, {}),
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
        materialPriceOverrides: this.layout.materialPriceOverrides || {},
      },
      _meta: { ...this._meta },
    };
  }

  /**
   * Parent job IDs (canonical planner links), each as a string.
   * Normalises legacy `parentJob` singular shapes that may not be arrays on hydrated docs.
   *
   * @returns {string[]}
   */
  getParentJobIds() {
    const raw = this.parentJobs;
    if (raw == null) return [];
    return (Array.isArray(raw) ? raw : [raw]).map((id) => String(id));
  }

  /**
   * Gets all related job IDs (parent and child jobs).
   *
   * @returns {Array<string>} Array of related job IDs
   */
  getRelatedJobs() {
    return [...this.getParentJobIds(), ...this.getAllChildJobs()];
  }

  /**
   * Gets all child job IDs for this job.
   *
   * @returns {Array<string>} Array of child job IDs
   */
  getAllChildJobs() {
    return Object.values(this.build.childJobs).flat();
  }

  /**
   * Gets all material type IDs used in this job.
   *
   * @returns {Array<number>} Array of material type IDs
   */
  getMaterialIDs() {
    return [this.itemID, ...Object.keys(this.build.childJobs).map(Number)];
  }

  /**
   * Gets all system IDs used in job setups.
   *
   * @returns {Array<number>} Array of system IDs
   */
  getSystemIndexes() {
    return [
      ...Object.values(this.build.setup).reduce((prev, { systemID }) => {
        return prev.add(systemID);
      }, new Set()),
    ];
  }

  /**
   * Advances the job status by one step.
   */
  stepForward() {
    this.jobStatus++;
  }

  /**
   * Reverses the job status by one step.
   */
  stepBackward() {
    this.jobStatus--;
  }

  /**
   * Sets the job status to a specific value.
   *
   * @param {number} statusID - The status ID to set (0-3)
   */
  setJobStatus(statusID) {
    const n = Number(statusID);
    if (Number.isNaN(n)) return;
    this.jobStatus = n;
  }

  /**
   * Links an ESI job to this job for real-time tracking.
   *
   * This method connects an EVE Online ESI job to track its progress:
   * - Adds the ESI job ID to the tracked jobs set
   * - Creates a LinkedESIJob instance for detailed tracking
   * - Updates installation costs based on ESI job cost
   * - Maintains cost calculation integrity
   *
   * @param {Object} esiJob - ESI job data from EVE Online API
   * @param {number} esiJob.job_id - ESI job ID
   * @param {number} esiJob.cost - Installation cost
   * @param {Object} jobOwner - Job owner information
   * @param {string} jobOwner.CharacterHash - Character hash of the owner
   *
   * @example
   * // Link an ESI job for tracking
   * job.linkESIJob({
   *   job_id: 12345,
   *   cost: 1000000,
   *   status: 'active'
   * }, { CharacterHash: 'ABC123' });
   */
  linkESIJob(esiJob, jobOwner) {
    if (!esiJob || !jobOwner) return;
    if (
      isNaN(this.build.costs.installCosts) ||
      this.build.costs.installCosts < 0
    ) {
      this.build.costs.installCosts = this.build.costs.linkedJobs.reduce(
        (prev, job) => (prev += job.cost),
        0
      );
    }
    this.apiJobs.add(esiJob.job_id);
    this.build.costs.linkedJobs.push({ ...new LinkedESIJob(esiJob, jobOwner) });
    this.build.costs.installCosts += esiJob.cost;
  }

  /**
   * Unlinks an ESI job from this job.
   *
   * This method removes the connection to an ESI job:
   * - Removes the ESI job ID from tracked jobs
   * - Removes the linked job from the costs array
   * - Updates installation costs by subtracting the job cost
   * - Maintains cost calculation integrity
   *
   * @param {Object} linkedJob - Linked ESI job object to remove
   * @param {number} linkedJob.job_id - ESI job ID to remove
   * @param {number} linkedJob.cost - Cost to subtract from installation costs
   *
   * @example
   * // Unlink an ESI job
   * job.unlinkESIJob({
   *   job_id: 12345,
   *   cost: 1000000
   * });
   */
  unlinkESIJob(linkedJob) {
    if (!linkedJob) return;
    if (
      isNaN(this.build.costs.installCosts) ||
      this.build.costs.installCosts < 0
    ) {
      this.build.costs.installCosts = this.build.costs.linkedJobs.reduce(
        (prev, job) => (prev += job.cost),
        0
      );
    }
    this.apiJobs.delete(linkedJob.job_id);
    this.build.costs.linkedJobs = this.build.costs.linkedJobs.filter(
      (i) => i.job_id !== linkedJob.job_id
    );
    this.build.costs.installCosts -= linkedJob.cost;
  }

  /**
   * Adds an extra cost item to the job.
   *
   * Canonical row shape (same as Extras panel): `{ id, category, extraText, extraValue }`.
   * - `id` — string UUID (e.g. react-uuid)
   * - `category` — extras category id as string (`"0"` = unassigned; matches `ExtraCategory.id`)
   * - `extraText` — label / description (HTML sanitised in UI before add)
   * - `extraValue` — ISK amount (number)
   *
   * @param {Object} newItem - Extra cost row
   * @param {string} newItem.id
   * @param {string|number} newItem.category - coerced to string before store
   * @param {string} newItem.extraText
   * @param {number} newItem.extraValue
   */
  addExtrasCost(newItem) {
    if (!newItem) return;
    this.build.costs.extrasCosts.push({
      ...newItem,
      category: normalizeExtrasCostCategoryString(newItem.category),
    });
    this.build.costs.extrasTotal = this.build.costs.extrasCosts.reduce(
      (prev, curr) => prev + curr.extraValue,
      0
    );
  }

  /**
   * Removes an extra cost item from the job.
   *
   * @param {Object} item - Extra cost item to remove
   * @param {string} item.id - Unique identifier for the cost item
   */
  removeExtrasCost(item) {
    if (!item) return;
    this.build.costs.extrasCosts = this.build.costs.extrasCosts.filter(
      (i) => i.id !== item.id
    );
    this.build.costs.extrasTotal = this.build.costs.extrasCosts.reduce(
      (prev, curr) => prev + curr.extraValue,
      0
    );
  }
  /**
   * Adds an invention cost to the job.
   *
   * @param {Object} inputObject - Invention cost object
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost of the invention item
   */
  addInventionCost(inputObject) {
    if (!inputObject) return;
    this.build.costs.inventionEntries.push(inputObject);
    this.build.costs.inventionCosts += inputObject.itemCost;
  }

  /**
   * Removes an invention cost from the job.
   *
   * @param {Object} inputObject - Invention cost object to remove
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost to subtract
   */
  removeInventionCost(inputObject) {
    if (!inputObject) return;
    this.build.costs.inventionEntries =
      this.build.costs.inventionEntries.filter((i) => i.id !== inputObject.id);
    this.build.costs.inventionCosts -= inputObject.itemCost;
  }

  /**
   * Gets the number of setups configured for this job.
   *
   * @returns {number} Number of setups
   */
  setupCount() {
    return Object.values(this.build.setup).length;
  }

  /**
   * Gets the count of completed materials.
   *
   * @returns {number} Number of completed materials
   */
  totalCompletedMaterials() {
    return this.build.materials.filter((material) => material.purchaseComplete)
      .length;
  }

  /**
   * True when the job has at least one material and every material is purchase-complete.
   * Stage-independent (Planning / Purchasing / Building can all match once mats are bought).
   *
   * @returns {boolean}
   */
  isReadyToBuild() {
    const materials = this.build?.materials ?? [];
    if (materials.length === 0) return false;
    return materials.length === this.totalCompletedMaterials();
  }

  /**
   * Group job tree “Ready” chip: all materials bought and no linked ESI industry jobs yet
   * (link runs → Building / progress). Hidden on Complete and For Sale.
   *
   * @returns {boolean}
   */
  isJobTreeReadyToStartIndicator() {
    const st = Number(this.jobStatus);
    if (st === 3 || st === 4) return false; // Complete / For Sale (persisted ids)
    if (!this.isReadyToBuild()) return false;
    const esi =
      this.apiJobs && typeof this.apiJobs.size === "number"
        ? this.apiJobs.size
        : 0;
    return esi === 0;
  }

  /**
   * Gets the count of remaining materials to purchase.
   *
   * @returns {number} Number of remaining materials
   */
  totalRemainingMaterials() {
    return this.build.materials.filter((material) => !material.purchaseComplete)
      .length;
  }

  /**
   * Gets the total job count across all setups.
   *
   * @returns {number} Total job count
   */
  totalJobCount() {
    return Object.values(this.build.setup).reduce((prev, { jobCount }) => {
      return (prev += jobCount);
    }, 0);
  }

  /**
   * What it cost to build the item, before any cost of selling it.
   *
   * @returns {number} Build cost
   */
  buildCost() {
    return (
      this.materialCost() +
      this.build.costs.installCosts +
      this.build.costs.extrasTotal +
      this.build.costs.inventionCosts
    );
  }

  /**
   * What the job cost: building it, and then selling it.
   *
   * @returns {number} Total cost
   */
  totalCost() {
    return this.buildCost() + this.brokersFeeTotal() + this.transactionFeeTotal();
  }

  /**
   * Broker fees paid to list the output.
   *
   * @returns {number} Fee total
   */
  brokersFeeTotal() {
    return this.build.sale.brokersFee.reduce(
      (total, fee) => total + (fee.amount || 0),
      0
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
  transactionFeeTotal() {
    return this.build.sale.transactions.reduce(
      (total, transaction) => total + (transaction.tax || 0),
      0
    );
  }

  /**
   * What the sales brought in.
   *
   * @returns {number} Sales total
   */
  salesTotal() {
    return this.build.sale.transactions.reduce(
      (total, transaction) => total + (transaction.amount || 0),
      0
    );
  }

  /**
   * What was spent on materials, summed from the purchases themselves.
   *
   * `totalPurchaseCost` is a cached copy of this and has been written both ways
   * historically — materials alone, and materials with invention folded in — so
   * the purchases are the figure to trust.
   *
   * @returns {number} Material spend
   */
  materialCost() {
    return this.build.materials.reduce(
      (total, material) => total + (material.purchasedCost || 0),
      0
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
    return this._perItem(this.buildCost());
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
    return this._perItem(this.totalCost());
  }

  /**
   * @private
   * @param {number} cost
   * @returns {number} Cost divided by what was produced, or 0 when nothing was
   */
  _perItem(cost) {
    if (!this.build.products.totalQuantity) return 0;
    return (
      Math.round(
        (cost / this.build.products.totalQuantity + Number.EPSILON) * 100
      ) / 100
    );
  }

  /**
   * Removes child jobs from a specific material type.
   *
   * This method removes child job IDs from a material's child job list:
   * - Validates input parameters
   * - Checks if the material type exists
   * - Handles both single IDs and arrays/sets of IDs
   * - Filters out the specified child job IDs
   *
   * @param {number} materialTypeID - Type ID of the material
   * @param {string|Array<string>|Set<string>} childIDToRemove - Child job ID(s) to remove
   */
  removeChildJob(materialTypeID, childIDToRemove) {
    if (!materialTypeID || !childIDToRemove) {
      console.error(
        `Missing input data: materialTypeID=${materialTypeID}, childIDToRemove=${childIDToRemove}`
      );

      return;
    }
    const childLocation = this.build.childJobs[materialTypeID];

    if (!childLocation) {
      console.error(`Material not present: materialTypeID=${materialTypeID}`);
      return;
    }

    const childrenToRemove =
      Array.isArray(childIDToRemove) || childIDToRemove instanceof Set
        ? [...childIDToRemove]
        : [childIDToRemove];

    this.build.childJobs[materialTypeID] = childLocation.filter(
      (i) => !childrenToRemove.includes(i)
    );
  }

  /**
   * Removes child jobs that are not included in the provided job IDs from all materials.
   *
   * This method filters child jobs across all materials to keep only those
   * that are included in the provided job ID list:
   * - Validates input parameters
   * - Handles both single IDs and arrays/sets of IDs
   * - Filters child jobs for each material type
   * - Keeps only child jobs that are in the included list
   *
   * @param {string|Array<string>|Set<string>} includedJobIDs - Job IDs to keep
   */
  removeChildJobsNotIncludedInInputFromAllMaterials(includedJobIDs) {
    if (!includedJobIDs) {
      console.error("Missing Input IDs");
      return;
    }

    const childrenToKeep =
      Array.isArray(includedJobIDs) || includedJobIDs instanceof Set
        ? [...includedJobIDs]
        : [includedJobIDs];

    Object.entries(this.build.childJobs).forEach(([key, value]) => {
      this.build.childJobs[key] = value.filter((i) =>
        childrenToKeep.includes(i)
      );
    });
  }

  /**
   * Adds child jobs to a specific material type.
   *
   * This method adds child job IDs to a material's child job list:
   * - Validates input parameters and material existence
   * - Handles both single IDs and arrays/sets of IDs
   * - Merges new child jobs with existing ones
   * - Removes duplicates using Set
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
        `Missing input data: materialTypeID=${materialTypeID}, childIDToAdd=${childIDToAdd}`
      );
      return;
    }
    const childLocation = this.build.childJobs[materialTypeID];

    const childrenToAdd =
      Array.isArray(childIDToAdd) || childIDToAdd instanceof Set
        ? [...childIDToAdd]
        : [childIDToAdd];

    this.build.childJobs[materialTypeID] = [
      ...new Set([...childLocation, ...childrenToAdd]),
    ];
  }

  /**
   * Adds parent jobs to this job.
   *
   * This method adds parent job IDs to the job's parent list:
   * - Validates input parameters
   * - Handles both single IDs and arrays/sets of IDs
   * - Merges new parent jobs with existing ones
   * - Removes duplicates using Set
   *
   * @param {string|Array<string>|Set<string>} parentJobID - Parent job ID(s) to add
   */
  addParentJob(parentJobID) {
    if (!parentJobID) {
      console.error("Missing Input ID");
      return;
    }

    const parentsToAdd =
      Array.isArray(parentJobID) || parentJobID instanceof Set
        ? [...parentJobID]
        : [parentJobID];

    if (parentsToAdd.length === 0) return;

    this.parentJobs = [...new Set([...this.parentJobs, ...parentsToAdd])];
  }

  /**
   * Removes parent jobs from this job.
   *
   * This method removes parent job IDs from the job's parent list:
   * - Validates input parameters
   * - Handles both single IDs and arrays/sets of IDs
   * - Filters out the specified parent job IDs
   *
   * @param {string|Array<string>|Set<string>} parentJobID - Parent job ID(s) to remove
   */
  removeParentJob(parentJobID) {
    if (!parentJobID) {
      console.error("Missing Input ID");
      return;
    }

    const parentsToRemove =
      Array.isArray(parentJobID) || parentJobID instanceof Set
        ? [...parentJobID]
        : [parentJobID];

    if (parentsToRemove.length === 0) return;

    this.parentJobs = this.parentJobs.filter(
      (id) => !parentsToRemove.includes(id)
    );
  }

  /**
   * Removes parent jobs that are not included in the provided job IDs.
   *
   * This method filters parent jobs to keep only those that are included
   * in the provided job ID list:
   * - Validates input parameters
   * - Handles both single IDs and arrays/sets of IDs
   * - Filters parent jobs to keep only included ones
   *
   * @param {string|Array<string>|Set<string>} includedJobIDs - Job IDs to keep
   */
  removeParentJobsNotIncludedInInput(includedJobIDs) {
    if (!includedJobIDs) {
      console.error("Missing Input IDs");
      return;
    }

    const parentsToKeep =
      Array.isArray(includedJobIDs) || includedJobIDs instanceof Set
        ? [...includedJobIDs]
        : [includedJobIDs];

    this.parentJobs = this.parentJobs.filter((id) => parentsToKeep.includes(id));
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
   * Updates the job snapshot in the provided snapshot array.
   *
   * This method finds and updates the job's snapshot in the array:
   * - Validates input parameters
   * - Finds the job in the snapshot array by jobID
   * - Replaces the snapshot with a new JobSnapshot instance
   * - Handles cases where job is not found in the array
   *
   * @param {Array<JobSnapshot>} snapshotArray - Array of job snapshots to update
   */
  updateJobSnapshot(snapshotArray) {
    if (!snapshotArray && Array.isArray(snapshotArray)) {
      console.error("Snapshot array not provided or is not an array.");
      return;
    }

    const index = snapshotArray.findIndex((i) => i.jobID === this.jobID);

    if (index === -1) {
      console.warn("Nothing to update, job is not present in snapshot array.");
      return;
    }

    snapshotArray[index] = new JobSnapshot(this);
  }

  /**
   * Adds a purchase cost to a specific material.
   *
   * This method tracks material purchases and updates completion status:
   * - Validates input parameters
   * - Finds the material by type ID
   * - Adds purchase information to the material
   * - Updates purchased quantities and costs
   * - Marks material as complete if fully purchased
   * - Updates total purchase cost
   *
   * @param {number} materialID - Type ID of the material
   * @param {Object} purchaseObject - Purchase information object
   * @param {number} purchaseObject.itemCount - Number of items purchased
   * @param {number} purchaseObject.itemCost - Cost per item
   */
  addPurchaseCostToMaterial(materialID, purchaseObject) {
    if (!materialID || !purchaseObject) {
      console.error("Material ID or Purchase object missing");
      return;
    }
    const material = this.build.materials.find((i) => i.typeID == materialID);
    if (!material) return;

    material.purchasing.push(purchaseObject);
    material.quantityPurchased += purchaseObject.itemCount;
    material.purchasedCost +=
      purchaseObject.itemCost * purchaseObject.itemCount;

    if (material.quantityPurchased >= material.quantity) {
      material.purchaseComplete = true;
    }

    this.build.costs.totalPurchaseCost +=
      purchaseObject.itemCost * purchaseObject.itemCount;
  }

  /**
   * Calculates the total purchase cost for raw materials.
   *
   * This method calculates the total purchase cost for raw materials:
   * - Filters materials that have child jobs
   * - Sums the purchased cost of the materials that do not have child jobs
   *
   * @returns {number} Total purchase cost for raw materials
   */

  totalRawMaterialPurchaseCost() {
    return this.build.materials.reduce((prev, material) => {
      return prev + material.purchasing.reduce((prev, purchase) => {
        if (purchase.childJobImport) {
          return prev;
        }
        return prev + purchase.itemCost * purchase.itemCount;
      }, 0);
    }, 0);
  }

  /**
   * Adds transaction data to the job's sales tracking.
   *
   * This method processes and adds transaction data:
   * - Handles both single transactions and arrays
   * - Assigns order IDs to transactions
   * - Adds transaction IDs to the API transactions set
   * - Sorts transactions by date (newest first)
   *
   * @param {Object|Array<Object>} transaction - Transaction data or array of transactions
   * @param {number} [activeOrder] - Active order ID to assign to transactions
   */
  addTransaction(transaction, activeOrder) {
    if (!transaction) return;

    const transactionsToAdd = Array.isArray(transaction)
      ? transaction
      : [transaction];

    for (let trans of transactionsToAdd) {
      trans.transaction_id = normalizeTransactionID(trans.transaction_id);
      if (activeOrder && this.build.sale.marketOrders.length > 1) {
        trans.order_id = activeOrder;
      } else {
        trans.order_id = this.build.sale.marketOrders[0].order_id;
      }
    }
    transactionsToAdd.forEach((trans) =>
      this.apiTransactions.add(trans.transaction_id)
    );

    this.build.sale.transactions = [
      ...this.build.sale.transactions,
      ...transactionsToAdd,
    ];
    this.build.sale.transactions.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });
  }

  /**
   * Removes a transaction from the job's sales tracking.
   *
   * This method removes transaction data:
   * - Removes transaction from the transactions array
   * - Removes transaction ID from the API transactions set
   *
   * @param {Object} transaction - Transaction object to remove
   * @param {number} transaction.transaction_id - Transaction ID to remove
   */
  removeTransaction(transaction) {
    if (!transaction) return;
    this.build.sale.transactions = this.build.sale.transactions.filter(
      (i) => i.transaction_id !== transaction.transaction_id
    );
    this.apiTransactions.delete(transaction.transaction_id);
  }

  /**
   * Adds a market order to the job's sales tracking.
   *
   * This method adds market order data:
   * - Validates input parameters
   * - Adds broker's fee information
   * - Creates ESI market order object
   * - Adds order ID to the API orders set
   *
   * @param {Object} order - Market order data
   * @param {Object} brokersFee - Broker's fee information
   */
  addMarketOrder(order, brokersFee) {
    if (!order || !brokersFee) return;

    this.build.sale.brokersFee.push(brokersFee);
    this.build.sale.marketOrders.push(createESIMarketOrder(order));
    this.apiOrders.add(order.order_id);
  }

  /**
   * Removes a market order from the job's sales tracking.
   *
   * This method removes market order data and related transactions:
   * - Removes broker's fee information
   * - Removes market order from the orders array
   * - Removes related transactions by location ID
   * - Removes order ID from the API orders set
   *
   * @param {Object} order - Market order object to remove
   * @param {number} order.order_id - Order ID to remove
   * @param {number} order.location_id - Location ID for related transactions
   */
  removeMarketOrder(order) {
    if (!order) return;

    this.build.sale.brokersFee = this.build.sale.brokersFee.filter(
      (i) => i.order_id !== order.order_id
    );

    this.build.sale.marketOrders = this.build.sale.marketOrders.filter(
      (i) => i.order_id !== order.order_id
    );

    const transactionIdsToRemove = this.build.sale.transactions
      .filter((trans) => trans.location_id === order.location_id)
      .map((trans) => trans.transaction_id);

    transactionIdsToRemove.forEach((id) => this.apiTransactions.delete(id));

    this.build.sale.transactions = this.build.sale.transactions.filter(
      (i) => i.location_id !== order.location_id
    );

    this.apiOrders.delete(order.order_id);
  }

  /**
   * Updates linked ESI job data with latest information.
   *
   * This method updates ESI job status and completion information:
   * - Validates input parameters
   * - Updates only active jobs
   * - Updates job status, completion date, and end date
   * - Maintains data integrity for job tracking
   *
   * @param {Array<Object>} latestESIJobs - Array of latest ESI job data
   */
  updateLinkedJobData(latestESIJobs) {
    if (!latestESIJobs) return;
    this.build.costs.linkedJobs.forEach((job) => {
      if (job.status === "active") {
        const latestData = latestESIJobs.find((i) => i.job_id === job.job_id);
        if (!latestData) return;
        job.status = latestData.status;
        job.completed_date = latestData.completed_date || null;
        job.end_date = latestData.end_date;
      }
    });
  }

  /**
   * Updates linked market order data with latest information.
   *
   * This method updates market order status and pricing information:
   * - Validates input parameters
   * - Updates only incomplete orders
   * - Updates volume remaining, price, and issue date
   * - Marks orders as complete when volume reaches zero
   * - Maintains timestamp history
   *
   * @param {Array<Object>} latestESIOrders - Array of latest ESI order data
   */
  updateLinkedMarketOrderData(latestESIOrders) {
    if (!latestESIOrders) return;
    this.build.sale.marketOrders.forEach((order) => {
      if (!order?.complete) {
        const latestData = latestESIOrders.find(
          (i) => i.order_id === order.order_id
        );
        if (!latestData) return;

        // Merge latestData onto order, mapping price to item_price and preserving timestamp history
        const merged = {
          ...order,
          ...latestData,
          item_price: latestData.price,
          complete: latestData.volume_remain === 0,
          timeStamps: [...(order.timeStamps || []), latestData.issued],
        };
        Object.keys(merged).forEach(key => {
          order[key] = merged[key];
        });
      }
    });
  }

  /**
   * Recalculates the total quantity produced for the job.
   *
   * This method recalculates the total quantity produced for the job:
   * - Recalculates the total quantity produced for the job
   */
  recalculateTotalQuantityProduced() {
    this.build.products.totalQuantity = Object.values(this.build.setup).reduce(
      (prev, { runCount, jobCount }) => {
        return (prev += this.itemsProducedPerRun * runCount * jobCount);
      },
      0
    );
  }

  /**
   * Recalculates the total material quantities for the job.
   *
   * This method recalculates the total material quantities for the job:
   * - Recalculates the total material quantities for the job
   */
  recalculateTotalMaterialQuantities() {
    const newMaterialQuantities = {};

    for (const setup of Object.values(this.build.setup)) {
      const materialCount = setup.materialCount || {};

      for (const materialId of Object.keys(materialCount)) {
        const quantity = materialCount[materialId].quantity || 0;
        newMaterialQuantities[materialId] =
          (newMaterialQuantities[materialId] || 0) + quantity;
      }
    }
    for (const material of this.build.materials) {
      const materialId = material.typeID.toString();
      if (materialId in newMaterialQuantities) {
        material.quantity = newMaterialQuantities[materialId];
      }
    }
  }

  /**
   * Attaches a new setup to the job.
   *
   * This method attaches a new setup to the job:
   * - Attaches the setup to the job
   * - Sets the setup to edit
   * - Recalculates the total quantity produced
   * - Recalculates the total material quantities
   */

  attachNewSetupToJob(setup) {
    this.build.setup[setup.id] = setup;
    this.layout.setupToEdit = setup.id;
    this.recalculateTotalQuantityProduced();
    this.recalculateTotalMaterialQuantities();
  }

  addNewSetup(queryClient) {
    const requiredQuantity = this.rawData.products[0].quantity;
    const context = buildSetupContextForJob(this, requiredQuantity, queryClient);
    const newSetup = buildSetupFromQuantity(
      this,
      context.setupQuantities[0],
      queryClient,
      context
    );
    this.attachNewSetupToJob(newSetup);
  }

  /**
   * Deletes the active setup from the job.
   *
   * This method deletes the active setup from the job:
   * - Validates input parameters
   * - Deletes the active setup from the setup object
   * - Recalculates the total quantity produced
   * - Recalculates the total material quantities
   * - Returns true if the setup was deleted, false if not
   *
   * @returns {boolean} True if the setup was deleted, false if not
   */

  deleteActiveSetup() {
    if (Object.keys(this.build.setup).length === 1) {
      return false;
    }
    delete this.build.setup[this.layout.setupToEdit];
    this.layout.setupToEdit = Object.keys(this.build.setup).at(-1);
    this.recalculateTotalQuantityProduced();
    this.recalculateTotalMaterialQuantities();
    return true;
  }

  recalculateSelectedSetup(
    setupId,
    queryClient,
    additionalMaterialPrices = {},
    additionalSystemIndexValues = {}
  ) {
    if (!setupId || !this.build.setup[setupId]) {
      console.error("Setup ID not provided or setup not found");
      return;
    }

    const setup = this.build.setup[setupId];
    setup.recalculate(
      this.skills,
      queryClient,
      additionalMaterialPrices,
      additionalSystemIndexValues
    );
    this.recalculateTotalQuantityProduced();
    this.recalculateTotalMaterialQuantities();
  }
  /**
 * Calculates the total number of involved characters for the job.
 *
  * This method calculates the total number of involved characters for the job:
  * - Creates a set of involved character IDs
  * - Adds the character IDs from the linked jobs to the set
  * - Adds the character IDs from the market orders to the set
  * - This does not include any characters relating to the invention costs.
  * - Returns an object containing the number of unique characters and the set of involved character IDs
 *
 * @returns {Object} Object containing the number of unique characters and the set of involved character IDs
 */

  calculateTotalInvolvedCharacters() {
    const involvedCharacterIDs = new Set();

    for (const linkedJob of this.build.costs.linkedJobs) {
      involvedCharacterIDs.add(linkedJob.characterID);
    }

    for (const order of this.build.sale.marketOrders) {
      involvedCharacterIDs.add(order.characterID);
    }

    return { numberOfUniqueCharacters: involvedCharacterIDs.size, involvedCharacterIDs }
  }

  
}

/**
 * Helper function that converts document setup data to Setup instances.
 *
 * This function processes stored setup data and creates Setup class instances:
 * - Validates that setup data exists in the object
 * - Creates Setup instances from stored setup data
 * - Returns an object with setup IDs as keys and Setup instances as values
 *
 * @param {Object} object - Object containing setup data
 * @param {Object} [object.build] - Build configuration object
 * @param {Object} [object.build.setup] - Setup data object
 * @returns {Object} Object with setup IDs as keys and Setup instances as values
 *
 * @example
 * // Convert document setups to Setup instances
 * const setups = documentToSetups({
 *   build: {
 *     setup: {
 *       'setup-1': { id: 'setup-1', runCount: 1, ME: 10 },
 *       'setup-2': { id: 'setup-2', runCount: 2, ME: 5 }
 *     }
 *   }
 * });
 * // Returns: { 'setup-1': Setup instance, 'setup-2': Setup instance }
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

function normalizeTransactions(transactions) {
  if (!Array.isArray(transactions)) {
    return [];
  }

  return transactions.map((tx) => {
    if (!tx || typeof tx !== "object") {
      return tx;
    }

    return {
      ...tx,
      transaction_id: normalizeTransactionID(tx.transaction_id),
    };
  });
}

function normalizeTransactionID(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
      return -stableStringHash(trimmed);
    }
  }

  return 0;
}

function stableStringHash(text) {
  // FNV-1a 32-bit hash, coerced to positive non-zero integer.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = hash >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export default Job;

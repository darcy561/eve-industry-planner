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
   * @param {Array<Object>} [itemJson.skills] - Required skills array
   * @param {number} [itemJson.itemsProducedPerRun] - Items produced per run
   * @param {Object} [itemJson.layout] - UI layout preferences
   * @param {Object} buildRequest - Build request object for job creation
   * @param {string} [buildRequest.groupID] - Group ID for the job
   * @param {Array<Object>} [buildRequest.parentJobs] - Parent jobs array
   * @param {Object} [buildRequest.childJobs] - Child jobs configuration
   */
  constructor(itemJson, buildRequest) {
    this.metaLevel = itemJson?.metaLevel ?? itemJson?.metaGroup ?? null;
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
    this.build = {
      setup: documentToSetups(itemJson),
      childJobs: itemJson?.build?.childJobs || {},
      costs: {
        extrasCosts: (itemJson?.build?.costs?.extrasCosts || []).map(
          (row) => new ExtraCost(row),
        ),
        linkedJobs: documentToLinkedJobs(itemJson),
        inventionEntries: (itemJson?.build?.costs?.inventionEntries || []).map(
          (row) => new InventionEntry(row),
        ),
      },
      sale: {
        marketOrders: (itemJson?.build?.sale?.marketOrders || []).map(
          (row) => new MarketOrder(row),
        ),
        transactions: (itemJson?.build?.sale?.transactions || []).map(
          (row) => new Transaction(row),
        ),
        brokersFee: (itemJson?.build?.sale?.brokersFee || []).map(
          (row) => new BrokerFee(row),
        ),
      },
      materials: documentToMaterials(itemJson, (typeID) =>
        this.materialRequirement(typeID),
      ),
    };
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
      this.skills = itemJson.activities.manufacturing.skills || [];
      this.build.materials = itemJson.activities.manufacturing.materials.map(
        (material) =>
          new Material(material, (typeID) => this.materialRequirement(typeID)),
      );
      this.itemsProducedPerRun =
        itemJson.activities.manufacturing.products[0].quantity;
    }
    if (itemJson.jobType === jobTypes.reaction) {
      this.rawData.materials = itemJson.activities.reaction.materials;
      this.rawData.products = itemJson.activities.reaction.products;
      this.rawData.time = itemJson.activities.reaction.time;
      this.skills = itemJson.activities.reaction.skills || [];
      this.build.materials = itemJson.activities.reaction.materials.map(
        (material) =>
          new Material(material, (typeID) => this.materialRequirement(typeID)),
      );
      this.itemsProducedPerRun =
        itemJson.activities.reaction.products[0].quantity;
    }

    this.build.materials.forEach((material) => {
      const buildItem = buildRequest?.childJobs?.find(
        (i) => i.typeID === material.typeID,
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
   * `build.costs.extrasCosts[]` stays in SPA form: `{ id, category, extraText,
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
      build: {
        ...this.build,
        setup: Object.entries(this.build.setup).reduce((acc, [key, value]) => {
          acc[key] = value.toDocument();
          return acc;
        }, {}),
        materials: this.build.materials
          ? this.build.materials.map((material) => material.toDocument())
          : null,
        costs: {
          ...this.build.costs,
          linkedJobs: this.build.costs.linkedJobs.map((linkedJob) =>
            linkedJob.toDocument(),
          ),
          extrasCosts: this.build.costs.extrasCosts.map((extra) =>
            extra.toDocument(),
          ),
          inventionEntries: this.build.costs.inventionEntries.map((entry) =>
            entry.toDocument(),
          ),
        },
        sale: {
          ...this.build.sale,
          marketOrders: this.build.sale.marketOrders.map((order) =>
            order.toDocument(),
          ),
          transactions: this.build.sale.transactions.map((transaction) =>
            transaction.toDocument(),
          ),
          brokersFee: this.build.sale.brokersFee.map((fee) => fee.toDocument()),
        },
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
    return new Set(
      this.build.costs.linkedJobs.map((linkedJob) => linkedJob.job_id),
    );
  }

  /**
   * @returns {Set<number>} The ESI market orders linked to this job
   */
  get esiOrderIDs() {
    return new Set(this.build.sale.marketOrders.map((order) => order.order_id));
  }

  /**
   * @returns {Set<number>} The ESI transactions linked to this job
   */
  get esiTransactionIDs() {
    return new Set(
      this.build.sale.transactions.map(
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
    this.build.costs.linkedJobs.push(LinkedESIJob.fromESI(esiJob, jobOwner));
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
    this.build.costs.linkedJobs = this.build.costs.linkedJobs.filter(
      (i) => i.job_id !== linkedJob.job_id,
    );
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
    this.build.costs.extrasCosts.push(
      newItem instanceof ExtraCost ? newItem : new ExtraCost(newItem),
    );
  }

  /**
   * @param {Object} item - Extra cost item to remove
   * @param {string} item.id - Unique identifier for the cost item
   */
  removeExtrasCost(item) {
    if (!item) return;
    this.build.costs.extrasCosts = this.build.costs.extrasCosts.filter(
      (i) => i.id !== item.id,
    );
  }
  /**
   * @param {Object} inputObject - Invention cost object
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost of the invention item
   */
  addInventionCost(inputObject) {
    if (!inputObject) return;
    this.build.costs.inventionEntries.push(
      inputObject instanceof InventionEntry
        ? inputObject
        : new InventionEntry(inputObject),
    );
  }

  /**
   * @param {Object} inputObject - Invention cost object to remove
   * @param {string} inputObject.id - Unique identifier
   * @param {number} inputObject.itemCost - Cost to subtract
   */
  removeInventionCost(inputObject) {
    if (!inputObject) return;
    this.build.costs.inventionEntries =
      this.build.costs.inventionEntries.filter((i) => i.id !== inputObject.id);
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
    return this.build.materials.filter((material) => material.purchaseComplete)
      .length;
  }

  /**
   * True when the job has at least one material and every material is purchase-complete.
   * Stage-independent (Planning / Purchasing / Building can all match once mats are bought).
   *
   * @returns {boolean}
   */
  get isReadyToBuild() {
    const materials = this.build?.materials ?? [];
    if (materials.length === 0) return false;
    return materials.length === this.completedMaterialCount;
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
    return this.build.materials.filter((material) => !material.purchaseComplete)
      .length;
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
    return this.build.costs.linkedJobs.reduce(
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
    return this.build.costs.extrasCosts.reduce(
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
    return this.build.costs.inventionEntries.reduce(
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
    return this.build.sale.brokersFee.reduce(
      (total, fee) => total + (fee.amount || 0),
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
    return this.build.sale.transactions.reduce(
      (total, transaction) => total + (transaction.tax || 0),
      0,
    );
  }

  /**
   * What the sales brought in.
   *
   * @returns {number} Sales total
   */
  get totalSales() {
    return this.build.sale.transactions.reduce(
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
    return this.build.materials.reduce(
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
    const itemsSold = this.build.sale.transactions.reduce(
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
    const material = this.build.materials?.find((i) => i.typeID == materialID);
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
    const material = this.build.materials?.find((i) => i.typeID == materialID);
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
    return this.build.materials.reduce(
      (total, material) => total + material.boughtCost,
      0,
    );
  }

  /**
   * Adds transaction data to the job's sales tracking.
   *
   * @param {Object|Array<Object>} transaction - Transaction data or array of transactions
   * @param {number} [activeOrder] - Active order ID to assign to transactions
   */
  addTransaction(transaction, activeOrder) {
    if (!transaction) return;

    const transactionsToAdd = (
      Array.isArray(transaction) ? transaction : [transaction]
    ).map((row) => (row instanceof Transaction ? row : new Transaction(row)));

    for (let trans of transactionsToAdd) {
      if (activeOrder && this.build.sale.marketOrders.length > 1) {
        trans.order_id = activeOrder;
      } else {
        trans.order_id = this.build.sale.marketOrders[0].order_id;
      }
    }
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
   * @param {Object} transaction - Transaction object to remove
   * @param {number} transaction.transaction_id - Transaction ID to remove
   */
  removeTransaction(transaction) {
    if (!transaction) return;
    this.build.sale.transactions = this.build.sale.transactions.filter(
      (i) => i.transaction_id !== transaction.transaction_id,
    );
  }

  /**
   * Adds a market order to the job's sales tracking.
   *
   * @param {Object} order - Market order data
   * @param {Object} brokersFee - Broker's fee information
   */
  addMarketOrder(order, brokersFee) {
    if (!order) return;

    if (brokersFee) {
      this.build.sale.brokersFee.push(
        brokersFee instanceof BrokerFee
          ? brokersFee
          : new BrokerFee(brokersFee),
      );
    }
    this.build.sale.marketOrders.push(MarketOrder.fromESI(order));
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

    this.build.sale.brokersFee = this.build.sale.brokersFee.filter(
      (fee) => !fee.belongsToOrder(order.order_id),
    );

    this.build.sale.marketOrders = this.build.sale.marketOrders.filter(
      (i) => i.order_id !== order.order_id,
    );

    this.build.sale.transactions = this.build.sale.transactions.filter(
      (i) => i.location_id !== order.location_id,
    );
  }

  /**
   * Updates linked ESI job data with latest information.
   *
   * @param {Array<Object>} latestESIJobs - Array of latest ESI job data
   */
  updateLinkedJobData(latestESIJobs) {
    if (!latestESIJobs) return;
    this.build.costs.linkedJobs.forEach((linkedJob) => {
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
    return this.build.costs.linkedJobs.reduce((latest, linkedJob) => {
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
    return this.build.costs.linkedJobs.reduce((soonest, linkedJob) => {
      if (linkedJob.finishesAt === null) return soonest;
      if (!soonest || linkedJob.finishesAt < soonest.finishesAt) {
        return linkedJob;
      }
      return soonest;
    }, null);
  }

  /**
   * @param {Setup} setup
   */

  attachNewSetupToJob(setup) {
    this.build.setup[setup.id] = setup;
    this.layout.setupToEdit = setup.id;
  }

  addNewSetup(queryClient) {
    const requiredQuantity = this.rawData.products[0].quantity;
    const context = buildSetupContextForJob(
      this,
      requiredQuantity,
      queryClient,
    );
    const newSetup = buildSetupFromQuantity(
      this,
      context.setupQuantities[0],
      queryClient,
      context,
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

  recalculateSelectedSetup(
    setupId,
    queryClient,
    additionalMaterialPrices = {},
    additionalSystemIndexValues = {},
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
      additionalSystemIndexValues,
    );
  }
  /**
   * Calculates the total number of involved characters for the job.
   *
   * Characters named only by an invention cost are not counted.
   */

  get involvedCharacters() {
    const characters = new Set();

    for (const linkedJob of this.build.costs.linkedJobs) {
      characters.add(linkedJob.CharacterHash);
    }

    for (const order of this.build.sale.marketOrders) {
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
function documentToLinkedJobs(object) {
  const rows = object?.build?.costs?.linkedJobs;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => new LinkedESIJob(row));
}

/**
 * Helper function that converts a document's material rows to Material instances.
 *
 * @param {Object} object - Object containing job data
 * @param {Function} requirement - Looks up how many of a material the job needs
 * @returns {Array<Material>|null} The job's materials, or null when it has none yet
 */
function documentToMaterials(object, requirement) {
  const rows = object?.build?.materials;
  if (!Array.isArray(rows)) {
    return null;
  }
  return rows.map((row) => new Material(row, requirement));
}

export default Job;

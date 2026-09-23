import { jobTypes } from "../Context/defaultValues";
import Setup from "./jobSetup";
import Material from "./jobMaterial";
import LinkedESIJob from "./linkedESIJob";
import { finishesAt } from "../Components/Edit Job/Edit Job Hooks/linkedRunSelectors";
import BrokerFee from "./brokerFee";
import { asIDList, asStringID } from "../Functions/Helper/ids";
import {
  brokersFeesOf,
  buildCost,
  costOfMaterials,
  jobSlotsOf,
  materialRequirementOf,
  materialsBoughtInFull,
  quantityProduced,
  totalCostOf,
  transactionFeesOf,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import ExtraCost from "./extraCost";
import InventionEntry from "./inventionEntry";
import MarketOrder from "./marketOrder";
import Transaction from "./transaction";
import useUsersStore from "../Zustand/usersStore";

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
 * @param {string|null} orderType - The job's single order type, already resolved
 * @returns {{buying: {market: string|null, orderType: string|null},
 *   selling: {market: string|null, orderType: string|null}}|null}
 */
function jobPricingOverride(stored, market, orderType) {
  const side = (name) => {
    const chosen = stored?.[name];
    if (chosen?.market || chosen?.orderType) {
      return {
        market: chosen.market || null,
        orderType: chosen.orderType || null,
      };
    }
    return { market: market ?? null, orderType: orderType ?? null };
  };

  const buying = side("buying");
  const selling = side("selling");
  const chosenAnywhere =
    buying.market || buying.orderType || selling.market || selling.orderType;

  return chosenAnywhere ? { buying, selling } : null;
}

/**
 * An industry job: its setups, materials, and the ESI rows linked to it.
 *
 * The job holds what it is made of. What it is worth is derived by the
 * selectors in `Edit Job Hooks/jobSelectors.js`, and the members here that
 * still answer a figure read one rather than summing the rows again.
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

    const localMarketDisplay =
      itemJson?.layout?.localMarketDisplay ??
      itemJson?.layout?.marketLocation ??
      null;
    const localOrderDisplay =
      itemJson?.layout?.localOrderDisplay ??
      itemJson?.layout?.orderType ??
      null;

    this.build.localPricing = jobPricingOverride(
      build && "localPricing" in build
        ? build.localPricing
        : itemJson?.layout?.localPricing,
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
   * @returns {number} Number of setups
   */
  get setupCount() {
    return Object.values(this.build.setup).length;
  }

  /**
   * @returns {number} Number of completed materials
   */
  get completedMaterialCount() {
    return materialsBoughtInFull(this.build.materials, this.build.setup);
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
    return Object.keys(this.esi.industryJobs).length === 0;
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
    return jobSlotsOf(this.build.setup);
  }

  /**
   * What the job cost: building it, and then selling it.
   *
   * @returns {number} Total cost
   */
  get totalCost() {
    return totalCostOf({
      buildCost: buildCost(this),
      brokersFees: this.totalBrokersFees,
      transactionFees: this.totalTransactionFees,
    });
  }

  /**
   * Broker fees paid to list the output.
   *
   * @returns {number} Fee total
   */
  get totalBrokersFees() {
    return brokersFeesOf(this.esi.marketOrders);
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
    return transactionFeesOf(this.esi.transactions);
  }

  /**
   * What the materials cost the job: what each material's purchases bought,
   * summed. `models.Job.TotalMaterialCost` is the same method on the backend.
   *
   * @returns {number} Material cost
   */
  get totalMaterialCost() {
    return costOfMaterials(this.build.materials, this.build.setup);
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
    const produced = quantityProduced(
      this.build.setup,
      this.itemsProducedPerRun,
    );
    if (!produced) return 0;

    return cost / produced;
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
   * The linked job that finishes last, which is when the job as a whole is done.
   * Jobs with no end date are not waited on.
   *
   * @returns {LinkedESIJob|null}
   */
  get lastRunToFinish() {
    return Object.values(this.esi.industryJobs).reduce((latest, linkedJob) => {
      if (finishesAt(linkedJob) === null) return latest;
      if (!latest || finishesAt(linkedJob) > finishesAt(latest)) {
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
      if (finishesAt(linkedJob) === null) return soonest;
      if (!soonest || finishesAt(linkedJob) < finishesAt(soonest)) {
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

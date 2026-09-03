import { getAppVersionNumber } from "../Functions/Endpoints/Public/appConfig.js";

/**
 * JobSnapshot class for lightweight job data representation and locking.
 * 
 * This class provides a simplified representation of job data for:
 * - Quick job overview and status tracking
 * - Job locking mechanism for collaborative editing
 * - Efficient data transfer and storage
 * - Job relationship tracking (parent/child jobs)
 * - Material and setup count tracking
 * - ESI API integration tracking
 * 
 * The JobSnapshot class is optimised for performance and collaboration:
 * - Lightweight data structure for fast loading
 * - Locking mechanism to prevent concurrent editing
 * - Material and setup count tracking for quick overview
 * - ESI API integration tracking for real-time updates
 * - Job relationship mapping for complex production chains
 * - End date calculation for linked ESI jobs
 * 
 * @class JobSnapshot
 * @example
 * // Create snapshot from existing job
 * const snapshot = new JobSnapshot(jobInstance);
 * 
 * @example
 * // Create snapshot from data
 * const snapshot = new JobSnapshot({
 *   jobID: 'job-123',
 *   name: 'Tritanium',
 *   jobStatus: 1,
 *   itemQuantity: 1000
 * });
 * 
 * @example
 * // Lock snapshot for editing
 * snapshot.lockSnapshot('ABC123');
 * 
 * @example
 * // Get price request data
 * const priceIDs = snapshot.getPriceRequest();
 */
class JobSnapshot {
  /**
   * Combines canonical `parentJobs` with legacy Firestore `parentJob` (same ids, deduped).
   * @param {unknown} parentJobs
   * @param {unknown} parentJob
   * @returns {Set<string>}
   */
  static mergeParentJobIds(parentJobs, parentJob) {
    const a = Array.isArray(parentJobs) ? parentJobs : [];
    const b = Array.isArray(parentJob) ? parentJob : [];
    return new Set(
      [...a, ...b]
        .map((id) => String(id))
        .filter((id) => id !== "")
    );
  }

  /**
   * Creates a new JobSnapshot instance.
   * 
   * @param {Object|Job} input - Job instance or snapshot data object
   * @param {Object} [input.build] - Build data (if input is Job instance)
   * @param {boolean} [input.isLocked] - Whether snapshot is locked
   * @param {number} [input.lockedTimestamp] - Lock timestamp
   * @param {string} [input.lockedUser] - User who locked the snapshot
   * @param {string} [input.jobID] - Job identifier
   * @param {string} [input.name] - Job name
   * @param {number} [input.jobStatus] - Job status (0-3)
   * @param {number} [input.jobType] - Job type (manufacturing, reaction, etc.)
   * @param {number} [input.itemID] - Item type ID
   * @param {Array<number>} [input.apiJobs] - Linked ESI job IDs
   * @param {Array<number>} [input.apiOrders] - Linked ESI order IDs
   * @param {Array<number>} [input.apiTransactions] - Linked ESI transaction IDs
   * @param {number} [input.itemQuantity] - Total item quantity
   * @param {number} [input.totalMaterials] - Total material count
   * @param {number} [input.totalComplete] - Completed material count
   * @param {number} [input.totalJobCount] - Total job count
   * @param {number} [input.totalSetupCount] - Total setup count
   * @param {string} [input.buildVer] - Build version
   * @param {Array<string>} [input.parentJobs] - Parent job IDs
   * @param {Array<string>} [input.childJobs] - Child job IDs
   * @param {Array<number>} [input.materialIDs] - Material type IDs
   * @param {number} [input.metaLevel] - Meta level
   * @param {string} [input.groupID] - Group ID
   * @param {number} [input.endDateDisplay] - End date timestamp
   */
  constructor(input = {}) {
    if (input.build) {
      this.setSnapshot(input);
    } else {
      const {
        isLocked = false,
        lockedTimestamp = null,
        lockedUser = null,
        jobID = "",
        name = "",
        jobStatus = 0,
        jobType = 1,
        itemID = 0,
        apiJobs = [],
        apiOrders = [],
        apiTransactions = [],
        itemQuantity = 0,
        totalMaterials = 0,
        totalComplete = 0,
        totalJobCount = 0,
        totalSetupCount = 0,
        buildVer = getAppVersionNumber(),
        parentJobs = [],
        parentJob = [],
        childJobs = [],
        materialIDs = [],
        metaLevel = 0,
        groupID = "",
        endDateDisplay = null,
      } = input;

      this.isLocked = isLocked;
      this.lockedTimestamp = lockedTimestamp;
      this.lockedUser = lockedUser;
      this.jobID = jobID.toString();
      this.name = name;
      this.jobStatus = jobStatus;
      this.jobType = jobType;
      this.itemID = itemID;
      this.apiJobs = new Set(apiJobs);
      this.apiOrders = new Set(apiOrders);
      this.apiTransactions = new Set(apiTransactions);
      this.itemQuantity = itemQuantity;
      this.totalMaterials = totalMaterials;
      this.totalComplete = totalComplete;
      this.totalJobCount = totalJobCount;
      this.totalSetupCount = totalSetupCount;
      this.buildVer = buildVer;
      this.parentJobs = JobSnapshot.mergeParentJobIds(parentJobs, parentJob);
      this.childJobs = new Set(childJobs.map(String));
      this.materialIDs = new Set(materialIDs);
      this.metaLevel = metaLevel;
      this.groupID = groupID;
      this.endDateDisplay = endDateDisplay;
    }
  }

  /**
   * Converts the snapshot to a document object for storage.
   * 
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      isLocked: this.isLocked,
      lockedTimestamp: this.lockedTimestamp,
      lockedUser: this.lockedUser,
      jobID: this.jobID,
      name: this.name,
      jobStatus: this.jobStatus,
      jobType: this.jobType,
      itemID: this.itemID,
      apiJobs: Array.from(this.apiJobs),
      apiOrders: Array.from(this.apiOrders),
      apiTransactions: Array.from(this.apiTransactions),
      itemQuantity: this.itemQuantity,
      totalMaterials: this.totalMaterials,
      totalComplete: this.totalComplete,
      totalJobCount: this.totalJobCount,
      totalSetupCount: this.totalSetupCount,
      buildVer: this.buildVer,
      parentJobs: Array.from(this.parentJobs),
      childJobs: Array.from(this.childJobs),
      materialIDs: Array.from(this.materialIDs),
      metaLevel: this.metaLevel,
      groupID: this.groupID,
      endDateDisplay: this.endDateDisplay,
    };
  }

  /**
   * Sets snapshot data from a Job instance.
   * 
   * This method extracts relevant data from a Job instance to create a snapshot:
   * - Extracts basic job information (ID, name, status, type)
   * - Calculates material counts and completion status
   * - Processes child job relationships
   * - Calculates end date from linked ESI jobs
   * - Computes total job and setup counts
   * 
   * @param {Job} inputJob - Job instance to create snapshot from
   */
  setSnapshot(inputJob) {
    const {
      jobID,
      name,
      jobStatus,
      jobType,
      itemID,
      apiJobs,
      apiOrders,
      apiTransactions,
      buildVer,
      parentJob,
      metaLevel,
      groupID = "",
      build,
    } = inputJob;

    this.isLocked = false;
    this.lockedTimestamp = null;
    this.lockedUser = null;
    this.jobID = jobID.toString();
    this.name = name;
    this.jobStatus = jobStatus;
    this.jobType = jobType;
    this.itemID = itemID;
    this.apiJobs = new Set(apiJobs);
    this.apiOrders = new Set(apiOrders);
    this.apiTransactions = new Set(apiTransactions);
    this.itemQuantity = inputJob.totalQuantityProduced();
    this.totalMaterials = build.materials.length;
    this.buildVer = buildVer || getAppVersionNumber();
    this.parentJobs = JobSnapshot.mergeParentJobIds(
      inputJob.parentJobs,
      parentJob
    );
    this.metaLevel = metaLevel;
    this.groupID = groupID;

    this.materialIDs = new Set(
      build.materials.map((material) => material.typeID)
    );
    this.childJobs = new Set(Object.values(build.childJobs).flat());

    this.totalComplete = build.materials.filter(
      (material) => material.quantityPurchased >= material.quantity
    ).length;

    const tempJobs = build.costs.linkedJobs || [];
    this.endDateDisplay = tempJobs.length
      ? Date.parse(
          tempJobs.reduce((latest, job) =>
            Date.parse(job.end_date) > Date.parse(latest.end_date)
              ? job
              : latest
          ).end_date
        )
      : null;

    const { totalJobCount, totalSetupCount } = Object.values(
      build.setup
    ).reduce(
      (acc, { jobCount }) => ({
        totalJobCount: acc.totalJobCount + jobCount,
        totalSetupCount: acc.totalSetupCount + 1,
      }),
      { totalJobCount: 0, totalSetupCount: 0 }
    );
    this.totalJobCount = totalJobCount;
    this.totalSetupCount = totalSetupCount;
  }

  /**
   * Locks the snapshot for editing by a specific character.
   * 
   * @param {string} CharacterHash - Character hash of the user locking the snapshot
   */
  lockSnapshot(CharacterHash) {
    if (!CharacterHash) return;
    this.isLocked = true;
    this.lockedTimestamp = Date.now();
    this.lockedUser = CharacterHash;
  }

  /**
   * Unlocks the snapshot, allowing other users to edit it.
   */
  unlockSnapshot() {
    this.isLocked = false;
    this.lockedTimestamp = null;
    this.lockedUser = null;
  }

  /**
   * Gets the list of type IDs needed for price requests.
   * 
   * @returns {Array<number>} Array of type IDs (item + materials)
   */
  getPriceRequest() {
    return [this.itemID, ...this.materialIDs];
  }

  /**
   * Gets all related job IDs (parent and child jobs).
   * 
   * @returns {Array<string>} Array of related job IDs
   */
  getRelatedJobs() {
    return [...this.childJobs, ...this.parentJobs];
  }
}

export default JobSnapshot;

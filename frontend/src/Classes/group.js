import uuid from "react-uuid";
import DOMPurify from "dompurify";
import getAllRelatedJobs from "../Functions/Helper/getAllRelatedJobs";
import { getRealtimeClientID } from "../Realtime/wsClientIdentity.js";

/**
 * Group class for organizing and managing EVE Online industry jobs.
 * 
 * This class represents a group of related industry jobs for:
 * - Job organization and categorization
 * - Batch operations on multiple jobs
 * - Progress tracking and completion management
 * - ESI API integration tracking
 * - Material and type ID management
 * - Group status and workflow management
 * 
 * The Group class provides comprehensive job management capabilities:
 * - Job inclusion and exclusion management
 * - Material and type ID tracking
 * - ESI API integration (jobs, orders, transactions)
 * - Group status progression (0-3)
 * - Completion tracking and visibility controls
 * - Batch operations for job management
 * - Input sanitization for security
 * 
 * @class Group
 * @example
 * // Create a new group
 * const group = new Group({
 *   groupName: 'Tritanium Production',
 *   groupType: 1,
 *   includedJobIDs: ['job-1', 'job-2']
 * });
 * 
 * @example
 * // Add jobs to group
 * group.addJobsToGroup([job1, job2, job3]);
 * 
 * @example
 * // Update group data
 * group.updateGroupData(jobArray);
 * 
 * @example
 * // Manage group status
 * group.moveGroupStatusForward();
 * group.toggleShowComplete();
 */
class Group {
  /**
   * Creates a new Group instance for job organization.
   * 
   * @param {Object} data - Group configuration data
   * @param {string} [data.groupName] - Name of the group
   * @param {string} [data.groupID] - Unique group identifier
   * @param {Array<string>} [data.includedJobIDs] - Array of job IDs to include
   * @param {Array<number>} [data.includedTypeIDs] - Array of type IDs to include
   * @param {Array<number>} [data.materialIDs] - Array of material type IDs
   * @param {number} [data.outputJobCount] - Number of output jobs
   * @param {Array<string>} [data.areComplete] - Array of completed job IDs
   * @param {boolean} [data.showComplete] - Whether to show completed jobs
   * @param {number} [data.groupStatus] - Group status (0-3)
   * @param {number} [data.groupType] - Group type identifier
   * @param {Array<number>} [data.linkedJobIDs] - Array of linked ESI job IDs
   * @param {Array<number>} [data.linkedOrderIDs] - Array of linked ESI order IDs
   * @param {Array<number>} [data.linkedTransIDs] - Array of linked ESI transaction IDs
   */
  constructor(data) {
    this.groupName = data?.groupName || "Untitled Group";
    this.groupID = data?.groupID || `group-${uuid()}`;
    this.includedJobIDs = new Set(data?.includedJobIDs?.map(String) || []);
    this.includedTypeIDs = this._newSet(data?.includedTypeIDs ?? [], this._convertToNumber);
    this.materialIDs = this._newSet(data?.materialIDs ?? [], this._convertToNumber);
    this.outputJobCount = data?.outputJobCount || 0;
    this.areComplete = new Set(data?.areComplete?.map(String) || []);
    this.showComplete = data?.showComplete || true;
    this.groupStatus = data?.groupStatus || 0;
    this.groupType = data?.groupType || 1;
    this.linkedJobIDs = this._newSet(data?.linkedJobIDs ?? [], this._convertToNumber);
    this.linkedOrderIDs = this._newSet(data?.linkedOrderIDs ?? [], this._convertToNumber);
    this.linkedTransIDs = this._newSet(data?.linkedTransIDs ?? [], this._convertToNumber);
    const rawMeta = data?._meta;
    this._meta =
      rawMeta && typeof rawMeta === "object"
        ? { ...rawMeta }
        : {};
    delete this._meta.buildVer;
  }

  /**
   * Whether this group includes an output job for the given EVE type ID (number-normalized).
   *
   * @param {number|string} typeID
   * @returns {boolean}
   */
  hasIncludedTypeId(typeID) {
    const n = this._convertToNumber(typeID);
    return n !== null && this.includedTypeIDs.has(n);
  }

  /**
   * Converts the group to a document object for storage (`[]int` / `[]int64` JSON numbers).
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    const intArrayFromSet = (set) =>
      [...set].filter((id) => Number.isFinite(Number(id)));
    const doc = {
      groupName: this.groupName,
      groupID: this.groupID,
      includedJobIDs: [...this.includedJobIDs],
      includedTypeIDs: intArrayFromSet(this.includedTypeIDs),
      materialIDs: intArrayFromSet(this.materialIDs),
      outputJobCount: this.outputJobCount,
      areComplete: [...this.areComplete],
      showComplete: this.showComplete,
      groupStatus: this.groupStatus,
      groupType: this.groupType,
      linkedJobIDs: intArrayFromSet(this.linkedJobIDs),
      linkedOrderIDs: intArrayFromSet(this.linkedOrderIDs),
      linkedTransIDs: intArrayFromSet(this.linkedTransIDs),
    };
    const meta = { ...this._meta };
    delete meta.buildVer;
    const cid = getRealtimeClientID();
    if (cid) {
      meta.clientID = cid;
    }
    if (Object.keys(meta).length > 0) {
      doc._meta = meta;
    }
    return doc;
  }

  /**
   * Converts an ID to a number, returning null if invalid.
   * 
   * @private
   * @param {*} id - ID to convert to number
   * @returns {number|null} Converted number or null if invalid
   */
  _convertToNumber(id) {
    const num = Number(id);
    return isNaN(num) ? null : num;
  }

  /**
   * Converts an ID to a string, returning null if null/undefined.
   * 
   * @private
   * @param {*} id - ID to convert to string
   * @returns {string|null} Converted string or null if null/undefined
   */
  _convertToString(id) {
    return id != null ? String(id) : null;
  }

  /**
   * Applies an action to a set with ID conversion.
   * 
   * This private method handles ID conversion and set operations:
   * - Validates input parameters
   * - Handles both single IDs and arrays/sets
   * - Converts IDs using the provided converter function
   * - Applies the action to the target set
   * 
   * @private
   * @param {*} inputIDs - ID(s) to process
   * @param {Function} action - Set method to call (add, delete, etc.)
   * @param {Set} targetSet - Target set to modify
   * @param {Function} converter - Function to convert IDs
   */
  _toSet(inputIDs, action, targetSet, converter) {
    if (!inputIDs || !action || !targetSet || !converter) return;

    if (Array.isArray(inputIDs) || inputIDs instanceof Set) {
      inputIDs.forEach((id) => {
        const convertedID = converter(id);
        if (convertedID !== null) {
          action.call(targetSet, convertedID);
        }
      });
    } else {
      const convertedID = converter(inputIDs);
      if (convertedID !== null) {
        action.call(targetSet, convertedID);
      }
    }
  }

  /**
   * Creates a new set from input IDs using a converter function.
   * 
   * @private
   * @param {*} inputIDs - ID(s) to convert
   * @param {Function} converter - Function to convert IDs
   * @returns {Set} New set with converted IDs
   */
  _newSet(inputIDs, converter) {
    const _newSet = new Set();
    this._toSet(inputIDs, Set.prototype.add, _newSet, converter);
    return _newSet;
  }

  /**
   * Builds new group data from an array of jobs.
   * 
   * This private method processes job data to extract group information:
   * - Counts output jobs (jobs without parent jobs)
   * - Collects material IDs from jobs and their materials
   * - Collects job type IDs
   * - Collects included job IDs
   * - Collects linked ESI data (jobs, orders, transactions)
   * 
   * @private
   * @param {Array<Job>} arrayOfJobs - Array of job objects to process
   * @returns {Object} Object containing processed group data
   */
  _buildNewGroupData(arrayOfJobs) {
    if (!arrayOfJobs) return;

    const updateSet = (targetSet, sourceSet) => {
      sourceSet.forEach((item) => targetSet.add(item));
    };

    let newOutputJobCount = 0;
    const newMaterialIDs = new Set();
    const newJobTypeIDs = new Set();
    const newIncludedJobIDs = new Set();
    const newLinkedJobIDs = new Set();
    const newLinkedOrderIDs = new Set();
    const newLinkedTransIDs = new Set();

    arrayOfJobs.forEach((job) => {
      if (job.parentJobs.length === 0) {
        newOutputJobCount++;
      }
      newMaterialIDs.add(job.itemID);
      newJobTypeIDs.add(job.itemID);
      newIncludedJobIDs.add(job.jobID);
      updateSet(newLinkedJobIDs, job.apiJobs);
      updateSet(newLinkedOrderIDs, job.apiOrders);
      updateSet(newLinkedTransIDs, job.apiTransactions);

      job.build.materials.forEach((mat) => {
        newMaterialIDs.add(mat.typeID);
      });
    });

    return {
      newOutputJobCount,
      newMaterialIDs,
      newJobTypeIDs,
      newIncludedJobIDs,
      newLinkedJobIDs,
      newLinkedOrderIDs,
      newLinkedTransIDs,
    };
  }

  /**
   * Sets the group name with input sanitization.
   * 
   * This method sets the group name with security and formatting:
   * - Validates input parameters
   * - Handles both string and array inputs
   * - Sanitizes input using DOMPurify for security
   * - Truncates to 75 characters maximum
   * 
   * @param {string|Array<Object>} inputGroupName - Group name or array of objects with name property
   */
  setGroupName(inputGroupName) {
    if (!inputGroupName || inputGroupName.length === 0) return;

    if (Array.isArray(inputGroupName)) {
      const stringArray = [];
      inputGroupName.forEach((obj) => stringArray.push(obj.name));

      this.groupName = stringArray.join(", ").substring(0, 75);
    } else {
      const sanitizedName = DOMPurify.sanitize(inputGroupName, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });
      this.groupName = sanitizedName.substring(0, 75);
    }
  }

  /**
   * Sets the group ID.
   * 
   * @param {string} inputGroupID - New group ID
   */
  setGroupID(inputGroupID) {
    if (!inputGroupID) return;
    this.groupID = inputGroupID;
  }

  /**
   * Adds job IDs to the included jobs set.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to add
   */
  addIncludedJobIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.includedJobIDs,
      this._convertToString
    );
  }

  /**
   * Sets the included job IDs, replacing existing ones.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to set
   */
  setIncludedJobIDs(inputJobIDs) {
    this.includedJobIDs = this._newSet(inputJobIDs, this._convertToString);
  }

  /**
   * Removes job IDs from the included jobs set.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to remove
   */
  removeIncludedJobIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.includedJobIDs,
      this._convertToString
    );
  }

  /**
   * Adds type IDs to the included types set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Type ID(s) to add
   */
  addIncludedTypeIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.includedTypeIDs,
      this._convertToNumber
    );
  }

  /**
   * Sets the included type IDs, replacing existing ones.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Type ID(s) to set
   */
  setIncludedTypeIDs(inputJobIDs) {
    this.includedTypeIDs = this._newSet(inputJobIDs, this._convertToNumber);
  }

  /**
   * Removes type IDs from the included types set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Type ID(s) to remove
   */
  removeIncludedTypeIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.includedTypeIDs,
      this._convertToNumber
    );
  }

  /**
   * Adds material IDs to the materials set.
   * 
   * @param {number|Array<number>|Set<number>} inputMaterialIDs - Material ID(s) to add
   */
  addMaterialIDs(inputMaterialIDs) {
    this._toSet(
      inputMaterialIDs,
      Set.prototype.add,
      this.materialIDs,
      this._convertToNumber
    );
  }

  /**
   * Sets the material IDs, replacing existing ones.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Material ID(s) to set
   */
  setMaterialIDs(inputJobIDs) {
    this.materialIDs = this._newSet(inputJobIDs, this._convertToNumber);
  }

  /**
   * Removes material IDs from the materials set.
   * 
   * @param {number|Array<number>|Set<number>} inputMaterialIDs - Material ID(s) to remove
   */
  removeMaterialIDs(inputMaterialIDs) {
    this._toSet(
      inputMaterialIDs,
      Set.prototype.delete,
      this.materialIDs,
      this._convertToNumber
    );
  }

  /**
   * Updates the output job count.
   * 
   * @param {number} input - New output job count
   */
  updateOutputJobCount(input) {
    if (input == null || isNaN(Number(input))) return;
    this.outputJobCount = Number(input);
  }

  /**
   * Adds to the output job count.
   * 
   * @param {number} input - Number to add to output job count
   */
  addOutputJobCount(input) {
    if (input == null || isNaN(Number(input))) return;
    this.outputJobCount += Number(input);
  }

  /**
   * Adds job IDs to the completed jobs set.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to mark as complete
   */
  addAreComplete(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.areComplete,
      this._convertToString
    );
  }

  /**
   * Sets the completed jobs, replacing existing ones.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to mark as complete
   */
  setAreComplete(inputJobIDs) {
    this.areComplete = this._newSet(inputJobIDs, this._convertToString);
  }

  /**
   * Removes job IDs from the completed jobs set.
   * 
   * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to remove from complete
   */
  removeAreComplete(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.areComplete,
      this._convertToString
    );
  }

  /**
   * Toggles the show complete setting.
   */
  toggleShowComplete() {
    this.showComplete = !this.showComplete;
  }

  /**
   * Sets the group status.
   * 
   * @param {number} input - Group status value (0-3)
   */
  setGroupStatus(input) {
    if (isNaN(Number(input))) return;
    this.groupStatus = Number(input);
  }

  /**
   * Moves the group status forward by one step.
   */
  moveGroupStatusForward() {
    if (this.groupStatus >= 3) return;
    this.groupStatus++;
  }

  /**
   * Moves the group status backward by one step.
   */
  moveGroupStatusBackward() {
    if (this.groupStatus === 0) return;
    this.groupStatus--;
  }

  /**
   * Adds order IDs to the linked orders set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Order ID(s) to add
   */
  addLinkedOrderIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.linkedOrderIDs,
      this._convertToNumber
    );
  }

  /**
   * Sets the linked order IDs, replacing existing ones.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Order ID(s) to set
   */
  setLinkedOrderIDs(inputJobIDs) {
    this.linkedOrderIDs = this._newSet(inputJobIDs, this._convertToNumber);
  }

  /**
   * Removes order IDs from the linked orders set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Order ID(s) to remove
   */
  removeLinkedOrderIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.linkedOrderIDs,
      this._convertToNumber
    );
  }

  /**
   * Adds job IDs to the linked jobs set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Job ID(s) to add
   */
  addLinkedJobIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.linkedJobIDs,
      this._convertToNumber
    );
  }

  /**
   * Sets the linked job IDs, replacing existing ones.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Job ID(s) to set
   */
  setLinkedJobIDs(inputJobIDs) {
    this.linkedJobIDs = this._newSet(inputJobIDs, this._convertToNumber);
  }

  /**
   * Removes job IDs from the linked jobs set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Job ID(s) to remove
   */
  removeLinkedJobIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.linkedJobIDs,
      this._convertToNumber
    );
  }

  /**
   * Adds transaction IDs to the linked transactions set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Transaction ID(s) to add
   */
  addLinkedTransIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.add,
      this.linkedTransIDs,
      this._convertToNumber
    );
  }

  /**
   * Sets the linked transaction IDs, replacing existing ones.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Transaction ID(s) to set
   */
  setLinkedTransIDs(inputJobIDs) {
    this.linkedTransIDs = this._newSet(inputJobIDs, this._convertToNumber);
  }

  /**
   * Removes transaction IDs from the linked transactions set.
   * 
   * @param {number|Array<number>|Set<number>} inputJobIDs - Transaction ID(s) to remove
   */
  removeLinkedTransIDs(inputJobIDs) {
    this._toSet(
      inputJobIDs,
      Set.prototype.delete,
      this.linkedTransIDs,
      this._convertToNumber
    );
  }

  /**
   * Creates a new group from job objects.
   * 
   * This method initializes a group with job data:
   * - Sets group name from output jobs
   * - Calculates material and type IDs
   * - Counts output jobs
   * - Links ESI API data
   * 
   * @param {Array<Job>|Job} inputJobObjects - Job objects to create group from
   */
  createGroup(inputJobObjects) {
    if (!inputJobObjects) return;

    const jobArray = Array.isArray(inputJobObjects)
      ? inputJobObjects
      : [inputJobObjects];

    const {
      newOutputJobCount,
      newMaterialIDs,
      newJobTypeIDs,
      newIncludedJobIDs,
      newLinkedJobIDs,
      newLinkedOrderIDs,
      newLinkedTransIDs,
    } = this._buildNewGroupData(jobArray);

    const outputJobs = inputJobObjects.filter((i) => i.parentJobs.length === 0);

    this.setGroupName(outputJobs);
    this.updateOutputJobCount(newOutputJobCount);
    this.setMaterialIDs(newMaterialIDs);
    this.setIncludedJobIDs(newIncludedJobIDs);
    this.setIncludedTypeIDs(newJobTypeIDs);
    this.setLinkedJobIDs(newLinkedJobIDs);
    this.setLinkedOrderIDs(newLinkedOrderIDs);
    this.setLinkedTransIDs(newLinkedTransIDs);
  }

  /**
   * Updates group data from job objects.
   * 
   * This method recalculates group data from current job objects:
   * - Updates material and type IDs
   * - Recalculates output job count
   * - Updates ESI API links
   * 
   * @param {Array<Job>|Job} inputJobObjects - Job objects to update group from
   */
  updateGroupData(inputJobObjects) {
    if (!inputJobObjects) return;

    const jobArray = Array.isArray(inputJobObjects)
      ? inputJobObjects
      : [inputJobObjects];

    const {
      newOutputJobCount,
      newMaterialIDs,
      newJobTypeIDs,
      newIncludedJobIDs,
      newLinkedJobIDs,
      newLinkedOrderIDs,
      newLinkedTransIDs,
    } = this._buildNewGroupData(jobArray);

    this.updateOutputJobCount(newOutputJobCount);
    this.setMaterialIDs(newMaterialIDs);
    this.setIncludedJobIDs(newIncludedJobIDs);
    this.setIncludedTypeIDs(newJobTypeIDs);
    this.setLinkedJobIDs(newLinkedJobIDs);
    this.setLinkedOrderIDs(newLinkedOrderIDs);
    this.setLinkedTransIDs(newLinkedTransIDs);
  }

  /**
   * Adds jobs to the existing group.
   * 
   * This method adds jobs to the group without replacing existing data:
   * - Adds to existing material and type IDs
   * - Increments output job count
   * - Merges ESI API links
   * 
   * @param {Array<Job>|Job} inputJobObjects - Job objects to add to group
   */
  addJobsToGroup(inputJobObjects) {
    if (!inputJobObjects) return;

    const jobArray = Array.isArray(inputJobObjects)
      ? inputJobObjects
      : [inputJobObjects];

    const {
      newOutputJobCount,
      newMaterialIDs,
      newJobTypeIDs,
      newIncludedJobIDs,
      newLinkedJobIDs,
      newLinkedOrderIDs,
      newLinkedTransIDs,
    } = this._buildNewGroupData(jobArray);

    this.addOutputJobCount(newOutputJobCount);
    this.addMaterialIDs(newMaterialIDs);
    this.addIncludedJobIDs(newIncludedJobIDs);
    this.addIncludedTypeIDs(newJobTypeIDs);
    this.addLinkedJobIDs(newLinkedJobIDs);
    this.addLinkedOrderIDs(newLinkedOrderIDs);
    this.addLinkedTransIDs(newLinkedTransIDs);
  }

  /**
   * Removes jobs from the group and recalculates group data.
   * 
   * This method removes specified jobs and updates group data:
   * - Removes jobs from the group
   * - Recalculates material and type IDs from remaining jobs
   * - Updates output job count
   * - Updates ESI API links
   * 
   * @param {Array<Job>|Job} jobsToRemove - Jobs to remove from group
   * @param {Array<Job>} jobArray - Complete array of jobs for recalculation
   */
  removeJobsFromGroup(jobsToRemove, jobArray) {
    if (!jobsToRemove || !jobArray) return;

    const jobsToRemoveAsArray = Array.isArray(jobsToRemove)
      ? jobsToRemove
      : [jobsToRemove];

    const idsOfJobsToRemove = new Set();

    jobsToRemoveAsArray.forEach((job) => idsOfJobsToRemove.add(job.jobID));

    const remainingGroupJobs = jobArray.filter(
      (job) => job.groupID === this.groupID && !idsOfJobsToRemove.has(job.jobID)
    );

    const {
      newOutputJobCount,
      newMaterialIDs,
      newJobTypeIDs,
      newIncludedJobIDs,
      newLinkedJobIDs,
      newLinkedOrderIDs,
      newLinkedTransIDs,
    } = this._buildNewGroupData(remainingGroupJobs);

    this.updateOutputJobCount(newOutputJobCount);
    this.setMaterialIDs(newMaterialIDs);
    this.setIncludedJobIDs(newIncludedJobIDs);
    this.setIncludedTypeIDs(newJobTypeIDs);
    this.setLinkedJobIDs(newLinkedJobIDs);
    this.setLinkedOrderIDs(newLinkedOrderIDs);
    this.setLinkedTransIDs(newLinkedTransIDs);
  }

  findOutputJobs(groupJobs) {
    if (!groupJobs) return [];
    const outputJobs = [];
    for (const job of groupJobs) {
      if (job?.parentJobs.length > 0) continue;
      outputJobs.push(job);
    }
    return outputJobs;
  }

  getJobIDsForOutputJob(outputJob) {
    if (!outputJob) return [];

    return getAllRelatedJobs(outputJob.jobID);
  }

}

export default Group;

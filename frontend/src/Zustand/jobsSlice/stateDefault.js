/**
 * The jobs slice's starting shape, in a leaf module so the slice, a reset and the
 * test harness all read it from one place.
 */

/**
 * Default state configuration for jobs data.
 *
 * @returns {Object} Default jobs state
 * @property {Array} multiSelect - Array of selected job/group IDs
 * @property {Array} jobArray - Array of job objects
 * @property {Array} groupArray - Array of group objects
 * @property {string[]} pendingJobGroupWrites - Group IDs waiting to be persisted to the API
 * @property {string|null} activeGroupID - Currently active group ID
 * @property {Object} userWatchlist - User's watchlist data
 * @property {Array} userWatchlist.groups - Watchlist group objects
 * @property {Array} userWatchlist.items - Watchlist item objects
 */
export const stateDefault = () => ({
  multiSelect: [],
  /**
   * The planner `jobArray` and `groupArray` hold, as an owner handle; a load for
   * another planner replaces them rather than merging.
   */
  owner: null,
  jobArray: [],
  /**
   * Inbound WS jobs not yet flushed into `jobArray`: jobID -> { stageId, groupID }.
   * Used for per-stage skeleton tiles until inbound job-document coalesce (`Functions/Debounce/inboundJobDocumentsCoalesce.js`) applies.
   */
  pendingInboundNewJobSkeletonByJobId: {},
  groupArray: [],
  /** Group IDs with a pending write to the API (`PUT /api/v1/groups`; keeps WS fan-out to touched docs only). */
  pendingJobGroupWrites: [],
  /**
   * Each job with a pending write, against the log entries behind it — or `null`,
   * meaning the whole document is written.
   */
  pendingJobDocumentWrites: {},
  activeGroupID: null,
  userWatchlist: {
    groups: [],
    items: [],
  },
});

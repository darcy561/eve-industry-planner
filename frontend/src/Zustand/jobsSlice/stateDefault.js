/**
 * The jobs slice's own starting shape, with nothing else in it.
 *
 * A leaf module so anything needing the shape — the slice, a reset, the test
 * harness — reads it from one place. `core.js` cannot serve that: importing it
 * reaches the job-documents API client, which is what drove the harness to keep
 * a second copy that then drifted three fields behind this one.
 */

/**
 * Default state configuration for jobs data.
 *
 * @returns {Object} Default jobs state
 * @property {Array} multiSelect - Array of selected job/group IDs
 * @property {Array} jobArray - Array of job objects
 * @property {Array} groupArray - Array of group objects
 * @property {string[]} pendingJobGroupWrites - Group IDs waiting to be persisted to the API
 * @property {string|null} activeJobID - Currently active job ID
 * @property {string|null} activeGroupID - Currently active group ID
 * @property {Object} userWatchlist - User's watchlist data
 * @property {Array} userWatchlist.groups - Watchlist group objects
 * @property {Array} userWatchlist.items - Watchlist item objects
 */
export const stateDefault = () => ({
  multiSelect: [],
  /**
   * The planner `jobArray` and `groupArray` hold, as an owner handle. A load for
   * a different planner replaces them rather than merging, so one planner's jobs
   * cannot survive among another's.
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
  /** Job IDs with a pending write to the API (`PUT /api/v1/job-documents`). */
  pendingJobDocumentWrites: [],
  activeJobID: null,
  activeGroupID: null,
  userWatchlist: {
    groups: [],
    items: [],
  },
});

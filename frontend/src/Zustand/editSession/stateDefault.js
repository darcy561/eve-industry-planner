import { emptyDraftState } from "../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js";

/**
 * The edit session's starting shape, with nothing else in it.
 *
 * A leaf module so the slice, a reset and the test harness all read the shape
 * from one place.
 *
 * @returns {Object} Default edit session state
 * @property {import("../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js").DraftState} draft -
 *   The job as loaded, what the player changed, and what they asked about
 * @property {string|null} activeJobID - The job the editor is open on
 * @property {Object} temporaryChildJobs - Child jobs built but not yet saved
 * @property {Object} speculativeChildJobs - Jobs costed to price a row, by item id
 * @property {Object} esiDataToLink - ESI rows to link or unlink when the job closes
 * @property {Object} parentChildToEdit - Parent and child links to write when the job closes
 * @property {boolean} isLoading
 * @property {string|undefined} loadingMessage
 */
export const stateDefault = () => ({
  draft: emptyDraftState(),
  activeJobID: null,
  temporaryChildJobs: {},
  speculativeChildJobs: {},
  esiDataToLink: {
    industryJobs: { add: [], remove: [] },
    marketOrders: { add: [], remove: [] },
    transactions: { add: [], remove: [] },
  },
  parentChildToEdit: {
    parentJobs: { add: [], remove: [] },
    childJobs: {},
  },
  isLoading: true,
  loadingMessage: undefined,
});

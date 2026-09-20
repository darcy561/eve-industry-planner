import {
  discard,
  forgetJob,
  setBase,
} from "../../Components/Edit Job/Edit Job Hooks/jobDraftStore.js";
import {
  buildSetIsLoadingActionPayload,
  normalizeSetIsLoadingPayload,
} from "../../Functions/Helper/setIsLoadingAction.js";
import { stateDefault } from "./stateDefault.js";

/**
 * Opening, following and leaving a job.
 *
 * @param {Function} set
 * @param {Function} get
 * @returns {Object}
 */
export const coreActions = (set, get) => ({
  /**
   * Opens the editor on a job, replacing whatever it held.
   *
   * @param {string} jobID
   * @param {object} document - The job as plain data
   */
  openJob: (jobID, document) => {
    set(
      (state) => ({
        editSession: {
          ...stateDefault(),
          draft: setBase(stateDefault().draft, jobID, document),
          activeJobID: jobID,
          isLoading: false,
          actions: state.editSession.actions,
        },
      }),
      false,
      "openEditJob",
    );
  },

  /**
   * Takes a document that has arrived for a job the editor is holding.
   *
   * The reader's own changes sit above it and re-apply, which is what lets an
   * open editor follow the document instead of keeping the copy it opened.
   *
   * @param {string} jobID
   * @param {object} document
   */
  documentArrived: (jobID, document) => {
    const { draft } = get().editSession;
    if (!draft.base[jobID]) return;
    set(
      (state) => ({
        editSession: {
          ...state.editSession,
          draft: setBase(state.editSession.draft, jobID, document),
        },
      }),
      false,
      "editJobDocumentArrived",
    );
  },

  /**
   * Drops what the reader changed, leaving them on the document as it stands.
   *
   * @param {string} [jobID] - Every job the session holds when omitted
   */
  discardChanges: (jobID) => {
    set(
      (state) => ({
        editSession: {
          ...state.editSession,
          draft: discard(state.editSession.draft, jobID),
          temporaryChildJobs: {},
          esiDataToLink: stateDefault().esiDataToLink,
          parentChildToEdit: stateDefault().parentChildToEdit,
        },
      }),
      false,
      "discardEditJobChanges",
    );
  },

  /** @param {string} jobID */
  forgetEditedJob: (jobID) => {
    set(
      (state) => ({
        editSession: {
          ...state.editSession,
          draft: forgetJob(state.editSession.draft, jobID),
          activeJobID:
            state.editSession.activeJobID === jobID
              ? null
              : state.editSession.activeJobID,
        },
      }),
      false,
      "forgetEditedJob",
    );
  },

  /** Empties the session, for leaving the page. */
  closeSession: () => {
    set(
      (state) => ({
        editSession: { ...stateDefault(), actions: state.editSession.actions },
      }),
      false,
      "closeEditJobSession",
    );
  },

  /**
   * @param {boolean|{isLoading: boolean, loadingMessage?: string}} isLoading
   * @param {string} [loadingMessage]
   */
  setIsLoading: (isLoading, loadingMessage) => {
    const next = normalizeSetIsLoadingPayload(
      typeof isLoading === "boolean"
        ? buildSetIsLoadingActionPayload(isLoading, loadingMessage)
        : isLoading,
    );
    set(
      (state) => ({
        editSession: {
          ...state.editSession,
          isLoading: next.isLoading,
          loadingMessage: next.isLoading ? next.loadingMessage : undefined,
        },
      }),
      false,
      "setEditJobIsLoading",
    );
  },
});

import useUsersStore from "../../../Zustand/usersStore";
import { draftFor, hasChanges } from "./jobDraftStore";
import { childJobIDsAfterEdits, parentJobIDsAfterEdits } from "./jobSelectors";

/**
 * Reads one part of the open job, and re-renders only when that part changes.
 *
 * @template T
 * @param {(document: object) => T} selector - What this component reads
 * @returns {T|undefined}
 */
export function useJobDraft(selector) {
  return useUsersStore((store) => {
    const { draft, activeJobID } = store.editSession;
    const document = draftFor(draft, activeJobID);
    if (!document) return undefined;

    return readOnce(selector, document);
  });
}

/**
 * What a control says the reader did: `run`, `askAbout`, the undo steps and the link intents.
 *
 * @returns {object} The edit session's actions
 */
export function useJobActions() {
  return useUsersStore((store) => store.editSession.actions);
}

/**
 * The parent links the reader has marked, to be written when the job closes.
 *
 * @returns {{add: Array<string>, remove: Array<string>}}
 */
export function useParentLinkIntents() {
  return useUsersStore(
    (store) => store.editSession.parentChildToEdit.parentJobs,
  );
}

/**
 * The child links the reader has marked under one material.
 *
 * @param {number|string} materialTypeID
 * @returns {{add: Array<string>, remove: Array<string>}|undefined}
 */
export function useChildLinkIntents(materialTypeID) {
  return useUsersStore(
    (store) => store.editSession.parentChildToEdit.childJobs[materialTypeID],
  );
}

/**
 * The parents this job will have once the links the reader marked are carried out.
 *
 * @returns {Array<string>}
 */
export function useParentJobIDs() {
  const parentJobs = useJobDraft((job) => job.parentJobs);
  const edits = useParentLinkIntents();
  return parentJobIDsAfterEdits(parentJobs, edits);
}

/**
 * The child jobs one material will have once those links are carried out.
 *
 * @param {number|string} materialTypeID
 * @returns {Array<string>}
 */
export function useMaterialChildJobIDs(materialTypeID) {
  const linked = useJobDraft((job) => job.build.childJobs[materialTypeID]);
  const edits = useChildLinkIntents(materialTypeID);
  return childJobIDsAfterEdits(linked, edits);
}

/**
 * The ESI rows of one kind the reader has marked to link or unlink when the job closes.
 *
 * @param {"industryJobs"|"marketOrders"|"transactions"} kind
 * @returns {{add: Array<*>, remove: Array<*>}}
 */
export function useEsiLinkIntents(kind) {
  return useUsersStore((store) => store.editSession.esiDataToLink[kind]);
}

/**
 * The job costed for a material to price its row, without committing to it.
 *
 * @param {number|string} materialTypeID
 * @returns {object|undefined}
 */
export function useSpeculativeChildJob(materialTypeID) {
  return useUsersStore(
    (store) => store.editSession.speculativeChildJobs[materialTypeID],
  );
}

/**
 * The child job built for a material and not yet saved, if there is one.
 *
 * @param {number|string} materialTypeID
 * @returns {object|undefined}
 */
export function useTemporaryChildJob(materialTypeID) {
  return useUsersStore(
    (store) => store.editSession.temporaryChildJobs[materialTypeID],
  );
}

/**
 * Whether the editor holds changes of the reader's, ones a save would write or ones set aside for
 * them to review; a question they asked does not count.
 *
 * @returns {boolean}
 */
export function useJobModified() {
  return useUsersStore(
    (store) =>
      hasChanges(store.editSession.draft) ||
      store.editSession.draft.held.length > 0,
  );
}

/**
 * Whether the session is still fetching what the job needs to be drawn.
 *
 * @returns {boolean}
 */
export function useSessionLoading() {
  return useUsersStore((store) => store.editSession.isLoading);
}

/**
 * What the page says while it is loading.
 *
 * @returns {string|undefined}
 */
export function useSessionLoadingMessage() {
  return useUsersStore((store) => store.editSession.loadingMessage);
}

/**
 * The open job as it stands, for a handler rather than a render.
 *
 * @returns {object|undefined} Plain data, or nothing when no job is open
 */
export function jobDraftNow() {
  const { draft, activeJobID } = useUsersStore.getState().editSession;
  return draftFor(draft, activeJobID);
}

/**
 * The selector's answer, having checked in development that it is an answer and not a new object
 * each time it is asked.
 *
 * @param {Function} selector
 * @param {object} document
 * @returns {*}
 */
function readOnce(selector, document) {
  const value = selector(document);
  if (import.meta.env.DEV && !Object.is(value, selector(document))) {
    throw new Error(
      "useJobDraft: the selector builds a new value each time it is asked, so " +
        "it subscribes this component to the whole job. Select a stored value " +
        "or a primitive and build what you need in the component.",
    );
  }
  return value;
}

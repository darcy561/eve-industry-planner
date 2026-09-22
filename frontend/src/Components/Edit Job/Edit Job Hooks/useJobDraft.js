import useUsersStore from "../../../Zustand/usersStore";
import { draftFor, hasChanges } from "./jobDraftStore";
import { childJobIDsAfterEdits, parentJobIDsAfterEdits } from "./jobSelectors";

/**
 * Reads one part of the open job, and re-renders only when that part changes.
 *
 * The selector is handed the draft as plain data, and what it returns is compared
 * by the store with `Object.is`.
 *
 * `undefined` comes back while no job is open — before the document arrives, and
 * again as the session is torn down under a panel still mounted. The selector is
 * not called in that window, so it can read the job's fields without guarding
 * each one.
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
 * What a control says the reader did: `run`, `askAbout`, the undo steps and the
 * link intents.
 *
 * One object for the life of the store — a command replaces the layers under it
 * and never the actions — so a panel taking its writes from here is not woken by
 * the edits it makes.
 *
 * @returns {object} The edit session's actions
 */
export function useJobActions() {
  return useUsersStore((store) => store.editSession.actions);
}

/**
 * The parent links the reader has marked, to be written when the job closes.
 *
 * Narrower than the intents it is part of, because the session holds the parent
 * and child links in one object and rebuilds it for either: a reader who only
 * cares about parents would be woken by every child link taken on or off.
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
 * Narrow for the same reason {@link useParentLinkIntents} is, and per material
 * as well: a link taken on under one material is nothing to a card for another.
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
 * The parents this job will have once the links the reader marked are carried
 * out.
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
 * The child job built for the material but not saved is left out, the same way
 * the session's own read of this leaves it out: this answers what the job is
 * made of, not what the reader has in hand.
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
 * The ESI rows of one kind the reader has marked to link or unlink when the job
 * closes.
 *
 * Per kind, because marking a market order says nothing to a reader of
 * transactions.
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
 * Whether the reader has changed anything that would be saved.
 *
 * A question they asked does not count, which is what lets a job be stepped back
 * and looked at without arming the save prompt.
 *
 * @returns {boolean}
 */
export function useJobModified() {
  return useUsersStore((store) => hasChanges(store.editSession.draft));
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
 * Read apart from the flag rather than with it: a pair would be a new object on
 * every read, which is what an equality-checked subscription cannot have.
 *
 * @returns {string|undefined}
 */
export function useSessionLoadingMessage() {
  return useUsersStore((store) => store.editSession.loadingMessage);
}

/**
 * The open job as it stands, for a handler rather than a render.
 *
 * A click reads what the job holds at the moment it is clicked, and subscribing
 * to the whole job to have it there would re-render the control on every edit.
 *
 * @returns {object|undefined} Plain data, or nothing when no job is open
 */
export function jobDraftNow() {
  const { draft, activeJobID } = useUsersStore.getState().editSession;
  return draftFor(draft, activeJobID);
}

/**
 * The selector's answer, having checked in development that it is an answer and
 * not a new object each time it is asked.
 *
 * A selector building its result — `Object.values(...)`, a `map`, an object
 * literal — subscribes the component to the whole job while looking correct:
 * nothing on screen differs and the mutator suites pass either way. Left to the
 * store it is worse than useless, because React reads the value more than once
 * per render and a value that never settles loops.
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

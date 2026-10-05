import {
  esiJobIDs,
  esiOrderIDs,
  esiTransactionIDs,
} from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { USER_JOBS_COLLECTION } from "../../DocumentLock/documentLockCollections.js";
import { selectDocumentLockReadOnly } from "../../DocumentLock/documentLockSelectors.js";
import { revisionOf } from "../sync/jobDelta.js";
import { requestJobDocumentsByIdsFromApi } from "../../Endpoints/Private/requestJobDocumentsByIds.js";
import saveArchivedJobs from "../../Endpoints/Private/archivedJobs.js";
import { saveUserAccountDocument } from "../../Endpoints/Private/userDocument";
import { saveJobsAsOneChange } from "../sync/saveJobsViaApi.js";
import { restoreSavedJobs } from "../sync/persistJobDocumentsToApi.js";
import { flushPendingJobDocumentsSave } from "../../Debounce/jobDocumentsPersistSchedule.js";
import {
  showSnackbarError,
  showSnackbarWarning,
} from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";

/** Why a job stopped a change built from jobs read off the server. */
export const JOB_MOVED = {
  EDITED: "edited",
  GONE: "gone",
  HELD: "held",
};

/** How each reason a job stopped a change reads to the reader. */
export const JOB_MOVED_LABELS = {
  [JOB_MOVED.EDITED]: "Edited since you selected it",
  [JOB_MOVED.GONE]: "Removed",
  [JOB_MOVED.HELD]: "Open for editing elsewhere",
};

const REFUSED_BECAUSE = {
  locked: "another member is editing a job it touches",
  conflict: "a job was saved elsewhere since it was read. Try again",
  failed: "it could not be saved. Try again",
};

/**
 * The warning for a change that touched nothing: the jobs that moved where they are known, otherwise
 * why the server refused it.
 *
 * @param {string} action - What was not done, as "merged", "deleted", "archived" or "saved"
 * @param {{moved?: Array<{name: string, reason: string}>, outcome?: string, because?: string}} why
 * @returns {string}
 */
export function nothingChangedMessage(
  action,
  { moved = [], outcome, because },
) {
  const named = moved
    .map((row) => `${row.name}: ${JOB_MOVED_LABELS[row.reason].toLowerCase()}`)
    .join("; ");
  if (named) return `Nothing was ${action}. ${named}.`;
  return `Nothing was ${action}: ${because ?? REFUSED_BECAUSE[outcome] ?? REFUSED_BECAUSE.failed}.`;
}

/**
 * Sends the reader's queue and reads the jobs a change is built from, saying so when they could not
 * be read; answers null then, or what was read and which of it is open elsewhere.
 *
 * @param {Array<string>} selectedIDs
 * @param {string} action - What the change does, as "merged" or "deleted"
 * @returns {Promise<{read: Array<object>, held: Array<object>} | null>}
 */
export async function readJobsForAChange(selectedIDs, action) {
  try {
    await flushPendingJobDocumentsSave();
    const read = await readJobsAndTheirLinks(selectedIDs);
    return { read, held: jobsOpenElsewhere(useUsersStore.getState(), read) };
  } catch (err) {
    console.error("The jobs a change is built from could not be read", err);
    showSnackbarError(
      `The jobs could not be read, so nothing was ${action}.`,
      5,
    );
    return null;
  }
}

/**
 * Sends a change built from jobs read off the server; a refused one puts back what was read, takes
 * out what it created, and answers which jobs moved where that is why.
 *
 * @param {{read: Array<object>, jobs: Array<object>, removed: Array<object>, created?: Array<string>}} change
 * @returns {Promise<{landed: boolean, moved: Array<object> | null}>}
 */
export async function sendChangeFromRead({
  read,
  jobs,
  removed,
  created = [],
}) {
  const outcome = await saveJobsAsOneChange(jobs, undefined, removed);
  if (outcome === "saved") return { landed: true, moved: null };
  await restoreSavedJobs(
    read.map((job) => job.jobID),
    created,
  );
  const moved =
    outcome === "conflict" || outcome === "locked"
      ? whatMovedSinceRead(useUsersStore.getState(), read)
      : null;
  return { landed: false, moved };
}

/**
 * Reads the selected jobs and every job they link to as the server holds them now, and puts them on
 * the planner, dropping selected jobs that no longer exist.
 *
 * @param {Array<string>} selectedIDs
 * @returns {Promise<Array<object>>} Every job read
 */
export async function readJobsAndTheirLinks(selectedIDs) {
  const selected = await requestJobDocumentsByIdsFromApi(selectedIDs);
  const linked = new Set();
  for (const job of selected) {
    for (const id of job.parentJobs ?? []) linked.add(id);
    for (const ids of Object.values(job.build?.childJobs ?? {})) {
      for (const id of ids) linked.add(id);
    }
  }
  for (const id of selectedIDs) linked.delete(id);
  const neighbours =
    linked.size > 0 ? await requestJobDocumentsByIdsFromApi([...linked]) : [];

  const { actions } = useUsersStore.getState().jobData;
  const read = [...selected, ...neighbours];
  actions.updateOrAddJobsToJobArray(read);
  const found = new Set(selected.map((job) => job.jobID));
  const gone = selectedIDs.filter((id) => !found.has(id));
  if (gone.length > 0) actions.removeJobsFromJobArray(gone);
  return read;
}

/**
 * The jobs a change touches that another session holds open for editing.
 *
 * @param {*} state - Root store state
 * @param {Array<object>} jobs
 * @returns {Array<{jobID: string, name: string, reason: string}>}
 */
export function jobsOpenElsewhere(state, jobs) {
  return jobs
    .filter((job) =>
      selectDocumentLockReadOnly(state, USER_JOBS_COLLECTION, job.jobID),
    )
    .map((job) => ({
      jobID: job.jobID,
      name: job.name,
      reason: JOB_MOVED.HELD,
    }));
}

/**
 * The jobs a refused change read that have since been edited, removed or opened elsewhere, judged
 * against the jobs now held on the planner.
 *
 * @param {*} state - Root store state
 * @param {Array<object>} read - The jobs as the merge read them
 * @returns {Array<{jobID: string, name: string, reason: string}>}
 */
export function whatMovedSinceRead(state, read) {
  const { findJobInJobArray } = state.jobData.actions;
  const moved = [];
  for (const job of read) {
    const current = findJobInJobArray(job.jobID);
    let reason = null;
    if (!current) reason = JOB_MOVED.GONE;
    else if (selectDocumentLockReadOnly(state, USER_JOBS_COLLECTION, job.jobID))
      reason = JOB_MOVED.HELD;
    else if (revisionOf(current) !== revisionOf(job)) reason = JOB_MOVED.EDITED;
    if (reason) moved.push({ jobID: job.jobID, name: job.name, reason });
  }
  return moved;
}

/**
 * Moves jobs off the planner into the archive on the server, saying why when none of them moved.
 *
 * @param {Array<object>} jobs - Each carrying the revision it was read at
 * @returns {Promise<boolean>} Whether the jobs moved
 */
export async function archiveJobsOnServer(jobs) {
  const outcome = await saveArchivedJobs(jobs);
  if (outcome === "saved") return true;
  showSnackbarError(nothingChangedMessage("archived", { outcome }), 5);
  return false;
}

/**
 * Releases the ESI records jobs that left the planner had linked, saving the account when signed in
 * and warning when it could not be saved.
 *
 * @param {Array<object>} jobs - The jobs that left the planner
 * @param {string} action - How they left, as "merged", "deleted" or "archived"
 */
export async function releaseEsiLinksOf(jobs, action) {
  const ordersToRemove = new Set();
  const jobsToRemove = new Set();
  const transactionsToRemove = new Set();
  for (const job of jobs) {
    for (const id of esiOrderIDs(job)) ordersToRemove.add(id);
    for (const id of esiJobIDs(job)) jobsToRemove.add(id);
    for (const id of esiTransactionIDs(job)) transactionsToRemove.add(id);
  }
  if (
    ordersToRemove.size + jobsToRemove.size + transactionsToRemove.size ===
    0
  ) {
    return;
  }
  const { account } = useUsersStore.getState();
  account.actions.addLinkedEsiData({
    ordersToRemove,
    jobsToRemove,
    transactionsToRemove,
  });
  if (account.isLoggedIn && !(await saveUserAccountDocument())) {
    showSnackbarWarning(
      `The jobs were ${action}, but the ESI records they linked could not be released. Reload to try again.`,
      8,
    );
  }
}

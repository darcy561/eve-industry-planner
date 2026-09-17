import {
  applyPlannerJobDocuments,
  fetchPlannerJobDocuments,
  USER_JOB_DOCUMENTS_COLLECTION,
} from "../Endpoints/Private/jobDocuments.js";
import {
  applyJobGroups,
  fetchJobGroups,
  USER_JOB_GROUPS_COLLECTION,
} from "../Endpoints/Private/groups.js";
import { activePlannerOwnerHandle } from "../../Zustand/activePlanner/read.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Counts loads rather than comparing planners, because switching away and back
 * arrives at the same planner: two loads for one owner are both wanted by the
 * owner check and the slower one would land last, carrying the older answer.
 */
let generation = 0;

/**
 * Loads a planner's own documents — its jobs and its groups — into the job store.
 *
 * The store holds one planner at a time, so until this has run the app is showing
 * whichever planner it last loaded. Both answers are held until both have arrived
 * and then written together, so the store never pairs one load's jobs with
 * another's groups; a load overtaken while it was in flight writes nothing.
 *
 * @param {string} [owner] - owner handle to load, the active planner by default
 * @returns {Promise<boolean>} false when the answer was discarded
 */
export async function loadPlannerDocuments(owner) {
  const forOwner = owner ?? activePlannerOwnerHandle();
  if (!forOwner) return false;

  generation += 1;
  const thisLoad = generation;

  const [plannerJobs, groups] = await Promise.all([
    fetchPlannerJobDocuments(),
    fetchJobGroups(),
  ]);

  if (thisLoad !== generation) return false;
  if (activePlannerOwnerHandle() !== forOwner) return false;

  applyPlannerJobDocuments(plannerJobs, forOwner);
  applyJobGroups(groups, forOwner);
  // The arrays now hold a snapshot the stream knows nothing about, so what it had
  // applied for these collections describes documents that are no longer there.
  const ws = useUsersStore.getState().websocketSync.actions;
  ws.forgetCollection(USER_JOB_DOCUMENTS_COLLECTION);
  ws.forgetCollection(USER_JOB_GROUPS_COLLECTION);
  return true;
}

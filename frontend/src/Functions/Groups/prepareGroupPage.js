import useUsersStore from "../../Zustand/usersStore";
import { loadAllRelatedJobs } from "../Helper/getAllRelatedJobs";
import getMissingESIData from "../Shared/getMissingESIData";

/**
 * Loads everything the group page draws, before the page is shown.
 *
 * A group's members are only the roots of the walk: a child job is not obliged to be in
 * the same group as its parent, and one left out costs nothing to fetch beside the rest
 * rather than leaving a cost the page cannot work out. Prices and system indexes follow
 * from whatever that walk reaches.
 *
 * It belongs to the route rather than the page so the reader waits on the router's
 * pending screen and the page paints once, with its figures already right. A loader
 * also runs on a hover, so this fetches and caches and changes nothing else: what a
 * reader has selected on the planner is theirs until they arrive.
 *
 * @param {string} groupID
 * @returns {Promise<Object|null>} The group, or null when the planner has no such group.
 */
export async function prepareGroupPage(groupID) {
  const { actions } = useUsersStore.getState().jobData;
  const group = actions.getGroupObject(groupID);
  if (!group) return null;

  const groupJobs = await loadAllRelatedJobs(group.liveMemberIDs);
  const { requestedSystemIndexes } = await getMissingESIData(groupJobs);

  useUsersStore
    .getState()
    .worldData.actions.addSystemIndex(requestedSystemIndexes);

  return group;
}

import { AppEvent } from "../../../analytics/appEventNames";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import useUsersStore from "../../../Zustand/usersStore";

/**
 * Builds shopping list input jobs from mixed job/group ids.
 *
 * @param {Array<string>} inputJobIDs
 * @returns {Promise<Array>}
 */
export async function buildShoppingList(inputJobIDs) {
  const requestedJobObjects = await useUsersStore
    .getState()
    .jobData.actions.resolveJobObjectsForMixedSelection(inputJobIDs);

  trackAppEvent(
    AppEvent.BUILD_SHOPPING_LIST,
    Math.max(1, requestedJobObjects.length)
  );

  return requestedJobObjects;
}

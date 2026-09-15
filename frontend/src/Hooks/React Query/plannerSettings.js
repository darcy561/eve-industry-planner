import { useQuery } from "@tanstack/react-query";
import useUsersStore from "../../Zustand/usersStore.js";
import { extrasCategoriesDefault } from "../../Context/defaultValues";
import {
  PLANNER_SETTINGS_QUERY_KEY_ROOT,
  plannerQueryScope,
} from "./Backend/plannerQueryScope.js";

/**
 * The extras categories the active planner offers, deleted ones included.
 *
 * A planner whose settings have not been read yet answers the defaults, so a
 * picker has a usable list from the first frame. `isHeld` says which of the two
 * it answered: the defaults cannot be edited, because saving them would replace
 * the planner's stored list with them.
 *
 * @returns {{categories: {id: string, label: string, deleted?: boolean, deletedAt?: string|null}[], isHeld: boolean}}
 */
export function usePlannerExtrasCategories() {
  const owner = useUsersStore((state) =>
    state.activePlanner.actions.getActivePlannerOwner(),
  );
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  useQuery({
    queryKey: plannerQueryScope(PLANNER_SETTINGS_QUERY_KEY_ROOT),
    queryFn: async () => {
      const settings = await useUsersStore
        .getState()
        .plannerSettings.actions.loadPlannerSettings(owner);
      // A resolved query must carry something; the settings live in the store.
      return settings ?? null;
    },
    enabled: Boolean(owner) && isLoggedIn,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Selected straight off the held entry rather than through the accessor: the
  // accessor builds a fresh defaults object per call, and a selector answering a
  // new reference every time re-renders on every store change.
  const held = useUsersStore(
    (state) => state.plannerSettings.byOwner[owner ?? ""]?.extrasCategories,
  );
  return {
    categories: held ?? extrasCategoriesDefault,
    isHeld: Boolean(held),
  };
}

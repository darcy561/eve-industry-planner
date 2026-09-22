import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { extrasCategoriesDefault } from "../../Context/defaultValues";
import {
  PLANNER_SETTINGS_QUERY_KEY_ROOT,
  plannerOwnerQueryScope,
  plannerQueryScope,
} from "./Backend/plannerQueryScope.js";

/**
 * Reads the settings of planners the reader is not working in.
 *
 * The markets an organisation shares are edited from the settings page, and a
 * write needs that organisation's own lane to apply a change to — which means
 * holding its settings whether or not it is the planner currently open.
 *
 * One entry per owner, so a planner read for one surface is not read again for
 * the next, and an owner whose read fails is a failure against that owner rather
 * than a hole in the set.
 *
 * @param {Array<string>} ownerHandles
 * @returns {{isLoading: boolean}}
 */
export function usePlannerSettingsForOwners(ownerHandles) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const wanted = useMemo(
    () => [...new Set(ownerHandles?.filter(Boolean) ?? [])].sort(),
    [ownerHandles],
  );

  return useQueries({
    queries: wanted.map((owner) => ({
      queryKey: plannerOwnerQueryScope(PLANNER_SETTINGS_QUERY_KEY_ROOT, owner),
      queryFn: async () => {
        const settings = await useUsersStore
          .getState()
          .plannerSettings.actions.loadPlannerSettings(owner);
        // A resolved query must carry something; the settings live in the store.
        return settings ?? null;
      },
      enabled: isLoggedIn,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
    }),
  });
}

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

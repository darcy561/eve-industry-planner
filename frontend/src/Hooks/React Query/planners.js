import { useQuery } from "@tanstack/react-query";
import { fetchPlannersFromApi } from "../../Functions/Endpoints/Private/planners.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { entityIDFromOwnerHandle } from "../../Functions/Helper/ownerHandle.js";

export const PLANNERS_QUERY_KEY = ["planners"];

/**
 * What to show for a planner the server has not named.
 *
 * @param {{owner: string, kind: string, name: string, named: boolean}} planner
 * @returns {string}
 */
export function plannerDisplayName(planner) {
  if (planner.name) return planner.name;

  if (planner.kind === "corporation") {
    const id = entityIDFromOwnerHandle(planner.owner);
    const corporation = useUsersStore
      .getState()
      .account.actions.getCorporation(id);
    if (corporation?.corporationName) return corporation.corporationName;
    return "Corporation";
  }
  if (planner.kind === "alliance") {
    const id = entityIDFromOwnerHandle(planner.owner);
    const alliance = useUsersStore.getState().account.actions.getAlliance(id);
    if (alliance?.allianceName) return alliance.allianceName;
    return "Alliance";
  }
  return "My planner";
}

/** Base options for the planners listing. */
export function plannersQueryOptions() {
  return {
    queryKey: PLANNERS_QUERY_KEY,
    queryFn: fetchPlannersFromApi,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  };
}

/**
 * Every planner the account may work in, with a name to show for each.
 *
 * @param {{enabled?: boolean}} [options]
 */
export function usePlannersQuery({ enabled = true } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  return useQuery({
    ...plannersQueryOptions(),
    enabled: enabled && isLoggedIn,
  });
}

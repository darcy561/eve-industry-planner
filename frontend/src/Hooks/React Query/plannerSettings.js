import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  defaultPlannerReprocessingSettings,
  extrasCategoriesDefault,
} from "../../Context/defaultValues";
import {
  PLANNER_SETTINGS_QUERY_KEY_ROOT,
  plannerOwnerQueryScope,
  plannerQueryScope,
} from "./Backend/plannerQueryScope.js";

/**
 * Reads and holds the settings of each named planner, one query per owner, whether or not it is
 * the planner open.
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
 * One of the active planner's settings once read, else the fallback; `isHeld` says which, since the
 * fallback is not the planner's and cannot be edited.
 *
 * @template T
 * @param {string} field - a key of the planner's settings
 * @param {T} fallback
 * @returns {{value: T, isHeld: boolean, owner: string|null}}
 */
export function usePlannerSetting(field, fallback) {
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
      return settings ?? null;
    },
    enabled: Boolean(owner) && isLoggedIn,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const held = useUsersStore(
    (state) => state.plannerSettings.byOwner[owner ?? ""]?.[field],
  );
  return { value: held ?? fallback, isHeld: Boolean(held), owner };
}

/**
 * The extras categories the active planner offers, deleted ones included, or the defaults until its
 * settings are read.
 *
 * @returns {{categories: {id: string, label: string, deleted?: boolean, deletedAt?: string|null}[], isHeld: boolean}}
 */
export function usePlannerExtrasCategories() {
  const { value, isHeld } = usePlannerSetting(
    "extrasCategories",
    extrasCategoriesDefault,
  );
  return { categories: value, isHeld };
}

const reprocessingSettingsDefault = defaultPlannerReprocessingSettings();

/**
 * The active planner's reprocessing settings, or the defaults until its settings are read.
 *
 * @returns {{settings: ReturnType<typeof defaultPlannerReprocessingSettings>, isHeld: boolean,
 *   owner: string|null}}
 */
export function usePlannerReprocessingSettings() {
  const { value, isHeld, owner } = usePlannerSetting(
    "reprocessingSettings",
    reprocessingSettingsDefault,
  );
  return { settings: value, isHeld, owner };
}

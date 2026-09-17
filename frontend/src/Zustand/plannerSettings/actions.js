/**
 * Planner settings actions: reading a planner's settings and holding them per
 * owner.
 */

import {
  fetchPlannerSettingsFromApi,
  savePlannerSettingsToApi,
} from "../../Functions/Endpoints/Private/planners.js";
import { permanentExtrasCategories } from "../../Context/defaultValues";
import {
  mergePlannerSettings,
  plannerSettingsDefault,
  stateDefault,
} from "./core.js";

export const plannerSettingsActions = (set, get) => ({
  /**
   * The settings held for one planner, or the defaults when none are.
   *
   * @param {string} ownerHandle
   * @returns {object}
   */
  getPlannerSettings: (ownerHandle) =>
    get().plannerSettings.byOwner[ownerHandle] ?? plannerSettingsDefault(),

  /**
   * Whether the planner has settings of its own rather than falling back.
   *
   * @param {string} ownerHandle
   * @returns {boolean}
   */
  isPlannerSeeded: (ownerHandle) =>
    get().plannerSettings.seededByOwner[ownerHandle] ?? false,

  /**
   * Adds a category to the planner's list.
   *
   * @param {string} ownerHandle
   * @param {{id: string, label: string}} category
   */
  addPlannerExtrasCategory: (ownerHandle, category) => {
    // The same rule the server holds the list to: a category with no id or no
    // label cannot be shown, and would have the whole write refused.
    if (!category?.id || !category.label?.trim()) return;
    get().plannerSettings.actions.writePlannerExtrasCategories(
      ownerHandle,
      (categories) => [
        ...categories,
        { ...category, deleted: false, deletedAt: null },
      ],
    );
  },

  /**
   * Marks a category deleted, or brings it back.
   *
   * A category is marked rather than removed because costs already filed under
   * it name it by id, and the two permanent categories cannot be marked at all.
   *
   * @param {string} ownerHandle
   * @param {string} categoryID
   * @param {boolean} deleted
   */
  setPlannerExtrasCategoryDeleted: (ownerHandle, categoryID, deleted) => {
    if (permanentExtrasCategories.has(categoryID)) return;
    get().plannerSettings.actions.writePlannerExtrasCategories(
      ownerHandle,
      (categories) =>
        categories.map((entry) =>
          entry.id === categoryID
            ? {
                ...entry,
                deleted,
                deletedAt: deleted ? new Date().toISOString() : null,
              }
            : entry,
        ),
    );
  },

  /**
   * Applies a change to one planner's categories. The caller schedules the
   * write, as the account's own settings do.
   *
   * @param {string} ownerHandle
   * @param {(categories: object[]) => object[]} change
   */
  writePlannerExtrasCategories: (ownerHandle, change) => {
    if (!ownerHandle) return;
    // Only a planner whose settings have arrived: editing the fallback defaults
    // and saving them would replace the planner's stored list with them.
    const settings = get().plannerSettings.byOwner[ownerHandle];
    if (!settings) return;
    const next = change(settings.extrasCategories ?? []);
    set(
      (state) => ({
        ...state,
        plannerSettings: {
          ...state.plannerSettings,
          byOwner: {
            ...state.plannerSettings.byOwner,
            [ownerHandle]: { ...settings, extrasCategories: next },
          },
          unsavedByOwner: {
            ...state.plannerSettings.unsavedByOwner,
            [ownerHandle]: true,
          },
          actions: state.plannerSettings.actions,
        },
      }),
      false,
      "plannerSettings/writePlannerExtrasCategories",
    );
  },

  /**
   * Writes one planner's extras categories to the API and holds what came back.
   *
   * @param {string} ownerHandle
   * @returns {Promise<void>}
   */
  savePlannerExtrasCategories: async (ownerHandle) => {
    if (!ownerHandle || !get().account.isLoggedIn) return;
    // Held settings only, for the reason writePlannerExtrasCategories refuses
    // the same case: the fallback defaults are not this planner's list, and
    // sending them would replace it.
    const settings = get().plannerSettings.byOwner[ownerHandle];
    if (!settings) return;
    const response = await savePlannerSettingsToApi(ownerHandle, {
      extrasCategories: settings.extrasCategories ?? [],
    });
    // Marked saved only once the server has it: a failed write leaves the edit
    // held and still ahead of the stored settings, which is what stops a later
    // read replacing it with what was never changed.
    get().plannerSettings.actions.markPlannerSettingsSaved(ownerHandle);
    get().plannerSettings.actions.setPlannerSettings(
      ownerHandle,
      response?.settings,
      response?.seeded,
    );
  },

  /**
   * Whether a planner holds an edit the server has not taken yet.
   *
   * @param {string} ownerHandle
   * @returns {boolean}
   */
  hasUnsavedPlannerSettings: (ownerHandle) =>
    get().plannerSettings.unsavedByOwner[ownerHandle] ?? false,

  /** @param {string} ownerHandle */
  markPlannerSettingsSaved: (ownerHandle) => {
    if (!get().plannerSettings.unsavedByOwner[ownerHandle]) return;
    set(
      (state) => {
        const unsavedByOwner = { ...state.plannerSettings.unsavedByOwner };
        delete unsavedByOwner[ownerHandle];
        return {
          ...state,
          plannerSettings: {
            ...state.plannerSettings,
            unsavedByOwner,
            actions: state.plannerSettings.actions,
          },
        };
      },
      false,
      "plannerSettings/markPlannerSettingsSaved",
    );
  },

  /**
   * @param {string} ownerHandle
   * @param {object} settings - the `settings` object from the API
   * @param {boolean} seeded
   */
  setPlannerSettings: (ownerHandle, settings, seeded) => {
    if (!ownerHandle) return;
    set(
      (state) => ({
        ...state,
        plannerSettings: {
          ...state.plannerSettings,
          byOwner: {
            ...state.plannerSettings.byOwner,
            [ownerHandle]: mergePlannerSettings(settings),
          },
          seededByOwner: {
            ...state.plannerSettings.seededByOwner,
            [ownerHandle]: !!seeded,
          },
          actions: state.plannerSettings.actions,
        },
      }),
      false,
      "plannerSettings/setPlannerSettings",
    );
  },

  /**
   * Drops one planner's settings, so it falls back to the defaults again.
   *
   * For a settings document that no longer exists. An edit still on its way to
   * the server is left alone for the same reason a read is: it is ahead of what
   * the server holds, and the save that follows will recreate the document.
   *
   * @param {string} ownerHandle
   */
  clearPlannerSettings: (ownerHandle) => {
    if (!ownerHandle) return;
    if (get().plannerSettings.actions.hasUnsavedPlannerSettings(ownerHandle)) {
      return;
    }
    set(
      (state) => {
        const byOwner = { ...state.plannerSettings.byOwner };
        const seededByOwner = { ...state.plannerSettings.seededByOwner };
        delete byOwner[ownerHandle];
        delete seededByOwner[ownerHandle];
        return {
          ...state,
          plannerSettings: {
            ...state.plannerSettings,
            byOwner,
            seededByOwner,
            actions: state.plannerSettings.actions,
          },
        };
      },
      false,
      "plannerSettings/clearPlannerSettings",
    );
  },

  /**
   * Reads one planner's settings from the API and holds them.
   *
   * @param {string} ownerHandle
   * @returns {Promise<object|null>} the merged settings, or null with nobody signed in
   */
  loadPlannerSettings: async (ownerHandle) => {
    if (!ownerHandle) return null;
    // The planner works signed out on default settings, and a private request
    // from a signed-out user can redirect the page into a login flow.
    if (!get().account.isLoggedIn) return null;
    const response = await fetchPlannerSettingsFromApi(ownerHandle);
    // An edit still on its way to the server is ahead of what this read
    // returned, so the read is dropped rather than applied over it.
    if (!get().plannerSettings.actions.hasUnsavedPlannerSettings(ownerHandle)) {
      get().plannerSettings.actions.setPlannerSettings(
        ownerHandle,
        response?.settings,
        response?.seeded,
      );
    }
    return get().plannerSettings.byOwner[ownerHandle] ?? null;
  },

  /** Drops every planner's settings, for a sign-out. */
  resetPlannerSettingsStore: () => {
    set(
      (state) => ({
        ...state,
        plannerSettings: {
          ...stateDefault(),
          actions: state.plannerSettings.actions,
        },
      }),
      false,
      "resetPlannerSettingsStore",
    );
  },
});

import {
  fetchPlannerSettingsFromApi,
  savePlannerSettingsToApi,
} from "../../Functions/Endpoints/Private/planners.js";
import { permanentExtrasCategories } from "../../Context/defaultValues";
import { refreshMarketLocationsAfterWrite } from "../../Functions/MarketData/registry/marketLocations";
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
    if (!category?.id || !category.label?.trim()) return;
    get().plannerSettings.actions.writePlannerSetting(
      ownerHandle,
      "extrasCategories",
      (categories) => [
        ...(categories ?? []),
        { ...category, deleted: false, deletedAt: null },
      ],
    );
  },

  /**
   * Marks a category deleted, or brings it back; a filed cost names it by id, and the two
   * permanent categories cannot be marked at all.
   *
   * @param {string} ownerHandle
   * @param {string} categoryID
   * @param {boolean} deleted
   */
  setPlannerExtrasCategoryDeleted: (ownerHandle, categoryID, deleted) => {
    if (permanentExtrasCategories.has(categoryID)) return;
    get().plannerSettings.actions.writePlannerSetting(
      ownerHandle,
      "extrasCategories",
      (categories) =>
        (categories ?? []).map((entry) =>
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
   * Changes the markets an organisation has saved, through the same transforms the account's own
   * markets go through.
   *
   * @param {string} ownerHandle
   * @param {(lane: object[]) => object[]} change - from `marketWriter`
   */
  writePlannerMarketLocations: (ownerHandle, change) => {
    get().plannerSettings.actions.writePlannerSetting(
      ownerHandle,
      "marketLocations",
      (lane) => change(lane ?? []),
    );
  },

  /**
   * Replaces a planner's reprocessing settings.
   *
   * @param {string} ownerHandle
   * @param {ReturnType<typeof import("../../Context/defaultValues").defaultPlannerReprocessingSettings>} settings
   */
  writePlannerReprocessingSettings: (ownerHandle, settings) => {
    get().plannerSettings.actions.writePlannerSetting(
      ownerHandle,
      "reprocessingSettings",
      () => settings,
    );
  },

  /**
   * Applies a change to one of a held planner's settings and records the field for the save, which
   * the caller schedules.
   *
   * @param {string} ownerHandle
   * @param {string} field - a key of `planner.SettingsUpdate`
   * @param {(held: any) => any} change
   */
  writePlannerSetting: (ownerHandle, field, change) => {
    if (!ownerHandle || !field) return;
    const settings = get().plannerSettings.byOwner[ownerHandle];
    if (!settings) return;
    const next = change(settings[field]);
    set(
      (state) => ({
        plannerSettings: {
          ...state.plannerSettings,
          byOwner: {
            ...state.plannerSettings.byOwner,
            [ownerHandle]: { ...settings, [field]: next },
          },
          unsavedByOwner: {
            ...state.plannerSettings.unsavedByOwner,
            [ownerHandle]: withField(
              state.plannerSettings.unsavedByOwner[ownerHandle],
              field,
            ),
          },
        },
      }),
      false,
      `plannerSettings/writePlannerSetting/${field}`,
    );
  },

  /**
   * Writes the fields this session edited on one planner to the API and holds what came back,
   * leaving every other field as another member stored it.
   *
   * @param {string} ownerHandle
   * @returns {Promise<void>}
   */
  savePlannerSettings: async (ownerHandle) => {
    if (!ownerHandle || !get().account.isLoggedIn) return;
    const settings = get().plannerSettings.byOwner[ownerHandle];
    if (!settings) return;

    const edited = get().plannerSettings.unsavedByOwner[ownerHandle] ?? [];
    if (edited.length === 0) return;
    const update = Object.fromEntries(
      edited.map((field) => [field, settings[field]]),
    );

    const response = await savePlannerSettingsToApi(ownerHandle, update);
    get().plannerSettings.actions.markPlannerSettingsSaved(ownerHandle);
    get().plannerSettings.actions.setPlannerSettings(
      ownerHandle,
      response?.settings,
      response?.seeded,
    );
    await refreshMarketLocationsAfterWrite();
  },

  /**
   * Whether a planner holds an edit the server has not taken yet.
   *
   * @param {string} ownerHandle
   * @returns {boolean}
   */
  hasUnsavedPlannerSettings: (ownerHandle) =>
    (get().plannerSettings.unsavedByOwner[ownerHandle] ?? []).length > 0,

  /** @param {string} ownerHandle */
  markPlannerSettingsSaved: (ownerHandle) => {
    if (!get().plannerSettings.actions.hasUnsavedPlannerSettings(ownerHandle)) {
      return;
    }
    set(
      (state) => {
        const unsavedByOwner = { ...state.plannerSettings.unsavedByOwner };
        delete unsavedByOwner[ownerHandle];
        return {
          plannerSettings: {
            ...state.plannerSettings,
            unsavedByOwner,
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
        },
      }),
      false,
      "plannerSettings/setPlannerSettings",
    );
  },

  /**
   * Drops one planner's settings so it falls back to the defaults, unless it holds an edit still on
   * its way to the server.
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
          plannerSettings: {
            ...state.plannerSettings,
            byOwner,
            seededByOwner,
          },
        };
      },
      false,
      "plannerSettings/clearPlannerSettings",
    );
  },

  /**
   * Reads one planner's settings from the API and holds them, unless an unsaved edit is ahead of
   * what the read returned.
   *
   * @param {string} ownerHandle
   * @returns {Promise<object|null>} the merged settings, or null with nobody signed in
   */
  loadPlannerSettings: async (ownerHandle) => {
    if (!ownerHandle) return null;
    if (!get().account.isLoggedIn) return null;
    const response = await fetchPlannerSettingsFromApi(ownerHandle);
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

/** The edited fields, with one more named. Order is the order they were first edited. */
function withField(edited, field) {
  const held = edited ?? [];
  return held.includes(field) ? held : [...held, field];
}

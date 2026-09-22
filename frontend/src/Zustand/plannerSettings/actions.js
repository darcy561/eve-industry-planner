/**
 * Planner settings actions: reading a planner's settings and holding them per
 * owner.
 */

import {
  fetchPlannerSettingsFromApi,
  savePlannerSettingsToApi,
} from "../../Functions/Endpoints/Private/planners.js";
import { permanentExtrasCategories } from "../../Context/defaultValues";
import { refreshMarketLocationsAfterWrite } from "../../Functions/MarketData/marketLocations.js";
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
   * Changes the markets an organisation has saved.
   *
   * The same transforms the account's own markets go through, so a market
   * behaves the same whoever saved it — what differs is only which document it
   * lands on and that an organisation's may be shared with its members.
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
   * Applies a change to one of a planner's settings. The caller schedules the
   * write, as the account's own settings do.
   *
   * The field is named rather than one action per setting, because the save is
   * field-scoped: what is recorded here is what the save sends, and a setting
   * this member never touched is left for whoever did touch it.
   *
   * @param {string} ownerHandle
   * @param {string} field - a key of `planner.SettingsUpdate`
   * @param {(held: any) => any} change
   */
  writePlannerSetting: (ownerHandle, field, change) => {
    if (!ownerHandle || !field) return;
    // Only a planner whose settings have arrived: editing the fallback defaults
    // and saving them would replace the planner's stored ones with them.
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
   * Writes one planner's edited settings to the API and holds what came back.
   *
   * Only the settings this session edited: the endpoint leaves a field it is not
   * sent as it is stored, so a member who changed the markets does not carry
   * their copy of another member's categories back over it.
   *
   * @param {string} ownerHandle
   * @returns {Promise<void>}
   */
  savePlannerSettings: async (ownerHandle) => {
    if (!ownerHandle || !get().account.isLoggedIn) return;
    // Held settings only, for the reason writePlannerSetting refuses the same
    // case: the fallback defaults are not this planner's, and sending them
    // would replace what it has stored.
    const settings = get().plannerSettings.byOwner[ownerHandle];
    if (!settings) return;

    const edited = get().plannerSettings.unsavedByOwner[ownerHandle] ?? [];
    if (edited.length === 0) return;
    const update = Object.fromEntries(
      edited.map((field) => [field, settings[field]]),
    );

    const response = await savePlannerSettingsToApi(ownerHandle, update);
    // Marked saved only once the server has it: a failed write leaves the edit
    // held and still ahead of the stored settings, which is what stops a later
    // read replacing it with what was never changed.
    get().plannerSettings.actions.markPlannerSettingsSaved(ownerHandle);
    get().plannerSettings.actions.setPlannerSettings(
      ownerHandle,
      response?.settings,
      response?.seeded,
    );
    // The composed markets are derived from this document too, and an
    // organisation's are shared with every member rather than only this reader.
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

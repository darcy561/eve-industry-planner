/**
 * Planner settings state — aligned with Go `planner.Settings` JSON.
 *
 * Held per owner handle: the archive and the switcher both reach planners that
 * are not the active one.
 */

import {
  DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  extrasCategoriesDefault,
} from "../../Context/defaultValues";
import customStructuresFromServer from "../../Functions/Helper/customStructuresFromServer";


/**
 * The settings a planner falls back to before its document has been read.
 *
 * @returns {object}
 */
export const plannerSettingsDefault = () => ({
  customStructures: [],
  defaultMaterialEfficiencyValue: 0,
  predefinedSystemIndexes: {},
  extrasCategories: extrasCategoriesDefault,
  defaultCitadelBrokersFee: 1,
  reprocessingSettings: {
    defaultReprocessingCharacter: null,
    ...DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  },
  exemptTypeIDs: new Set(),
});

/**
 * @returns {object} Default planner settings slice state
 */
export const stateDefault = () => ({
  /** @type {Object<string, object>} owner handle -> that planner's settings */
  byOwner: {},
  /** @type {Object<string, boolean>} owner handle -> whether the planner has settings of its own */
  seededByOwner: {},
  /**
   * Owner handles carrying an edit that has not reached the server yet.
   *
   * A read must not overwrite one of these: the held settings are ahead of the
   * stored ones, and replacing them with what the server still has would discard
   * the edit and then save the result over it.
   *
   * @type {Object<string, boolean>}
   */
  unsavedByOwner: {},
});

/**
 * Server payload merged onto the defaults, so an omitted field reads as its
 * default rather than as undefined.
 *
 * @param {object} incoming - the `settings` object from the API
 * @returns {object}
 */
export function mergePlannerSettings(incoming) {
  const base = plannerSettingsDefault();
  if (!incoming || typeof incoming !== "object") return base;

  return {
    ...base,
    ...incoming,
    customStructures: customStructuresFromServer(incoming.customStructures),
    reprocessingSettings: {
      ...base.reprocessingSettings,
      ...(incoming.reprocessingSettings ?? {}),
    },
    extrasCategories: Array.isArray(incoming.extrasCategories)
      ? incoming.extrasCategories
      : base.extrasCategories,
    predefinedSystemIndexes: incoming.predefinedSystemIndexes ?? {},
    // A Set, as the account's own settings hold it, so a consumer reads either
    // the same way.
    exemptTypeIDs: new Set(incoming.exemptTypeIDs ?? []),
  };
}

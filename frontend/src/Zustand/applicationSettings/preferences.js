/**
 * User Preferences Management for EVE Industry Planner.
 * 
 * Handles all user preference settings including toggles, updates, and
 * management of various application settings like cloud accounts, tutorials,
 * market preferences, job settings, and reprocessing configurations.
 * 
 * @fileoverview User preferences and settings management actions
 * @author EVE Industry Planner Team
 */

import {
  detectUserLocale,
  normalizeLocaleForIntl,
} from "../../Functions/Helper/localeDetection";

/**
 * User preferences management actions for application settings.
 * 
 * Provides methods for managing user preferences including toggle operations,
 * update methods, and preference-specific functionality.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} User preferences management actions
 */
export const preferencesActions = (set, get) => ({
  /**
   * Marks the first-login guided flow as completed/incomplete.
   *
   * @param {boolean} value
   */
  setHasCompletedFirstLoginFlow: (value) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          hasCompletedFirstLoginFlow: Boolean(value),
        },
      }),
      false,
      "setHasCompletedFirstLoginFlow"
    ),

  /**
   * Toggles the cloud accounts setting.
   * 
   * Switches between enabled and disabled states for cloud account storage.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleCloudAccounts();
   */
  toggleCloudAccounts: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          userCloudAccounts: !state.applicationSettings.userCloudAccounts,
        },
      }),
      false,
      "toggleCloudAccounts"
    ),

  /**
   * Toggles the hide tutorials setting.
   * 
   * Switches between showing and hiding tutorial elements.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleHideTutorials();
   */
  toggleHideTutorials: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          displayHelpCards: !state.applicationSettings.displayHelpCards,
        },
      }),
      false,
      "toggleHideTutorials"
    ),

  /**
   * Toggles the enable compact view setting.
   * 
   * Switches between compact and expanded view modes for the interface.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleEnableCompactView();
   */
  toggleEnableCompactView: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          enableCompactLayoutView:
            !state.applicationSettings.enableCompactLayoutView,
        },
      }),
      false,
      "toggleEnableCompactView"
    ),

  /**
   * Sets planner job card layout (classic vs compact).
   *
   * @param {boolean} compact - true for compact cards, false for classic
   */
  setEnableCompactLayoutView: (compact) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          enableCompactLayoutView: Boolean(compact),
        },
      }),
      false,
      "setEnableCompactLayoutView"
    ),

  /**
   * Updates the ESI job tab setting.
   * 
   * @param {string|null} newValue - New ESI job tab value
   * 
   * @example
   * store.getState().applicationSettings.actions.updateEsiJobTab('active');
   * store.getState().applicationSettings.actions.updateEsiJobTab(null);
   */
  updateEsiJobTab: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          esiJobTab: newValue,
        },
      }),
      false,
      "updateEsiJobTab"
    ),

  /**
   * Sets a single job workflow stage label (`application_settings.jobStatuses`).
   *
   * @param {number|string} id - Stage id (0–4)
   * @param {string} name - Display name (may be empty to clear to server default handling)
   */
  setJobStatusLabel: (id, name) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          jobStatuses: {
            ...state.applicationSettings.jobStatuses,
            [String(id)]: { name },
          },
        },
      }),
      false,
      "setJobStatusLabel"
    ),

  /**
   * Updates the default material efficiency value.
   * 
   * @param {number} newValue - New default ME value (typically 0-10)
   * 
   * @example
   * store.getState().applicationSettings.actions.updateDefaultMaterialEfficiencyValue(5);
   */
  updateDefaultMaterialEfficiencyValue: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          defaultMaterialEfficiencyValue: newValue,
        },
      }),
      false,
      "updateDefaultMaterialEfficiencyValue"
    ),

  /**
   * Updates the default market location.
   * 
   * @param {string} newValue - New default market location (e.g., 'jita', 'amarr')
   * 
   * @example
   * store.getState().applicationSettings.actions.updateDefaultMarket('jita');
   */
  updateDefaultMarket: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          defaultMarketLocation: newValue,
        },
      }),
      false,
      "updateDefaultMarket"
    ),

  /**
   * Updates the default order type.
   * 
   * @param {string} newValue - New default order type ('buy' or 'sell')
   * 
   * @example
   * store.getState().applicationSettings.actions.updateDefaultOrders('sell');
   */
  updateDefaultOrders: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          defaultOrderType: newValue,
        },
      }),
      false,
      "updateDefaultOrders"
    ),

  /**
   * Toggles the hide complete materials setting.
   * 
   * Switches between showing and hiding materials that are already complete.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleHideCompleteMaterials();
   */
  toggleHideCompleteMaterials: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          hideCompleteMaterials:
            !state.applicationSettings.hideCompleteMaterials,
        },
      }),
      false,
      "toggleHideCompleteMaterials"
    ),

  /**
   * Updates the default asset location station ID.
   * 
   * @param {number} newValue - New default asset location station ID
   * 
   * @example
   * store.getState().applicationSettings.actions.updateDefaultAssetLocation(60003760);
   */
  updateDefaultAssetLocation: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          defaultStationIDForAssets: newValue,
        },
      }),
      false,
      "updateDefaultAssetLocation"
    ),

  /**
   * Updates the citadel broker's fee percentage.
   * 
   * @param {number} newValue - New citadel broker's fee percentage (0-100)
   * 
   * @example
   * store.getState().applicationSettings.actions.updateCitadelBrokersFee(2.5);
   */
  updateCitadelBrokersFee: (newValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          defaultCitadelBrokersFee: newValue,
        },
      }),
      false,
      "updateCitadelBrokersFee"
    ),

  /**
   * Updates exempt type IDs (legacy method with bug).
   * 
   * ⚠️ **Warning**: This method has a bug where it adds the inputValue twice.
   * Use `addExemptTypeID` instead for proper functionality.
   * 
   * @param {number|string} inputValue - Type ID to add to exempt list
   * 
   * @example
   * // This method has a bug - use addExemptTypeID instead
   * store.getState().applicationSettings.actions.updateExemptTypeIDs(34);
   */
  updateExemptTypeIDs: (inputValue) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          exemptTypeIDs: new Set(
            state.applicationSettings.exemptTypeIDs || []
          ).add(inputValue),
          inputValue,
        },
      }),
      false,
      "updateExemptTypeIDs"
    ),

  /**
   * Checks if a type ID is exempt from certain calculations.
   * 
   * @param {number|string} inputTypeID - Type ID to check
   * @returns {boolean} True if the type ID is exempt, false otherwise
   * 
   * @example
   * const isExempt = store.getState().applicationSettings.actions.checkTypeIDisExempt(34);
   * if (isExempt) console.log('Type ID 34 is exempt from calculations');
   */
  checkTypeIDisExempt: (inputTypeID) => {
    const state = get().applicationSettings;
    return state.exemptTypeIDs?.has(inputTypeID) || false;
  },

  /**
   * Adds type ID(s) to the exempt list.
   * 
   * Adds one or more type IDs to the exempt type IDs set. Handles single values,
   * arrays, and Sets. Prevents duplicates automatically.
   * 
   * @param {number|string|Array|Set} inputValue - Type ID(s) to add to exempt list
   * 
   * @example
   * store.getState().applicationSettings.actions.addExemptTypeID(34);
   * store.getState().applicationSettings.actions.addExemptTypeID([34, 35, 36]);
   * store.getState().applicationSettings.actions.addExemptTypeID(new Set([34, 35]));
   */
  addExemptTypeID: (inputValue) => {
    if (!inputValue) return;
    const inputAsArray =
      Array.isArray(inputValue) || inputValue instanceof Set
        ? [...inputValue]
        : [inputValue];

    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          exemptTypeIDs: new Set([
            ...(state.applicationSettings.exemptTypeIDs || []),
            ...inputAsArray,
          ]),
        },
      }),
      false,
      "addExemptTypeID"
    );
  },

  /**
   * Removes type ID(s) from the exempt list.
   * 
   * Removes one or more type IDs from the exempt type IDs set. Handles single values,
   * arrays, and Sets.
   * 
   * @param {number|string|Array|Set} inputValue - Type ID(s) to remove from exempt list
   * 
   * @example
   * store.getState().applicationSettings.actions.removeExemptTypeID(34);
   * store.getState().applicationSettings.actions.removeExemptTypeID([34, 35, 36]);
   * store.getState().applicationSettings.actions.removeExemptTypeID(new Set([34, 35]));
   */
  removeExemptTypeID: (inputValue) => {
    if (!inputValue) return;
    const inputAsArray =
      Array.isArray(inputValue) || inputValue instanceof Set
        ? [...inputValue]
        : [inputValue];

    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          exemptTypeIDs: new Set(
            [...(state.applicationSettings.exemptTypeIDs || [])].filter(
              (i) => !inputAsArray.includes(i)
            )
          ),
        },
      }),
      false,
      "removeExemptTypeID"
    );
  },

  /**
   * Toggles the automatic job recalculation setting.
   * 
   * Switches between enabled and disabled states for automatic job recalculation.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleAutomaticJobRecalculation();
   */
  toggleAutomaticJobRecalculation: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          enableAutomaticJobRecalculation:
            !state.applicationSettings.enableAutomaticJobRecalculation,
        },
      }),
      false,
      "toggleAutomaticJobRecalculation"
    ),

  /**
   * Toggles the ignore items without blueprints setting.
   * 
   * Switches between enabled and disabled states for ignoring items without blueprints.
   * 
   * @example
   * store.getState().applicationSettings.actions.toggleIgnoreItemsWithoutBlueprints();
   */
  toggleIgnoreItemsWithoutBlueprints: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          enableSkipMissingBlueprints:
            !state.applicationSettings.enableSkipMissingBlueprints,
        },
      }),
      false,
      "toggleIgnoreItemsWithoutBlueprints"
    ),

  /**
   * Sets the default reprocessing character.
   * 
   * @param {string} characterHash - Character hash to set as default reprocessing character
   * 
   * @example
   * store.getState().applicationSettings.actions.setDefaultReprocessingCharacter('character-hash-123');
   */
  setDefaultReprocessingCharacter: (characterHash) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          reprocessingSettings: {
            ...state.applicationSettings.reprocessingSettings,
            defaultReprocessingCharacter: characterHash,
          },
        },
      }),
      false,
      "setDefaultReprocessingCharacter"
    ),

  /**
   * Gets the default reprocessing character from the users array.
   * 
   * Finds and returns the user object that matches the default reprocessing character hash.
   * 
   * @param {Array} users - Array of user objects to search in
   * @returns {Object|null} User object or null if not found
   * 
   * @example
   * const defaultCharacter = store.getState().applicationSettings.actions.getDefaultReprocessingCharacter(characters);
   * if (defaultCharacter) console.log(defaultCharacter.CharacterName);
   */
  getDefaultReprocessingCharacter: (users) => {
    if (!users) return null;
    const state = get().applicationSettings;
    return users.find(
      (character) =>
        character.CharacterHash ===
          state.reprocessingSettings.defaultReprocessingCharacter
    );
  },

  /**
   * Updates reprocessing calculation settings.
   * 
   * Merges new settings with existing reprocessing calculation settings.
   * 
   * @param {Object} newSettings - New reprocessing calculation settings to merge
   * @param {number} [newSettings.efficiency] - Reprocessing efficiency percentage
   * @param {number} [newSettings.refineYield] - Refine yield percentage
   * @param {boolean} [newSettings.useStationBonuses] - Whether to use station bonuses
   * 
   * @example
   * const newSettings = {
   *   efficiency: 0.5,
   *   refineYield: 0.8,
   *   useStationBonuses: true
   * };
   * store.getState().applicationSettings.actions.updateReprocessingCalculationSettings(newSettings);
   */
  updateReprocessingCalculationSettings: (newSettings) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          reprocessingSettings: {
            ...state.applicationSettings.reprocessingSettings,
            ...newSettings,
          },
        },
      }),
      false,
      "updateReprocessingCalculationSettings"
    ),

  /**
   * Updates the locale setting.
   * 
   * @param {string} newLocale - New locale code (e.g., 'en', 'fr', 'de')
   * 
   * @example
   * store.getState().applicationSettings.actions.updateLocale('fr');
   */
  updateLocale: (newLocale) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          locale: normalizeLocaleForIntl(newLocale),
        },
      }),
      false,
      "updateLocale"
    ),

  /**
   * Gets the current locale setting.
   * 
   * @returns {string} Current locale code
   * 
   * @example
   * const currentLocale = store.getState().applicationSettings.actions.getCurrentLocale();
   * console.log('Current locale:', currentLocale);
   */
  getCurrentLocale: () => {
    const state = get().applicationSettings;
    return normalizeLocaleForIntl(state.locale);
  },

  /**
   * Resets the locale to the detected user locale.
   * 
   * Resets the locale setting to the automatically detected user locale.
   * 
   * @example
   * store.getState().applicationSettings.actions.resetLocale();
   */
  resetLocale: () =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          locale: detectUserLocale(),
        },
      }),
      false,
      "resetLocale"
    ),
});

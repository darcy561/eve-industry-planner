import { asIDList } from "../../Functions/Helper/ids";
import { setGroupPricing } from "../../Functions/MarketData/defaults/pricingSide";

import {
  detectUserLocale,
  normalizeLocaleForIntl,
} from "../../Functions/Helper/localeDetection";

/**
 * The actions that change the account's own application settings.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} User preferences management actions
 */
export const preferencesActions = (set, get) => ({
  /**
   * Toggles the cloud accounts setting.
   *
   * Switches between enabled and disabled states for cloud account storage.
   */
  toggleCloudAccounts: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          userCloudAccounts: !state.applicationSettings.userCloudAccounts,
        },
      }),
      false,
      "toggleCloudAccounts",
    ),

  /**
   * Sets cloud accounts mode to an explicit value, for a caller that names the mode it is
   * switching to rather than toggling.
   *
   * @param {boolean} enabled
   */
  setCloudAccountsEnabled: (enabled) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          userCloudAccounts: Boolean(enabled),
        },
      }),
      false,
      "setCloudAccountsEnabled",
    ),

  /**
   * Toggles the hide tutorials setting.
   *
   * Switches between showing and hiding tutorial elements.
   */
  toggleHideTutorials: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          displayHelpCards: !state.applicationSettings.displayHelpCards,
        },
      }),
      false,
      "toggleHideTutorials",
    ),

  /**
   * Toggles the enable compact view setting.
   *
   * Switches between compact and expanded view modes for the interface.
   */
  toggleEnableCompactView: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          enableCompactLayoutView:
            !state.applicationSettings.enableCompactLayoutView,
        },
      }),
      false,
      "toggleEnableCompactView",
    ),

  /**
   * Sets planner job card layout (classic vs compact).
   *
   * @param {boolean} compact - true for compact cards, false for classic
   */
  setEnableCompactLayoutView: (compact) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          enableCompactLayoutView: Boolean(compact),
        },
      }),
      false,
      "setEnableCompactLayoutView",
    ),

  /**
   * Updates the ESI job tab setting.
   *
   * @param {string|null} newValue - New ESI job tab value
   */
  updateEsiJobTab: (newValue) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          esiJobTab: newValue,
        },
      }),
      false,
      "updateEsiJobTab",
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
        applicationSettings: {
          ...state.applicationSettings,
          jobStatuses: {
            ...state.applicationSettings.jobStatuses,
            [String(id)]: { name },
          },
        },
      }),
      false,
      "setJobStatusLabel",
    ),

  /**
   * Updates the default material efficiency value.
   *
   * @param {number} newValue - New default ME value (typically 0-10)
   */
  updateDefaultMaterialEfficiencyValue: (newValue) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          defaultMaterialEfficiencyValue: newValue,
        },
      }),
      false,
      "updateDefaultMaterialEfficiencyValue",
    ),

  /**
   * Sets one field of one market group's pricing on one side, leaving the side's other groups and
   * answers as they are.
   *
   * @param {string} side - One of PRICING_SIDE
   * @param {number|string} groupID - A market group id
   * @param {"market"|"orderType"} key
   * @param {string|null|undefined} value - empty clears the field
   */
  updateGroupPricingDefault: (side, groupID, key, value) =>
    set(
      (state) => {
        const current = state.applicationSettings.defaultPricing?.[side];
        const groups = setGroupPricing(current?.groups, groupID, key, value);
        const { groups: _dropped, ...withoutGroups } = current ?? {};

        return {
          applicationSettings: {
            ...state.applicationSettings,
            defaultPricing: {
              ...state.applicationSettings.defaultPricing,
              [side]: groups ? { ...withoutGroups, groups } : withoutGroups,
            },
          },
        };
      },
      false,
      "updateGroupPricingDefault",
    ),

  /**
   * Sets one field of one side of the account's pricing defaults: the market, the order type, or
   * on the selling side the route out.
   *
   * @param {string} side - One of PRICING_SIDE
   * @param {"market"|"orderType"|"exit"} key - the selling side takes `exit` for `orderType`
   * @param {string} value
   */
  updatePricingDefault: (side, key, value) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          defaultPricing: {
            ...state.applicationSettings.defaultPricing,
            [side]: {
              ...state.applicationSettings.defaultPricing?.[side],
              [key]: value,
            },
          },
        },
      }),
      false,
      "updatePricingDefault",
    ),

  /**
   * Toggles the hide complete materials setting.
   *
   * Switches between showing and hiding materials that are already complete.
   */
  toggleHideCompleteMaterials: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          hideCompleteMaterials:
            !state.applicationSettings.hideCompleteMaterials,
        },
      }),
      false,
      "toggleHideCompleteMaterials",
    ),

  /**
   * Updates the default asset location station ID.
   *
   * @param {number} newValue - New default asset location station ID
   */
  updateDefaultAssetLocation: (newValue) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          defaultStationIDForAssets: newValue,
        },
      }),
      false,
      "updateDefaultAssetLocation",
    ),

  /**
   * Updates the citadel broker's fee percentage.
   *
   * @param {number} newValue - New citadel broker's fee percentage (0-100)
   */
  updateCitadelBrokersFee: (newValue) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          defaultCitadelBrokersFee: newValue,
        },
      }),
      false,
      "updateCitadelBrokersFee",
    ),

  /**
   * Checks if a type ID is exempt from certain calculations.
   *
   * @param {number|string} inputTypeID - Type ID to check
   * @returns {boolean} True if the type ID is exempt, false otherwise
   */
  checkTypeIDisExempt: (inputTypeID) => {
    const state = get().applicationSettings;
    return state.exemptTypeIDs?.has(inputTypeID) || false;
  },

  /**
   * Adds one type id, or an array or Set of them, to the exempt list.
   *
   * @param {number|string|Array|Set} inputValue - Type ID(s) to add to exempt list
   */
  addExemptTypeID: (inputValue) => {
    if (!inputValue) return;
    const inputAsArray = asIDList(inputValue);

    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          exemptTypeIDs: new Set([
            ...(state.applicationSettings.exemptTypeIDs || []),
            ...inputAsArray,
          ]),
        },
      }),
      false,
      "addExemptTypeID",
    );
  },

  /**
   * Removes one type id, or an array or Set of them, from the exempt list.
   *
   * @param {number|string|Array|Set} inputValue - Type ID(s) to remove from exempt list
   */
  removeExemptTypeID: (inputValue) => {
    if (!inputValue) return;
    const inputAsArray = asIDList(inputValue);

    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          exemptTypeIDs: new Set(
            [...(state.applicationSettings.exemptTypeIDs || [])].filter(
              (i) => !inputAsArray.includes(i),
            ),
          ),
        },
      }),
      false,
      "removeExemptTypeID",
    );
  },

  /**
   * Toggles the automatic job recalculation setting.
   *
   * Switches between enabled and disabled states for automatic job recalculation.
   */
  toggleAutomaticJobRecalculation: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          enableAutomaticJobRecalculation:
            !state.applicationSettings.enableAutomaticJobRecalculation,
        },
      }),
      false,
      "toggleAutomaticJobRecalculation",
    ),

  /**
   * Toggles the ignore items without blueprints setting.
   *
   * Switches between enabled and disabled states for ignoring items without blueprints.
   */
  toggleIgnoreItemsWithoutBlueprints: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          enableSkipMissingBlueprints:
            !state.applicationSettings.enableSkipMissingBlueprints,
        },
      }),
      false,
      "toggleIgnoreItemsWithoutBlueprints",
    ),

  /**
   * Sets the character whose skills and standings price a sale.
   *
   * @param {string|null} characterHash
   */
  setDefaultMarketCharacter: (characterHash) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          defaultMarketCharacter: characterHash ?? null,
        },
      }),
      false,
      "setDefaultMarketCharacter",
    ),

  /**
   * Sets the default reprocessing character.
   *
   * @param {string} characterHash - Character hash to set as default reprocessing character
   */
  setDefaultReprocessingCharacter: (characterHash) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          reprocessingSettings: {
            ...state.applicationSettings.reprocessingSettings,
            defaultReprocessingCharacter: characterHash,
          },
        },
      }),
      false,
      "setDefaultReprocessingCharacter",
    ),

  /**
   * Gets the default reprocessing character from the users array.
   *
   * Finds and returns the user object that matches the default reprocessing character hash.
   *
   * @param {Array} users - Array of user objects to search in
   * @returns {Object|null} User object or null if not found
   */
  getDefaultReprocessingCharacter: (users) => {
    if (!users) return null;
    const state = get().applicationSettings;
    return users.find(
      (character) =>
        character.CharacterHash ===
        state.reprocessingSettings.defaultReprocessingCharacter,
    );
  },

  /**
   * Updates the locale setting.
   *
   * @param {string} newLocale - New locale code (e.g., 'en', 'fr', 'de')
   */
  updateLocale: (newLocale) =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          locale: normalizeLocaleForIntl(newLocale),
        },
      }),
      false,
      "updateLocale",
    ),

  /**
   * Gets the current locale setting.
   *
   * @returns {string} Current locale code
   */
  getCurrentLocale: () => {
    const state = get().applicationSettings;
    return normalizeLocaleForIntl(state.locale);
  },

  /**
   * Resets the locale to the detected user locale.
   *
   * Resets the locale setting to the automatically detected user locale.
   */
  resetLocale: () =>
    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          locale: detectUserLocale(),
        },
      }),
      false,
      "resetLocale",
    ),
});

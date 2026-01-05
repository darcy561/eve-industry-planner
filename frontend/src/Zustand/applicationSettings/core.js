/**
 * Core Application Settings for EVE Industry Planner.
 * 
 * Contains the default state configuration and core actions for managing
 * application-wide settings including state initialization, user settings
 * management, and document conversion.
 * 
 * @fileoverview Core application settings state and actions
 * @author EVE Industry Planner Team
 */

import GLOBAL_CONFIG from "../../global-config-app";
import {
  DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  extrasCategoriesDefault,
} from "../../Context/defaultValues";
import CustomStructure from "../../Classes/customStructureConstructor";
import ReprocessingStructure from "../../Classes/reprocessingStructureConstructor";
import { detectUserLocale } from "../../Functions/Helper/localeDetection";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

/**
 * Default state configuration for application settings.
 * 
 * Defines the initial state values for all application settings including
 * user preferences, market options, structure configurations, and other
 * application-wide settings.
 * 
 * @returns {Object} Default application settings state
 * @property {boolean} cloudAccounts - Whether cloud accounts are enabled
 * @property {boolean} hideTutorials - Whether tutorials are hidden
 * @property {boolean} enableCompactView - Whether compact view is enabled
 * @property {string|null} localMarketDisplay - Local market display preference
 * @property {string|null} localOrderDisplay - Local order display preference
 * @property {string|null} esiJobTab - ESI job tab preference
 * @property {number} defaultMaterialEfficiencyValue - Default ME value
 * @property {string} defaultMarket - Default market location
 * @property {string} defaultOrders - Default order type
 * @property {boolean} hideCompleteMaterials - Whether to hide complete materials
 * @property {number} defaultAssetLocation - Default asset location station ID
 * @property {number} citadelBrokersFee - Citadel broker's fee percentage
 * @property {Array} manufacturingStructures - Manufacturing structure configurations
 * @property {Array} reactionStructures - Reaction structure configurations
 * @property {Array} reprocessingStructures - Reprocessing structure configurations
 * @property {Set} exemptTypeIDs - Type IDs exempt from certain calculations
 * @property {boolean} automaticJobRecalculation - Whether to auto-recalculate jobs
 * @property {boolean} ignoreItemsWithoutBlueprints - Whether to ignore items without blueprints
 * @property {string|null} defaultReprocessingCharacter - Default reprocessing character
 * @property {Object} reprocessingCalculationSettings - Reprocessing calculation preferences
 * @property {string} locale - User's locale setting
 * @property {Array} extrasCategories - Extra cost categories
 * @property {Object} predefinedSystemIndexes - Predefined system cost indexes
 */
export const stateDefault = () => ({
  cloudAccounts: false,
  hideTutorials: false,
  enableCompactView: false,
  localMarketDisplay: null,
  localOrderDisplay: null,
  esiJobTab: null,
  defaultMaterialEfficiencyValue: 0,
  defaultMarket: DEFAULT_MARKET_OPTION,
  defaultOrders: DEFAULT_ORDER_OPTION,
  hideCompleteMaterials: false,
  defaultAssetLocation: DEFAULT_ASSET_LOCATION,
  citadelBrokersFee: 1,
  manufacturingStructures: [],
  reactionStructures: [],
  reprocessingStructures: [],
  exemptTypeIDs: new Set(),
  automaticJobRecalculation: true,
  ignoreItemsWithoutBlueprints: false,
  defaultReprocessingCharacter: null,
  reprocessingCalculationSettings: DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  locale: detectUserLocale(),
  extrasCategories: extrasCategoriesDefault,
  predefinedSystemIndexes: {},
});

/**
 * Core actions for application settings management.
 * 
 * Provides essential actions for managing application settings including
 * adding user settings, resetting state, and converting to document format.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core application settings actions
 */
export const coreActions = (set, get) => ({
  /**
   * Adds user settings to the application settings store.
   * 
   * Merges incoming user settings with existing state, using fallback values
   * for missing properties. Handles nested settings structure and creates
   * appropriate object instances for structures.
   * 
   * @param {Object} settings - User settings object to merge
   * @param {Object} [settings.account] - Account-related settings
   * @param {boolean} [settings.account.cloudAccounts] - Cloud accounts preference
   * @param {Object} [settings.layout] - Layout-related settings
   * @param {boolean} [settings.layout.hideTutorials] - Hide tutorials preference
   * @param {boolean} [settings.layout.enableCompactView] - Compact view preference
   * @param {string} [settings.layout.localMarketDisplay] - Local market display preference
   * @param {string} [settings.layout.localOrderDisplay] - Local order display preference
   * @param {string} [settings.layout.esiJobTab] - ESI job tab preference
   * @param {Object} [settings.editJob] - Job editing preferences
   * @param {number} [settings.editJob.defaultMaterialEfficiencyValue] - Default ME value
   * @param {string} [settings.editJob.defaultMarket] - Default market location
   * @param {string} [settings.editJob.defaultOrders] - Default order type
   * @param {boolean} [settings.editJob.hideCompleteMaterials] - Hide complete materials preference
   * @param {number} [settings.editJob.defaultAssetLocation] - Default asset location
   * @param {number} [settings.editJob.citatadelBrokersFee] - Citadel broker's fee
   * @param {Object} [settings.structures] - Structure configurations
   * @param {Array} [settings.structures.manufacturing] - Manufacturing structures
   * @param {Array} [settings.structures.reaction] - Reaction structures
   * @param {Array} [settings.structures.reprocessing] - Reprocessing structures
   * @param {Array} [settings.exemptTypeIDs] - Exempt type IDs
   * @param {boolean} [settings.automaticJobRecalculation] - Auto-recalculation preference
   * @param {boolean} [settings.ignoreItemsWithoutBlueprints] - Ignore items without blueprints
   * @param {string} [settings.defaultReprocessingCharacter] - Default reprocessing character
   * @param {Object} [settings.reprocessingCalculationSettings] - Reprocessing calculation settings
   * @param {Array} [settings.extrasCategories] - Extra cost categories
   * @param {Object} [settings.predefinedSystemIndexes] - Predefined system indexes
   * @param {string} [parentUserHash] - Parent user hash for fallback values
   * 
   * @example
   * const userSettings = {
   *   account: { cloudAccounts: true },
   *   layout: { hideTutorials: true, enableCompactView: false },
   *   editJob: { defaultMarket: 'jita', defaultOrders: 'sell' }
   * };
   * store.getState().applicationSettings.actions.addUserSettings(userSettings, 'user-hash');
   */
  addUserSettings: (settings, parentUserHash) => {
    if (!settings) return;

    set(
      (state) => {
        const newState = {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            cloudAccounts:
              settings?.account?.cloudAccounts ??
              state.applicationSettings.cloudAccounts,
            hideTutorials:
              settings?.layout?.hideTutorials ??
              state.applicationSettings.hideTutorials,
            enableCompactView:
              settings?.layout?.enableCompactView ||
              state.applicationSettings.enableCompactView,
            localMarketDisplay:
              settings?.layout?.localMarketDisplay ??
              state.applicationSettings.localMarketDisplay,
            localOrderDisplay:
              settings?.layout?.localOrderDisplay ??
              state.applicationSettings.localOrderDisplay,
            esiJobTab:
              settings?.layout?.esiJobTab ??
              state.applicationSettings.esiJobTab,
            defaultMaterialEfficiencyValue:
              settings?.editJob?.defaultMaterialEfficiencyValue ??
              state.applicationSettings.defaultMaterialEfficiencyValue,
            defaultMarket:
              settings?.editJob?.defaultMarket ??
              state.applicationSettings.defaultMarket,
            defaultOrders:
              settings?.editJob?.defaultOrders ??
              state.applicationSettings.defaultOrders,
            hideCompleteMaterials:
              settings?.editJob?.hideCompleteMaterials ??
              state.applicationSettings.hideCompleteMaterials,
            defaultAssetLocation:
              settings?.editJob?.defaultAssetLocation ??
              state.applicationSettings.defaultAssetLocation,
            citadelBrokersFee:
              settings?.editJob?.citatadelBrokersFee ??
              state.applicationSettings.citadelBrokersFee,
            manufacturingStructures: (
              settings?.structures?.manufacturing ??
              state.applicationSettings.manufacturingStructures
            ).map((structure) => new CustomStructure(structure)),
            reactionStructures: (
              settings?.structures?.reaction ??
              state.applicationSettings.reactionStructures
            ).map((structure) => new CustomStructure(structure)),
            reprocessingStructures: (
              settings?.structures?.reprocessing ??
              state.applicationSettings.reprocessingStructures
            ).map((structure) => new ReprocessingStructure(structure)),
            exemptTypeIDs: settings?.exemptTypeIDs
              ? new Set(settings.exemptTypeIDs)
              : state.applicationSettings.exemptTypeIDs || new Set(),
            automaticJobRecalculation:
              settings?.automaticJobRecalculation ??
              state.applicationSettings.automaticJobRecalculation,
            ignoreItemsWithoutBlueprints:
              settings?.ignoreItemsWithoutBlueprints ??
              state.applicationSettings.ignoreItemsWithoutBlueprints,
            defaultReprocessingCharacter:
              settings?.defaultReprocessingCharacter ?? parentUserHash,
            reprocessingCalculationSettings:
              settings?.reprocessingCalculationSettings ??
              state.applicationSettings.reprocessingCalculationSettings,
            extrasCategories:
              settings?.extrasCategories ??
              state.applicationSettings.extrasCategories,
            predefinedSystemIndexes:
              settings?.predefinedSystemIndexes ??
              state.applicationSettings.predefinedSystemIndexes,
          },
        };

        return newState;
      },
      false,
      "addUserSettings"
    );
  },

  /**
   * Resets the application settings store to its default state.
   * 
   * Clears all application settings and restores default values,
   * while preserving the actions object.
   * 
   * @example
   * store.getState().applicationSettings.actions.resetApplicationSettingsStore();
   */
  resetApplicationSettingsStore: () => {
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...stateDefault(),
          actions: state.applicationSettings.actions,
        },
      }),
      false,
      "resetApplicationSettingsStore"
    );
  },

  /**
   * Converts application settings to document format for storage.
   * 
   * Creates a document object containing all application settings that need to be
   * persisted to Firebase or other storage systems. Structures the data in a
   * hierarchical format matching the expected storage schema.
   * 
   * @returns {Object} Document object for storage
   * @returns {Object} returns.account - Account-related settings
   * @returns {Object} returns.editJob - Job editing preferences
   * @returns {Object} returns.layout - Layout preferences
   * @returns {Object} returns.structures - Structure configurations
   * @returns {Array} returns.exemptTypeIDs - Exempt type IDs array
   * @returns {boolean} returns.automaticJobRecalculation - Auto-recalculation setting
   * @returns {boolean} returns.ignoreItemsWithoutBlueprints - Ignore items setting
   * @returns {string} [returns.defaultReprocessingCharacter] - Default reprocessing character
   * @returns {Object} returns.reprocessingCalculationSettings - Reprocessing settings
   * @returns {Array} returns.extrasCategories - Extra cost categories
   * @returns {Object} returns.predefinedSystemIndexes - Predefined system indexes
   * 
   * @example
   * const document = store.getState().applicationSettings.actions.toDocument();
   * await saveToFirebase(document);
   */
  toDocument: () => {
    const state = get().applicationSettings;

    return {
      account: {
        cloudAccounts: state.cloudAccounts,
      },
      editJob: {
        citatadelBrokersFee: state.citadelBrokersFee,
        defaultAssetLocation: state.defaultAssetLocation,
        defaultMarket: state.defaultMarket,
        defaultOrders: state.defaultOrders,
        hideCompleteMaterials: state.hideCompleteMaterials,
        defaultMaterialEfficiencyValue:
          state.defaultMaterialEfficiencyValue,
      },
      layout: {
        esiJobTab: state.esiJobTab,
        hideTutorials: state.hideTutorials,
        localMarketDisplay: state.localOrderDisplay,
        localOrderDisplay: state.localOrderDisplay,
        enableCompactView: state.enableCompactView,
      },
      structures: {
        manufacturing: state.manufacturingStructures.map((structure) =>
          structure.toDocument()
        ),
        reaction: state.reactionStructures.map((structure) =>
          structure.toDocument()
        ),
        reprocessing: state.reprocessingStructures.map((structure) =>
          structure.toDocument()
        ),
      },
      exemptTypeIDs: [...(state.exemptTypeIDs || [])],
      automaticJobRecalculation: state.automaticJobRecalculation,
      ignoreItemsWithoutBlueprints: state.ignoreItemsWithoutBlueprints,
      ...(state.defaultReprocessingCharacter && {
        defaultReprocessingCharacter: state.defaultReprocessingCharacter,
      }),
      reprocessingCalculationSettings:
        state.reprocessingCalculationSettings,
      extrasCategories: state.extrasCategories,
      predefinedSystemIndexes: state.predefinedSystemIndexes,
    };
  },
});

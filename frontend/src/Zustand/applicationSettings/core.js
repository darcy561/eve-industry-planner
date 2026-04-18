/**
 * Core Application Settings — aligned with Mongo `application_settings` / Go `models.ApplicationSettings` JSON.
 *
 * @fileoverview Application settings state and merge/toDocument for persistence
 */

import GLOBAL_CONFIG from "../../global-config-app";
import {
  DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  extrasCategoriesDefault,
} from "../../Context/defaultValues";
import CustomStructure from "../../Classes/customStructure";
import ReprocessingStructure from "../../Classes/reprocessingStructure";
import { detectUserLocale } from "../../Functions/Helper/localeDetection";
import { jobStatusesForPersist } from "../../Functions/Helper/jobStatuses";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

function defaultReprocessingSettings() {
  return {
    defaultReprocessingCharacter: null,
    ...DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  };
}

/**
 * @returns {Object} Default application settings (API field names)
 */
export const stateDefault = () => ({
  userCloudAccounts: false,
  displayHelpCards: false,
  enableCompactLayoutView: false,
  esiJobTab: null,
  defaultMaterialEfficiencyValue: 0,
  defaultMarketLocation: DEFAULT_MARKET_OPTION,
  defaultOrderType: DEFAULT_ORDER_OPTION,
  hideCompleteMaterials: false,
  defaultStationIDForAssets: DEFAULT_ASSET_LOCATION,
  defaultCitadelBrokersFee: 1,
  customStructures: {
    manufacturing: [],
    reaction: [],
    reprocessing: [],
  },
  exemptTypeIDs: new Set(),
  enableAutomaticJobRecalculation: true,
  enableSkipMissingBlueprints: false,
  reprocessingSettings: defaultReprocessingSettings(),
  locale: detectUserLocale(),
  extrasCategories: extrasCategoriesDefault,
  predefinedSystemIndexes: {},
  /** @type {Record<string, { name?: string }>} */
  jobStatuses: {},
});

/**
 * Pure merge of server `application_settings` into a previous slice (preserves `actions`).
 *
 * @param {object} prev - `state.applicationSettings` including `actions`
 * @param {object} incoming - partial API `application_settings`
 * @param {string|undefined} mainCharacterHashFallback - fallback for default reprocessing character
 * @returns {object} merged application settings (including `actions`)
 */
export function mergeApplicationSettingsState(
  prev,
  incoming,
  mainCharacterHashFallback
) {
  if (!incoming || typeof incoming !== "object") return prev;

  const cs = incoming.customStructures;
  const rsIn = incoming.reprocessingSettings;

  let mergedRs = prev.reprocessingSettings;
  if (rsIn && typeof rsIn === "object") {
    mergedRs = {
      ...prev.reprocessingSettings,
      ...rsIn,
    };
  }
  mergedRs = {
    ...mergedRs,
    defaultReprocessingCharacter:
      mergedRs.defaultReprocessingCharacter ?? mainCharacterHashFallback ?? null,
  };

  // Same values as layout.localMarketDisplay/localOrderDisplay on legacy API; merged into defaults.
  const defaultMarketLocation =
    incoming.defaultMarketLocation !== undefined
      ? incoming.defaultMarketLocation
      : incoming.localMarketDisplay !== undefined
        ? incoming.localMarketDisplay
        : prev.defaultMarketLocation;
  const defaultOrderType =
    incoming.defaultOrderType !== undefined
      ? incoming.defaultOrderType
      : incoming.localOrderDisplay !== undefined
        ? incoming.localOrderDisplay
        : prev.defaultOrderType;

  return {
    ...prev,
    ...(incoming.userCloudAccounts !== undefined && {
      userCloudAccounts: incoming.userCloudAccounts,
    }),
    ...(incoming.displayHelpCards !== undefined && {
      displayHelpCards: incoming.displayHelpCards,
    }),
    ...(incoming.enableCompactLayoutView !== undefined && {
      enableCompactLayoutView: incoming.enableCompactLayoutView,
    }),
    ...(incoming.esiJobTab !== undefined && {
      esiJobTab: incoming.esiJobTab,
    }),
    ...(incoming.defaultMaterialEfficiencyValue !== undefined && {
      defaultMaterialEfficiencyValue: incoming.defaultMaterialEfficiencyValue,
    }),
    defaultMarketLocation,
    defaultOrderType,
    ...(incoming.hideCompleteMaterials !== undefined && {
      hideCompleteMaterials: incoming.hideCompleteMaterials,
    }),
    ...(incoming.defaultStationIDForAssets !== undefined && {
      defaultStationIDForAssets: incoming.defaultStationIDForAssets,
    }),
    ...(incoming.defaultCitadelBrokersFee !== undefined && {
      defaultCitadelBrokersFee: incoming.defaultCitadelBrokersFee,
    }),
    customStructures: {
      manufacturing:
        cs?.manufacturing != null
          ? cs.manufacturing.map((x) => new CustomStructure(x))
          : prev.customStructures.manufacturing,
      reaction:
        cs?.reaction != null
          ? cs.reaction.map((x) => new CustomStructure(x))
          : prev.customStructures.reaction,
      reprocessing:
        cs?.reprocessing != null
          ? cs.reprocessing.map((x) => new ReprocessingStructure(x))
          : prev.customStructures.reprocessing,
    },
    exemptTypeIDs:
      incoming.exemptTypeIDs != null
        ? new Set(incoming.exemptTypeIDs)
        : prev.exemptTypeIDs,
    ...(incoming.enableAutomaticJobRecalculation !== undefined && {
      enableAutomaticJobRecalculation:
        incoming.enableAutomaticJobRecalculation,
    }),
    ...(incoming.enableSkipMissingBlueprints !== undefined && {
      enableSkipMissingBlueprints: incoming.enableSkipMissingBlueprints,
    }),
    reprocessingSettings: mergedRs,
    extrasCategories: Array.isArray(incoming.extrasCategories)
      ? incoming.extrasCategories
      : prev.extrasCategories,
    ...(incoming.predefinedSystemIndexes !== undefined && {
      predefinedSystemIndexes: incoming.predefinedSystemIndexes,
    }),
    jobStatuses:
      incoming.jobStatuses != null
        ? { ...prev.jobStatuses, ...incoming.jobStatuses }
        : prev.jobStatuses,
    actions: prev.actions,
  };
}

export const coreActions = (set, get) => ({
  /**
   * Merge partial server `application_settings` (login / API) into the store.
   * @param {object|null|undefined} incoming
   * @param {string|undefined} mainCharacterHashFallback - fallback for default reprocessing character when server omits it
   */
  mergeApplicationSettingsFromServer: (incoming, mainCharacterHashFallback) => {
    if (!incoming || typeof incoming !== "object") return;

    set(
      (state) => ({
        ...state,
        applicationSettings: mergeApplicationSettingsState(
          state.applicationSettings,
          incoming,
          mainCharacterHashFallback
        ),
      }),
      false,
      "mergeApplicationSettingsFromServer"
    );
  },

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
   * Flat JSON for `PUT /api/v1/user/application-settings` (Mongo `models.ApplicationSettings`).
   */
  toPersistPayload: () => {
    const state = get().applicationSettings;
    const jobStatuses = jobStatusesForPersist(state.jobStatuses);
    const cs = state.customStructures;
    const rs = state.reprocessingSettings;

    return {
      userCloudAccounts: state.userCloudAccounts,
      displayHelpCards: state.displayHelpCards,
      defaultMarketLocation: state.defaultMarketLocation,
      defaultOrderType: state.defaultOrderType,
      esiJobTab: state.esiJobTab,
      enableCompactLayoutView: state.enableCompactLayoutView,
      enableAutomaticJobRecalculation: state.enableAutomaticJobRecalculation,
      enableSkipMissingBlueprints: state.enableSkipMissingBlueprints,
      hideCompleteMaterials: state.hideCompleteMaterials,
      defaultStationIDForAssets: state.defaultStationIDForAssets,
      defaultCitadelBrokersFee: state.defaultCitadelBrokersFee,
      defaultMaterialEfficiencyValue: state.defaultMaterialEfficiencyValue,
      customStructures: {
        manufacturing: cs.manufacturing.map((structure) =>
          structure.toDocument()
        ),
        reaction: cs.reaction.map((structure) => structure.toDocument()),
        reprocessing: cs.reprocessing.map((structure) =>
          structure.toDocument()
        ),
      },
      exemptTypeIDs: [...(state.exemptTypeIDs || [])],
      reprocessingSettings: {
        defaultReprocessingCharacter: rs.defaultReprocessingCharacter ?? null,
        preferCompressed: rs.preferCompressed,
        compressionBonusMultiplier: rs.compressionBonusMultiplier,
        valueMultiplier: rs.valueMultiplier,
        wastePenaltyMultiplier: rs.wastePenaltyMultiplier,
        sellExcessMineralTypes: rs.sellExcessMineralTypes,
      },
      extrasCategories: state.extrasCategories,
      predefinedSystemIndexes: state.predefinedSystemIndexes,
      jobStatuses,
    };
  },

  /**
   * Legacy Firebase-shaped document (nested account / layout / editJob). Prefer {@link toPersistPayload} for API.
   */
  toDocument: () => {
    const state = get().applicationSettings;
    const jobStatuses = jobStatusesForPersist(state.jobStatuses);
    const cs = state.customStructures;

    return {
      account: {
        cloudAccounts: state.userCloudAccounts,
      },
      editJob: {
        citadelBrokersFee: state.defaultCitadelBrokersFee,
        defaultAssetLocation: state.defaultStationIDForAssets,
        defaultMarket: state.defaultMarketLocation,
        defaultOrders: state.defaultOrderType,
        hideCompleteMaterials: state.hideCompleteMaterials,
        defaultMaterialEfficiencyValue: state.defaultMaterialEfficiencyValue,
      },
      layout: {
        esiJobTab: state.esiJobTab,
        hideTutorials: !state.displayHelpCards,
        enableCompactView: state.enableCompactLayoutView,
      },
      structures: {
        manufacturing: cs.manufacturing.map((structure) =>
          structure.toDocument()
        ),
        reaction: cs.reaction.map((structure) => structure.toDocument()),
        reprocessing: cs.reprocessing.map((structure) =>
          structure.toDocument()
        ),
      },
      exemptTypeIDs: [...(state.exemptTypeIDs || [])],
      automaticJobRecalculation: state.enableAutomaticJobRecalculation,
      ignoreItemsWithoutBlueprints: state.enableSkipMissingBlueprints,
      ...(state.reprocessingSettings.defaultReprocessingCharacter && {
        defaultReprocessingCharacter:
          state.reprocessingSettings.defaultReprocessingCharacter,
      }),
      reprocessingCalculationSettings: {
        preferCompressed: state.reprocessingSettings.preferCompressed,
        compressionBonusMultiplier:
          state.reprocessingSettings.compressionBonusMultiplier,
        valueMultiplier: state.reprocessingSettings.valueMultiplier,
        wastePenaltyMultiplier: state.reprocessingSettings.wastePenaltyMultiplier,
        sellExcessMineralTypes: state.reprocessingSettings.sellExcessMineralTypes,
      },
      extrasCategories: state.extrasCategories,
      predefinedSystemIndexes: state.predefinedSystemIndexes,
      jobStatuses,
    };
  },

  mergeJobStatusesFromServer: (map) => {
    if (!map || typeof map !== "object") return;

    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          jobStatuses: {
            ...state.applicationSettings.jobStatuses,
            ...map,
          },
          actions: state.applicationSettings.actions,
        },
      }),
      false,
      "mergeJobStatusesFromServer"
    );
  },
});

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
import InventionStructure from "../../Classes/inventionStructure";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

function defaultReprocessingSettings() {
  return {
    defaultReprocessingCharacter: null,
    ...DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  };
}

/** @param {unknown} structure @param {new (data: object) => { toDocument(): object }} StructureClass */
function customStructureRowToDocument(structure, StructureClass) {
  if (structure != null && typeof structure.toDocument === "function") {
    return structure.toDocument();
  }
  if (structure != null && typeof structure === "object") {
    return new StructureClass(structure).toDocument();
  }
  return structure;
}

/**
 * Go `json` omits empty optional fields; Mongo full documents may also omit keys.
 * For authoritative GET / change-stream payloads, missing key means "empty / default",
 * not "preserve local Zustand". Without this, reverts that clear optional state never apply on other sessions.
 *
 * @param {object} incoming
 * @returns {object}
 */
function normalizeServerApplicationSettingsPayload(incoming) {
  const base = /** @type {Record<string, unknown>} */ ({ ...incoming });
  if (!("esiJobTab" in base)) base.esiJobTab = null;
  if (!("exemptTypeIDs" in base)) base.exemptTypeIDs = [];
  if (!("extrasCategories" in base)) base.extrasCategories = [...extrasCategoriesDefault];
  if (!("predefinedSystemIndexes" in base)) base.predefinedSystemIndexes = {};
  if (!("jobStatuses" in base)) base.jobStatuses = {};
  return base;
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
    invention: [],
  },
  exemptTypeIDs: new Set(),
  enableAutomaticJobRecalculation: true,
  enableSkipMissingBlueprints: false,
  reprocessingSettings: defaultReprocessingSettings(),
  locale: detectUserLocale(),
  extrasCategories: extrasCategoriesDefault,
  predefinedSystemIndexes: {},
  jobStatuses: {},

});

/**
 * Pure merge of server `application_settings` into a previous slice (preserves `actions`).
 *
 * @param {object} prev - `state.applicationSettings` including `actions`
 * @param {object} incoming - partial API `application_settings`
 * @param {string|undefined} mainCharacterHashFallback - fallback for default reprocessing character when server omits it
 * @param {{ authoritativeFullDocument?: boolean }} [options] - When true (GET / realtime full doc), missing optional keys mean cleared defaults, not “keep local”. Login payloads stay false/partial.
 * @returns {object} merged application settings (including `actions`)
 */
export function mergeApplicationSettingsState(
  prev,
  incoming,
  mainCharacterHashFallback,
  options = {}
) {
  const { authoritativeFullDocument = false } = options;

  if (!incoming || typeof incoming !== "object") return prev;

  if (authoritativeFullDocument) {
    incoming = normalizeServerApplicationSettingsPayload(incoming);
  }

  const rsIn = incoming.reprocessingSettings;

  /** When server sends `customStructures`, replace wholesale (missing lane = empty — Go omits empty slices). */
  let nextCustomStructures = prev.customStructures;
  if (incoming.customStructures !== undefined) {
    if (incoming.customStructures === null) {
      nextCustomStructures = {
        manufacturing: [],
        reaction: [],
        reprocessing: [],
      };
    } else if (typeof incoming.customStructures === "object") {
      const cs = incoming.customStructures;
      nextCustomStructures = {
        manufacturing: Array.isArray(cs.manufacturing)
          ? cs.manufacturing.map((x) => new CustomStructure(x))
          : [],
        reaction: Array.isArray(cs.reaction)
          ? cs.reaction.map((x) => new CustomStructure(x))
          : [],
        reprocessing: Array.isArray(cs.reprocessing)
          ? cs.reprocessing.map((x) => new ReprocessingStructure(x))
          : [],
        invention: Array.isArray(cs.invention)
          ? cs.invention.map((x) => new InventionStructure(x))
          : [],
      };
    }
  }

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
    customStructures: nextCustomStructures,
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
      incoming.jobStatuses != null && typeof incoming.jobStatuses === "object"
        ? { ...incoming.jobStatuses }
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
          mainCharacterHashFallback,
          { authoritativeFullDocument: true }
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
          customStructureRowToDocument(structure, CustomStructure)
        ),
        reaction: cs.reaction.map((structure) =>
          customStructureRowToDocument(structure, CustomStructure)
        ),
        reprocessing: cs.reprocessing.map((structure) =>
          customStructureRowToDocument(structure, ReprocessingStructure)
        ),
        invention: cs.invention.map((structure) =>
          customStructureRowToDocument(structure, InventionStructure)
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
          customStructureRowToDocument(structure, CustomStructure)
        ),
        reaction: cs.reaction.map((structure) =>
          customStructureRowToDocument(structure, CustomStructure)
        ),
        reprocessing: cs.reprocessing.map((structure) =>
          customStructureRowToDocument(structure, ReprocessingStructure)
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

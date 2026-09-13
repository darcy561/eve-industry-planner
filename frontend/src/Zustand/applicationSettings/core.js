/**
 * Core Application Settings — aligned with Mongo `application_settings` / Go `models.ApplicationSettings` JSON.
 *
 * @fileoverview Application settings state and merge/toDocument for persistence
 */

import GLOBAL_CONFIG from "../../global-config-app";
import { EXIT_ROUTE } from "../../Functions/MarketData/returns.js";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
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

/**
 * One side's default. The buying side names a basis; the selling side names the
 * route its output leaves by, which decides the basis and the charges together.
 *
 * @typedef {{market: string, basis?: string, exit?: string,
 *   groups?: Object<string, {market?: string, basis?: string}>}} PricingSide
 */

/**
 * The route an account priced on a basis was already being shown.
 *
 * Returns led with the listing for everyone before the route was stored, so an
 * account that named the bid side was reading a listing's fee against a bid's
 * price. Taking its basis at its word repairs that, and leaves everyone else on
 * the route they already had.
 *
 * @param {string|null|undefined} basis
 * @returns {string}
 */
function exitForBasis(basis) {
  return basis === "buy" || basis === "buyP95"
    ? EXIT_ROUTE.IMMEDIATE
    : EXIT_ROUTE.LISTED;
}

/**
 * Where each side of a job is priced when nothing nearer has said.
 *
 * @returns {{buying: PricingSide, selling: PricingSide}}
 */
function defaultPricingSides() {
  return {
    buying: { market: DEFAULT_MARKET_OPTION, basis: DEFAULT_ORDER_OPTION },
    // The selling side names a route out rather than a basis, and the blank
    // state names none: a route seeded here could not be told from one the
    // player chose, and the merge has to keep a choice while still letting a
    // legacy account's stored basis answer on first load. Readers fall back to
    // EXIT_ROUTE.LISTED, which is where that default belongs.
    selling: { market: DEFAULT_MARKET_OPTION },
  };
}

/**
 * An account's pricing defaults, seeded from the single market and order type
 * wherever the server has not sent the pair.
 *
 * Both sides seed from the same value on purpose: an account that has only ever
 * said "Jita, sell orders" has said nothing about which side of a job it meant,
 * so neither side may claim it more than the other.
 *
 * @param {object} incoming
 * @param {object} prev
 * @param {string} market - The single default, already merged
 * @param {string} basis - The single order type, already merged
 * @returns {{buying: PricingSide, selling: PricingSide}}
 */
function mergePricingDefaults(incoming, prev, market, basis) {
  const previous = prev.defaultPricing ?? defaultPricingSides();

  const side = (name) => {
    // A side with no market has not been filled in yet rather than being a
    // choice of nowhere: Go serialises the pair whether or not Mongo held it,
    // so an account stored before the split arrives as `{}` on each side.
    const sent = incoming.defaultPricing?.[name];
    const chosen = sent?.market
      ? { market: sent.market, basis: sent.basis || previous[name].basis }
      : { market, basis };

    // The side's market group defaults and its route out travel with it.
    // Dropping either here would lose it on the next save, because what is
    // persisted is this merged copy.
    const groups = sent?.groups ?? previous[name].groups;

    if (name !== PRICING_SIDE.SELLING) {
      return groups ? { ...chosen, groups } : chosen;
    }

    // The selling side names a route instead of a basis, so the basis it seeded
    // from is read as one and then dropped: two stored answers to the same
    // question are free to disagree, and the route is the one that also decides
    // whether a broker fee is charged.
    // A route the server sent wins. Where it sent this side without one, its
    // basis answers — a document stored before routes existed is still the
    // server answering. Only where it sent nothing for this side does the route
    // already held stand, which is a choice because the blank state names none;
    // and behind that the legacy single default, for a legacy account's first
    // load. The held route must outrank that last rung: the single default is
    // still written on every save, so deriving from it again would reset a
    // chosen route on the next merge that said nothing about pricing.
    const exit =
      sent?.exit ??
      (sent?.market || sent?.basis
        ? exitForBasis(chosen.basis)
        : (previous[name].exit ?? exitForBasis(chosen.basis)));
    const { basis: _seeded, ...withoutBasis } = chosen;

    return { ...withoutBasis, exit, ...(groups ? { groups } : {}) };
  };

  return { buying: side("buying"), selling: side("selling") };
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
  if (!("extrasCategories" in base))
    base.extrasCategories = [...extrasCategoriesDefault];
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
  defaultPricing: defaultPricingSides(),
  hideCompleteMaterials: false,
  defaultStationIDForAssets: DEFAULT_ASSET_LOCATION,
  defaultCitadelBrokersFee: 1,
  // Whose skills and standings price a sale. Null until chosen; the seller
  // accessor stands in with the account's main.
  defaultMarketCharacter: null,
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
  options = {},
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
      mergedRs.defaultReprocessingCharacter ??
      mainCharacterHashFallback ??
      null,
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
  const defaultPricing = mergePricingDefaults(
    incoming,
    prev,
    defaultMarketLocation,
    defaultOrderType,
  );

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
    defaultPricing,
    ...(incoming.hideCompleteMaterials !== undefined && {
      hideCompleteMaterials: incoming.hideCompleteMaterials,
    }),
    ...(incoming.defaultStationIDForAssets !== undefined && {
      defaultStationIDForAssets: incoming.defaultStationIDForAssets,
    }),
    ...(incoming.defaultCitadelBrokersFee !== undefined && {
      defaultCitadelBrokersFee: incoming.defaultCitadelBrokersFee,
    }),
    defaultMarketCharacter: incoming.defaultMarketCharacter ?? null,
    customStructures: nextCustomStructures,
    exemptTypeIDs:
      incoming.exemptTypeIDs != null
        ? new Set(incoming.exemptTypeIDs)
        : prev.exemptTypeIDs,
    ...(incoming.enableAutomaticJobRecalculation !== undefined && {
      enableAutomaticJobRecalculation: incoming.enableAutomaticJobRecalculation,
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
          { authoritativeFullDocument: true },
        ),
      }),
      false,
      "mergeApplicationSettingsFromServer",
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
      "resetApplicationSettingsStore",
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
      defaultPricing: state.defaultPricing,
      esiJobTab: state.esiJobTab,
      enableCompactLayoutView: state.enableCompactLayoutView,
      enableAutomaticJobRecalculation: state.enableAutomaticJobRecalculation,
      enableSkipMissingBlueprints: state.enableSkipMissingBlueprints,
      hideCompleteMaterials: state.hideCompleteMaterials,
      defaultStationIDForAssets: state.defaultStationIDForAssets,
      defaultCitadelBrokersFee: state.defaultCitadelBrokersFee,
      ...(state.defaultMarketCharacter && {
        defaultMarketCharacter: state.defaultMarketCharacter,
      }),
      defaultMaterialEfficiencyValue: state.defaultMaterialEfficiencyValue,
      customStructures: {
        manufacturing: cs.manufacturing.map((structure) =>
          customStructureRowToDocument(structure, CustomStructure),
        ),
        reaction: cs.reaction.map((structure) =>
          customStructureRowToDocument(structure, CustomStructure),
        ),
        reprocessing: cs.reprocessing.map((structure) =>
          customStructureRowToDocument(structure, ReprocessingStructure),
        ),
        invention: cs.invention.map((structure) =>
          customStructureRowToDocument(structure, InventionStructure),
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
          customStructureRowToDocument(structure, CustomStructure),
        ),
        reaction: cs.reaction.map((structure) =>
          customStructureRowToDocument(structure, CustomStructure),
        ),
        reprocessing: cs.reprocessing.map((structure) =>
          customStructureRowToDocument(structure, ReprocessingStructure),
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
        wastePenaltyMultiplier:
          state.reprocessingSettings.wastePenaltyMultiplier,
        sellExcessMineralTypes:
          state.reprocessingSettings.sellExcessMineralTypes,
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
      "mergeJobStatusesFromServer",
    );
  },
});

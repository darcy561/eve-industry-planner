/**
 * Core Application Settings — aligned with Mongo `application_settings` / Go `models.ApplicationSettings` JSON.
 *
 * @fileoverview Application settings state and merge/toDocument for persistence
 */

import GLOBAL_CONFIG from "../../global-config-app";
import { EXIT_ROUTE } from "../../Functions/Job/returns";
import { PRICING_SIDE } from "../../Functions/MarketData/defaults/pricingSide";
import {
  DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  extrasCategoriesDefault,
} from "../../Context/defaultValues";
import { structureToDocument } from "../../Functions/Custom Structures/customStructure";
import customStructuresFromServer from "../../Functions/Custom Structures/customStructuresFromServer";
import { detectUserLocale } from "../../Functions/Helper/localeDetection";
import { jobStatusesForPersist } from "../../Functions/Helper/jobStatuses";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE, DEFAULT_ASSET_LOCATION } =
  GLOBAL_CONFIG;

function defaultReprocessingSettings() {
  return {
    defaultReprocessingCharacter: null,
    ...DEFAULT_REPROCESSING_CALCULATION_SETTINGS,
  };
}

/**
 * One side's default. The buying side names an order type; the selling side names the
 * route its output leaves by, which decides the order type and the charges together.
 *
 * @typedef {{market: string, orderType?: string, exit?: string,
 *   groups?: Object<string, {market?: string, orderType?: string}>}} PricingSide
 */

/**
 * The route an account priced on an order type was already being shown.
 *
 * Returns led with the listing for everyone before the route was stored, so an
 * account that named the bid side was reading a listing's fee against a bid's
 * price. Taking its order type at its word repairs that, and leaves everyone else on
 * the route they already had.
 *
 * @param {string|null|undefined} orderType
 * @returns {string}
 */
function exitForOrderType(orderType) {
  return orderType === "buy" || orderType === "buyP95"
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
    buying: { market: DEFAULT_MARKET_OPTION, orderType: DEFAULT_ORDER_TYPE },
    // The selling side names a route out rather than an order type, and the blank
    // state names none: a route seeded here could not be told from one the
    // player chose, and the merge has to keep a choice while still letting a
    // legacy account's stored order type answer on first load. Readers fall back to
    // EXIT_ROUTE.LISTED, which is where that default belongs.
    selling: { market: DEFAULT_MARKET_OPTION },
  };
}

/**
 * An account's pricing defaults, as the server sent them over what is held.
 *
 * @param {object} incoming
 * @param {object} prev
 * @returns {{buying: PricingSide, selling: PricingSide}}
 */
function mergePricingDefaults(incoming, prev) {
  const previous = prev.defaultPricing ?? defaultPricingSides();

  const side = (name) => {
    // A side with no market has not been filled in yet rather than being a
    // choice of nowhere: Go serialises the pair whether or not Mongo held it,
    // so an account stored before the split arrives as `{}` on each side.
    const sent = incoming.defaultPricing?.[name];
    const chosen = sent?.market
      ? {
          market: sent.market,
          orderType: sent.orderType || previous[name].orderType,
        }
      : { market: previous[name].market, orderType: previous[name].orderType };

    // The side's market group defaults and its route out travel with it.
    // Dropping either here would lose it on the next save, because what is
    // persisted is this merged copy.
    const groups = sent?.groups ?? previous[name].groups;

    if (name !== PRICING_SIDE.SELLING) {
      return groups ? { ...chosen, groups } : chosen;
    }

    // The selling side names a route instead of an order type, so the order type it seeded
    // from is read as one and then dropped: two stored answers to the same
    // question are free to disagree, and the route is the one that also decides
    // whether a broker fee is charged.
    // A route the server sent wins. Where it sent this side without one, its
    // order type answers — a document stored before routes existed is still the
    // server answering. Only where it sent nothing for this side does the route
    // already held stand, which is a choice because the blank state names none.
    const exit =
      sent?.exit ??
      (sent?.market || sent?.orderType
        ? exitForOrderType(chosen.orderType)
        : (previous[name].exit ?? exitForOrderType(chosen.orderType)));
    const { orderType: _seeded, ...withoutOrderType } = chosen;

    return { ...withoutOrderType, exit, ...(groups ? { groups } : {}) };
  };

  return { buying: side("buying"), selling: side("selling") };
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
  defaultPricing: defaultPricingSides(),
  hideCompleteMaterials: false,
  defaultStationIDForAssets: DEFAULT_ASSET_LOCATION,
  defaultCitadelBrokersFee: 1,
  // Whose skills and standings price a sale. Null until chosen; the seller
  // accessor stands in with the account's main.
  defaultMarketCharacter: null,
  customStructures: [],
  // Carried, not read. The settings endpoint replaces the whole document, so a
  // client that dropped this field would take every market the reader saved
  // with it on the next save of any setting at all. What fills it and what
  // reads it are a later stage's.
  marketLocations: [],
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
 * @param {{ authoritativeFullDocument?: boolean }} [options] - When true (GET / websocket full doc), missing optional keys mean cleared defaults, not “keep local”. Login payloads stay false/partial.
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

  /** When server sends `customStructures`, replace wholesale. */
  let nextCustomStructures = prev.customStructures;
  if (incoming.customStructures !== undefined) {
    nextCustomStructures = customStructuresFromServer(
      incoming.customStructures,
    );
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

  const defaultPricing = mergePricingDefaults(incoming, prev);

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
    marketLocations: Array.isArray(incoming.marketLocations)
      ? incoming.marketLocations
      : prev.marketLocations,
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
      customStructures: cs.map(structureToDocument),
      marketLocations: state.marketLocations ?? [],
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

  mergeJobStatusesFromServer: (map) => {
    if (!map || typeof map !== "object") return;

    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          jobStatuses: {
            ...state.applicationSettings.jobStatuses,
            ...map,
          },
        },
      }),
      false,
      "mergeJobStatusesFromServer",
    );
  },
});

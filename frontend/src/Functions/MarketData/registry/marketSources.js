import GLOBAL_CONFIG from "../../../global-config-app";
import { sameID } from "../../Helper/ids";
import { marketsToOffer } from "./marketLocations";

/**
 * Where a price can come from. The kind decides who fetches it and where it is
 * held.
 *
 * @enum {string}
 */
export const SOURCE_KIND = {
  /** A hub this server walks hourly and serves prices for. */
  HUB: "hub",
  /** An NPC station a reader saved, priced by this server as a hub is. */
  STATION: "station",
  /** A player structure a reader saved, read in the browser on their own token. */
  CITADEL: "citadel",
};

/**
 * What follows from a kind, and the one place any of it is decided. A kind with
 * no entry falls to session-only, read by this server, asked like a hub.
 */
const KIND_TRAITS = {
  [SOURCE_KIND.HUB]: {
    tier: "session",
    readBy: "server",
    freshness: "refreshTime",
  },
  [SOURCE_KIND.STATION]: {
    tier: "session",
    readBy: "server",
    freshness: "refreshTime",
  },
  [SOURCE_KIND.CITADEL]: {
    tier: "persistent",
    readBy: "reader",
    freshness: "rotation",
  },
};

const traitsOf = (kind) => KIND_TRAITS[kind] ?? {};

/**
 * Whether this kind's prices outlive the tab, and so whether there is a tier
 * beneath the cache to read them from.
 *
 * @param {string|undefined} kind - One of SOURCE_KIND
 * @returns {boolean}
 */
export function persistsAcrossSessions(kind) {
  return traitsOf(kind).tier === "persistent";
}

/**
 * Whether the reader fetches this kind themselves, and so whether it is read
 * ahead of them on a rotation rather than served on request.
 *
 * @param {string|undefined} kind - One of SOURCE_KIND
 * @returns {boolean}
 */
export function isReadByTheReader(kind) {
  return traitsOf(kind).readBy === "reader";
}

/**
 * Whether asking this kind for one type it already holds reports its freshness
 * cheaply. A market whose orders only come whole answers no such question.
 *
 * @param {string|undefined} kind - One of SOURCE_KIND
 * @returns {boolean}
 */
export function answersAPerTypeProbe(kind) {
  return traitsOf(kind).freshness !== "rotation";
}

/**
 * @typedef {object} MarketSource
 * @property {string} id
 * @property {string} name
 * @property {number} regionID - The region it sits in
 * @property {number} [stationID] - The NPC station its prices are taken from
 * @property {number} [structureID] - The player structure they are read from
 * @property {string} kind - One of SOURCE_KIND
 * @property {number} [brokerFee] - A citadel owner's rate, where one is saved
 * @property {boolean} [default] - Whether the reader flagged this one
 * @property {string} [sharedBy] - The owner that shared it, where one did
 */

/**
 * The hubs this server prices, taken from the constant rather than a request
 * because they are static configuration.
 *
 * @returns {MarketSource[]}
 */
function serverHeldSources() {
  return GLOBAL_CONFIG.MARKET_OPTIONS.map((hub) => ({
    ...hub,
    kind: SOURCE_KIND.HUB,
  }));
}

/**
 * The markets a reader may price against: the stored market with its kind on
 * it, one naming no place at all being left out.
 *
 * @returns {MarketSource[]}
 */
function readerSavedSources() {
  return marketsToOffer()
    .filter((market) => market.stationID || market.structureID)
    .map((market) => ({
      ...market,
      kind: market.stationID ? SOURCE_KIND.STATION : SOURCE_KIND.CITADEL,
    }));
}

/**
 * Every market a price may be asked for. Read this rather than the hub list, so
 * a reader saving a market reaches every surface.
 *
 * @returns {MarketSource[]}
 */
export function allMarketSources() {
  return [...serverHeldSources(), ...readerSavedSources()];
}

/**
 * What names one type at one market, wherever a pair has to be told apart from
 * another.
 *
 * @param {string} marketLocation
 * @param {number|string} typeID
 * @returns {string}
 */
export const wantKey = (marketLocation, typeID) =>
  `${marketLocation}|${typeID}`;

/**
 * One source from a registry, or undefined.
 *
 * @param {MarketSource[]} sources
 * @param {string} id
 * @returns {MarketSource|undefined}
 */
export function sourceIn(sources, id) {
  return sources?.find((source) => source.id === id);
}

/**
 * The citadels a reader has saved, decided here rather than at each caller.
 *
 * @param {MarketSource[]} sources
 * @returns {MarketSource[]}
 */
export function savedCitadels(sources) {
  return (sources ?? []).filter(
    (source) => source.kind === SOURCE_KIND.CITADEL,
  );
}

/**
 * Every citadel a reader has saved in one region. No region is no answer rather
 * than every citadel.
 *
 * @param {MarketSource[]} sources
 * @param {number|string} regionID
 * @returns {MarketSource[]}
 */
export function citadelsInRegion(sources, regionID) {
  if (!regionID) return [];

  return savedCitadels(sources).filter((source) =>
    sameID(source.regionID, regionID),
  );
}

/**
 * What a market is called, falling back to its id so one the registry has lost
 * is still named.
 *
 * @param {MarketSource[]} sources
 * @param {string} id
 * @returns {string}
 */
export function sourceNameIn(sources, id) {
  return sourceIn(sources, id)?.name ?? id;
}

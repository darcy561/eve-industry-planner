import GLOBAL_CONFIG from "../../global-config-app";
import { marketsToOffer } from "./marketLocations";

/**
 * Where a price can come from. A caller names a source and never learns its
 * kind; the kind decides who fetches it and where it is held.
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
 * What follows from a kind, and the one place any of it is decided.
 *
 * Three questions are asked of a kind — where its rows live, who reads it, and
 * what it can be asked about its freshness — and for the kinds there are today
 * the answers happen to line up. They are kept apart anyway: a kind that is
 * priced by this server *and* needs the reader's own token would split them, and
 * one predicate standing in for three would be wrong in three places at once
 * rather than missing a row here.
 *
 * A kind with no entry falls to the safe answer to each: session-only, read by
 * this server, asked like a hub.
 */
const KIND_TRAITS = {
  [SOURCE_KIND.HUB]: {
    tier: "session",
    readBy: "server",
    freshness: "clock",
  },
  [SOURCE_KIND.STATION]: {
    tier: "session",
    readBy: "server",
    freshness: "clock",
  },
  [SOURCE_KIND.CITADEL]: {
    tier: "persistent",
    readBy: "reader",
    freshness: "rotation",
  },
};

const traitsOf = (kind) => KIND_TRAITS[kind] ?? {};

/**
 * Whether this kind's rows outlive the tab, and so whether there is a tier
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
 * cheaply. A market whose orders only come whole answers no such question — its
 * turn on the rotation is what decides when it is read again.
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
 * The hubs this server prices, as sources.
 *
 * From the constant rather than a request: they are static configuration, held
 * to the server's list by `global-config-app.parity.test.js`.
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
 * The markets a reader may price against, as sources. Which kind a row is
 * follows from the place it names; one naming neither has nowhere to ask and is
 * left out.
 *
 * **The stored row with its kind on it**, rather than a narrower copy of it. A
 * caller wanting a citadel's rate, or which owner shared a market, would
 * otherwise have to go back to the lane for a second list of the same markets —
 * and one of them was reading both, choosing per market which to believe.
 *
 * The composed set where the server has answered with one — the account's own
 * markets plus what each organisation it belongs to has shared. The account's
 * own lane until then, so a reader who has not finished signing in is offered
 * the markets they saved rather than none.
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
 * a reader saving a market reaches every surface without any of them changing.
 *
 * @returns {MarketSource[]}
 */
export function allMarketSources() {
  return [...serverHeldSources(), ...readerSavedSources()];
}

/**
 * What names one type at one of these markets, wherever a pair has to be told
 * apart from another: batching a tick's asks, skipping a want the cache already
 * holds, and keying a surface's query on what it asked for.
 *
 * Here because all three are the same question, and four spellings of it would
 * agree until one of them changed.
 *
 * @param {string} sourceID
 * @param {number|string} typeID
 * @returns {string}
 */
export const wantKey = (sourceID, typeID) => `${sourceID}|${typeID}`;

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
 * What a source is called, falling back to its id — a source the registry has
 * lost is still named, so a reader can recognise a stale choice and change it.
 *
 * @param {MarketSource[]} sources
 * @param {string} id
 * @returns {string}
 */
export function sourceNameIn(sources, id) {
  return sourceIn(sources, id)?.name ?? id;
}

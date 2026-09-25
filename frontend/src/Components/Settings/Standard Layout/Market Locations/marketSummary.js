import {
  SOURCE_KIND,
  isReadByTheReader,
} from "../../../../Functions/MarketData/registry/marketSources.js";
import { readMarketFreshness } from "../../../../Functions/MarketData/prices/priceStore.js";
import { readSourceClock } from "../../../../Functions/MarketData/prices/sourceClocks.js";

/**
 * What a panel says about one market.
 *
 * Assembled here rather than in the panel because where each fact comes from
 * depends on who reads the market, and a surface should not have to know that.
 */

/**
 * @typedef {object} MarketSummary
 * @property {string} id
 * @property {string} name
 * @property {number|undefined} lastReadAt - When these figures were current for
 *   this reader, or undefined where nothing has read the market yet
 * @property {boolean} readHere - Whether that moment is this device's own. It
 *   is what makes an absent moment readable: on a market the reader reads, no
 *   moment means this device has not read it; on one the server prices, it
 *   means the server has not walked it yet
 * @property {number|undefined} brokerFee - The rate a citadel's owner set. A
 *   station has none: its fee comes from the seller's skills and standings
 * @property {string} kind - One of SOURCE_KIND
 * @property {string} [sharedBy] - The owner that shared it, where one did
 * @property {boolean} sharedWithMembers - Whether the organisation that saved it
 *   offers it to its members. Meaningless on a market the reader saved
 * @property {string|undefined} readOutcome - One of MARKET_READ_OUTCOME: how the
 *   last attempt to read this market went. Only a market read on this device has
 *   one — a market the server prices answers for every reader at once, and the
 *   server's own failures are not the reader's to see here
 */

/**
 * The rate a market charges, where it has one of its own.
 *
 * A station's is worked out from the seller's skills and standings, so a stored
 * one there would quote the untrained rate without saying so.
 *
 * @param {import("../../../../Functions/MarketData/registry/marketSources.js").MarketSource} source
 * @returns {number|undefined}
 */
export function visibleBrokerFee(source) {
  return source?.kind === SOURCE_KIND.CITADEL ? source.brokerFee : undefined;
}

/**
 * When a market was last read, for this reader.
 *
 * A market the reader reads themselves was read on this device, so the answer
 * is per device; one this server prices states one clock for every reader. The
 * in-memory clock a price answer leaves behind is empty on a fresh load, so
 * where both are held the newer wins.
 *
 * @param {import("../../../../Functions/MarketData/registry/marketSources.js").MarketSource} source
 * @returns {Promise<{lastReadAt: number|undefined, readHere: boolean,
 *   readOutcome: string|undefined}>}
 */
export async function lastReadMoment(source) {
  if (!isReadByTheReader(source?.kind)) {
    return {
      lastReadAt: newerOf(source?.pricedAt, readSourceClock(source?.id)),
      readHere: false,
      readOutcome: undefined,
    };
  }

  const held = await readMarketFreshness(source.id);
  return {
    lastReadAt: held?.readAt || undefined,
    readHere: true,
    readOutcome: held?.outcome,
  };
}

/** The later of two moments, or undefined where neither is one. */
function newerOf(a, b) {
  const moments = [a, b].filter((moment) => moment > 0);
  return moments.length > 0 ? Math.max(...moments) : undefined;
}

/**
 * One market as a panel shows it.
 *
 * Takes the source and nothing else: a registry entry is the stored market with
 * its kind on it, so the rate, who shared it and what sort of place it is are
 * all already there — and the kind is the one place that decides the last of
 * those, rather than five readers each testing a field for themselves.
 *
 * @param {import("../../../../Functions/MarketData/registry/marketSources.js").MarketSource} source
 * @returns {Promise<MarketSummary>}
 */
export async function summariseMarket(source) {
  const { lastReadAt, readHere, readOutcome } = await lastReadMoment(source);

  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    sharedBy: source.sharedBy,
    sharedWithMembers: Boolean(source.sharedWithMembers),
    lastReadAt,
    readHere,
    readOutcome,
    brokerFee: visibleBrokerFee(source),
  };
}

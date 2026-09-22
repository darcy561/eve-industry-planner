import {
  SOURCE_KIND,
  isReadByTheReader,
} from "../../../../Functions/MarketData/marketSources";
import { readMarketFreshness } from "../../../../Functions/MarketData/priceStore";
import { readSourceClock } from "../../../../Functions/MarketData/sourceClocks";

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
 */

/**
 * The rate a market charges, where it has one of its own.
 *
 * A station's is worked out from the seller's skills and standings, so a stored
 * one there would quote the untrained rate without saying so.
 *
 * @param {import("../../../../Functions/MarketData/marketSources").MarketSource} source
 * @returns {number|undefined}
 */
export function visibleBrokerFee(source) {
  return source?.kind === SOURCE_KIND.CITADEL ? source.brokerFee : undefined;
}

/**
 * When a market was last read, for this reader.
 *
 * **Not one question.** A market the reader reads themselves was read on this
 * device, at a moment only this device knows — another of their machines has
 * its own answer, and a market they have never opened here has none. A market
 * this server prices states one clock, the same for every reader.
 *
 * So the panel is saying "when these figures were current for you", which for a
 * market an organisation shares can differ between two of its members.
 *
 * A server-priced market answers from the clock the market arrived with rather
 * than from the one a price answer left behind this session. The second is a
 * side effect of having asked for a price: it is held in memory, so it is empty
 * on every fresh load and reads as though a market the server has been walking
 * for weeks had never been priced at all. Where both are held the newer wins —
 * the market's own clock is as old as the last time the set was read, and a
 * price answered since then has moved past it.
 *
 * @param {import("../../../../Functions/MarketData/marketSources").MarketSource} source
 * @returns {Promise<{lastReadAt: number|undefined, readHere: boolean}>}
 */
export async function lastReadMoment(source) {
  if (!isReadByTheReader(source?.kind)) {
    return {
      lastReadAt: newerOf(source?.pricedAt, readSourceClock(source?.id)),
      readHere: false,
    };
  }

  const held = await readMarketFreshness(source.id);
  return { lastReadAt: held?.readAt || undefined, readHere: true };
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
 * @param {import("../../../../Functions/MarketData/marketSources").MarketSource} source
 * @returns {Promise<MarketSummary>}
 */
export async function summariseMarket(source) {
  const { lastReadAt, readHere } = await lastReadMoment(source);

  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    sharedBy: source.sharedBy,
    sharedWithMembers: Boolean(source.sharedWithMembers),
    lastReadAt,
    readHere,
    brokerFee: visibleBrokerFee(source),
  };
}

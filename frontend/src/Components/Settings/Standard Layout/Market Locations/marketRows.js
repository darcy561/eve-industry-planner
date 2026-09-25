import { formatTimeSince } from "../../../../Functions/Helper/numberParser";
import { SOURCE_KIND } from "../../../../Functions/MarketData/registry/marketSources.js";
import {
  MARKET_READ_OUTCOME,
  readerCanAct,
} from "../../../../Functions/MarketData/registry/marketReadOutcome.js";

/**
 * A summarised market as the table draws it.
 *
 * Kept apart from the summary itself, which says what is true of a market. This
 * says how to put it in words, and is the only place that does.
 */

/**
 * Who shared a market, in words the reader can place themselves in.
 *
 * From the owner's kind rather than its name: an owner key carries a reference
 * to an entity, and turning one into "Karmafleet" costs a round trip this panel
 * does not otherwise need. A reader is in one corporation and one alliance, so
 * the kind alone says which it came from.
 *
 * @param {string} [sharedBy] - An owner key, `kind:id`
 * @returns {string|undefined} undefined for a market the reader saved
 */
export function sharedByLabel(sharedBy) {
  switch (String(sharedBy ?? "").split(":")[0]) {
    case "corporation":
      return "Your corporation";
    case "alliance":
      return "Your alliance";
    case "planner":
      return "A planner";
    default:
      return undefined;
  }
}

/**
 * What sort of place a market is, in words.
 *
 * From the kind rather than from the place a row holds: the kind is decided
 * once, where a market becomes a source, and every reader asks it rather than
 * each working it out again from a field.
 *
 * @param {string} [kind] - One of SOURCE_KIND
 * @returns {string}
 */
export function placeLabel(kind) {
  return kind === SOURCE_KIND.CITADEL ? "Citadel" : "NPC station";
}

/**
 * Why a market's prices are not arriving, where that is something the reader can
 * do something about.
 *
 * Only the two outcomes a reader can act on are worded. A read that failed is
 * ESI's problem or the app's and the next turn may answer, so saying it here
 * would send a reader off to fix something that is not broken; a market nothing
 * has read yet is not a fault at all.
 *
 * The explanation says what to do rather than restating the label, because the
 * label is already on screen and a tooltip repeating it is worth nothing.
 *
 * @param {string} [readOutcome] - One of MARKET_READ_OUTCOME
 * @returns {{label: string, explain: string}|undefined}
 */
export function readProblem(readOutcome) {
  // Which outcomes a reader can act on is decided once, beside the outcomes
  // themselves; this only supplies the words for the ones that are.
  if (!readerCanAct(readOutcome)) return undefined;

  switch (readOutcome) {
    case MARKET_READ_OUTCOME.REFUSED:
      return {
        label: "No character can dock here",
        explain:
          "Every character on this account was refused when it asked this structure for its orders. Link or authorise one that can dock there and its prices arrive on the next refresh.",
      };
    case MARKET_READ_OUTCOME.UNASKABLE:
      return {
        label: "No character can be asked",
        explain:
          "No character on this account is authorised to read market orders inside player structures. Authorise one and its prices arrive on the next refresh.",
      };
    default:
      return undefined;
  }
}

/**
 * One market as a row of the table.
 *
 * Whether it can be changed is not among what it carries: that depends on
 * settings still being read as the panel draws, so it is decided at render
 * rather than fixed here.
 *
 * @param {import("./marketSummary").MarketSummary} summary
 * @param {object} [options]
 * @param {number} [options.now]
 * @returns {object}
 */
export function marketRow(summary, { now } = {}) {
  return {
    id: summary.id,
    name: summary.name,
    kind: summary.kind,
    placeLabel: placeLabel(summary.kind),
    lastReadAt: summary.lastReadAt,
    lastReadLabel: formatTimeSince(summary.lastReadAt, { now }),
    readHere: summary.readHere,
    readOutcome: summary.readOutcome,
    readProblem: readProblem(summary.readOutcome),
    brokerFee: summary.brokerFee,
    sharedBy: summary.sharedBy,
    sharedByLabel: sharedByLabel(summary.sharedBy),
    sharedWithMembers: summary.sharedWithMembers,
  };
}

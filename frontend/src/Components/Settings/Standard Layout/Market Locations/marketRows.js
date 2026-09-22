import { formatTimeSince } from "../../../../Functions/Helper/numberParser";
import { SOURCE_KIND } from "../../../../Functions/MarketData/marketSources";

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
    brokerFee: summary.brokerFee,
    sharedBy: summary.sharedBy,
    sharedByLabel: sharedByLabel(summary.sharedBy),
    sharedWithMembers: summary.sharedWithMembers,
  };
}

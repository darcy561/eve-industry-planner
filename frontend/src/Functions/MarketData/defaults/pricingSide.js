import GLOBAL_CONFIG from "../../../global-config-app";
import { EXIT_ROUTE } from "../../Job/returns";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * Which side of a job is being priced. Not which side of the order book — that
 * is the order type, and the two disagree: materials being bought are normally priced
 * from the sell side, because the ask is what buying costs.
 */
export const PRICING_SIDE = {
  BUYING: "buying",
  SELLING: "selling",
};

/**
 * Which side of the book each route out reads.
 *
 * The selling side names a route rather than an order type because a route answers two
 * questions an order type cannot answer alone: which side of the book a figure comes
 * from, and whether a broker fee is charged. Listing pays fee and tax; selling
 * into bids pays tax only, because nothing is listed.
 */
const ORDER_TYPE_FOR_EXIT = {
  [EXIT_ROUTE.LISTED]: "sell",
  [EXIT_ROUTE.IMMEDIATE]: "buy",
};

/**
 * The order type a route prices on.
 *
 * The selling side stores a route rather than an order type, so this is the one place
 * that turns one into the other — a second copy would let a quoted price
 * disagree with the fee quoted beside it.
 *
 * @param {string|null|undefined} exit - One of EXIT_ROUTE
 * @returns {string|undefined}
 */
export function orderTypeForExit(exit) {
  return ORDER_TYPE_FOR_EXIT[exit];
}

/**
 * The sides a control offers, named for what is being priced rather than for the
 * side itself: an order type is also called buy or sell, so "buying market" beside a
 * order type of "Sell Orders" reads as a contradiction when it is the normal case.
 */
export const PRICING_SIDES = [
  { side: PRICING_SIDE.BUYING, noun: "Materials" },
  { side: PRICING_SIDE.SELLING, noun: "Output" },
];

/**
 * Which rung of the ladder answered an axis.
 *
 * Only the rungs `resolvePricingSideRungs` itself walks are named: the row
 * override above it and the group walk below are applied by the caller holding
 * the data for them, so neither is ever returned from here.
 */
export const PRICING_RUNG = {
  JOB: "job",
  ACCOUNT: "account",
  GLOBAL: "global",
};

/**
 * Where one side of a job is priced: the job's own choice, then the account's
 * default, then the global one.
 *
 * Market and order type resolve independently, so a job naming a market without a
 * order type keeps the account's order type rather than losing it. An empty value is not a
 * choice at any rung — that rule is what lets a stored document leave a field out
 * rather than having to carry a placeholder.
 *
 * @param {object} params
 * @param {object|null|undefined} params.jobPricing - `build.localPricing`
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {string} params.side - One of PRICING_SIDE
 * @returns {{marketLocation: string, orderType: string}}
 */
export function resolvePricingSide({ jobPricing, accountPricing, side }) {
  const { marketLocation, orderType } = resolvePricingSideRungs({
    jobPricing,
    accountPricing,
    side,
  });

  return { marketLocation, orderType };
}

/**
 * Which rung answered each axis, alongside the value it answered with.
 *
 * A caller that has a rung of its own to insert underneath — the market group
 * walk, which outranks the account default but not the job's own choice — cannot
 * work from the resolved value alone: "jita" says nothing about whether the job
 * named it or the account did, and the group rung must beat one and not the
 * other. So the rung is reported and the caller decides, rather than every rung
 * being collapsed here.
 *
 * The value is still resolved for a caller that has nothing to insert, so the two
 * can never disagree about the ladder.
 *
 * @param {object} params
 * @param {object|null|undefined} params.jobPricing - `build.localPricing`
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {string} params.side - One of PRICING_SIDE
 * @returns {{marketLocation: string, orderType: string,
 *   marketLocationRung: string, orderTypeRung: string}}
 */
export function resolvePricingSideRungs({ jobPricing, accountPricing, side }) {
  const job = jobPricing?.[side];
  const account = accountPricing?.[side];

  const marketAnswer = answer(
    job?.market,
    account?.market,
    DEFAULT_MARKET_OPTION,
  );
  // The selling side answers its order type with a route; the buying side stores one
  // directly. A job's own order type still outranks either, because a job that named
  // one has answered for itself.
  const orderTypeAnswer = answer(
    job?.orderType,
    account?.orderType || orderTypeForExit(account?.exit),
    DEFAULT_ORDER_TYPE,
  );

  return {
    marketLocation: marketAnswer.value,
    orderType: orderTypeAnswer.value,
    marketLocationRung: marketAnswer.rung,
    orderTypeRung: orderTypeAnswer.rung,
  };
}

/** The first rung naming a value, and which one it was. */
function answer(job, account, global) {
  if (job) return { value: job, rung: PRICING_RUNG.JOB };
  if (account) return { value: account, rung: PRICING_RUNG.ACCOUNT };
  return { value: global, rung: PRICING_RUNG.GLOBAL };
}

/**
 * A job's pricing override with one field of one side set.
 *
 * Returns null once the last choice is cleared, so a job that has chosen nothing
 * carries no override at all rather than an empty pair on every document.
 *
 * @param {object|null|undefined} jobPricing - `build.localPricing`
 * @param {string} side - One of PRICING_SIDE
 * @param {"market"|"orderType"} key
 * @param {string|null|undefined} value
 * @returns {object|null}
 */
export function setJobPricingSide(jobPricing, side, key, value) {
  const next = {
    buying: { market: null, orderType: null, ...jobPricing?.buying },
    selling: { market: null, orderType: null, ...jobPricing?.selling },
  };
  next[side] = { ...next[side], [key]: value || null };

  const chosen = Object.values(next).some((one) => one.market || one.orderType);

  return chosen ? next : null;
}

/**
 * A side's group table with one group's field set.
 *
 * Returns undefined once the last choice is cleared, at either level: a group
 * that names nothing is dropped from the table, and a table with nothing in it is
 * dropped from the side. An empty entry would otherwise sit in the stored
 * document answering nothing, and the walk reads an empty value as no choice
 * anyway — so keeping it would be a row a reader could see and not use.
 *
 * @param {Object<string, {market?: string, orderType?: string}>|null|undefined} groups
 * @param {number|string} groupID
 * @param {"market"|"orderType"|"exit"} key - The selling side's groups name a route
 *   in place of an order type, as the side itself does
 * @param {string|null|undefined} value
 * @returns {Object<string, {market?: string, orderType?: string, exit?: string}>|undefined}
 */
export function setGroupPricing(groups, groupID, key, value) {
  const id = String(groupID);
  const next = { ...groups };
  const entry = { ...next[id], [key]: value || undefined };

  if (!entry.market && !entry.orderType && !entry.exit) {
    delete next[id];
  } else {
    next[id] = entry;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * How far a walk may climb before it stops looking.
 *
 * EVE's market tree is a handful of levels deep, so a walk longer than this has
 * met a cycle the published data should not contain. Stopping is better than
 * hanging on a row that renders once per material.
 */
const MAX_GROUP_DEPTH = 32;

/**
 * The nearest market group default above an item, for one side of a job.
 *
 * Market and order type are answered separately and each stops at the first group
 * that names it, so a group naming a market without an order type narrows one axis and
 * leaves the other to whatever answers next. A nearer group outranks a further
 * one, which is the same rule every other rung uses.
 *
 * @param {object} params
 * @param {number|undefined} params.marketGroupID - The item's own market group
 * @param {Object<string, {parent_id?: number}>} params.marketGroups - The tree
 * @param {Object<string, {market?: string, orderType?: string}>} [params.groupDefaults]
 * @returns {{marketLocation: string|null, orderType: string|null}}
 */
export function resolveGroupDefault({
  marketGroupID,
  marketGroups,
  groupDefaults,
}) {
  const answer = { marketLocation: null, orderType: null };
  if (!marketGroupID || !groupDefaults) return answer;

  let id = marketGroupID;
  for (let step = 0; step < MAX_GROUP_DEPTH && id; step += 1) {
    const chosen = groupDefaults[String(id)];
    if (chosen) {
      answer.marketLocation ||= chosen.market || null;
      // A group answers its side's own axis: the selling side names a route out,
      // which decides the order type, and the buying side names the order type directly.
      // Both reach the caller as an order type, because that is what a price is read
      // on — the route's other half, the broker fee, belongs to the side rather
      // than to a group beneath it.
      answer.orderType ||=
        chosen.orderType || orderTypeForExit(chosen.exit) || null;
      if (answer.marketLocation && answer.orderType) return answer;
    }
    id = marketGroups?.[String(id)]?.parent_id;
  }

  return answer;
}

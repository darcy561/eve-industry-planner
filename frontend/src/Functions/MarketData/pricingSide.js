import GLOBAL_CONFIG from "../../global-config-app";
import { EXIT_ROUTE } from "./returns.js";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

/**
 * Which side of a job is being priced. Not which side of the order book — that
 * is the basis, and the two disagree: materials being bought are normally priced
 * from the sell side, because the ask is what buying costs.
 */
export const PRICING_SIDE = {
  BUYING: "buying",
  SELLING: "selling",
};

/**
 * Which side of the book each route out reads.
 *
 * The selling side names a route rather than a basis because a route answers two
 * questions a basis cannot answer alone: which side of the book a figure comes
 * from, and whether a broker fee is charged. Listing pays fee and tax; selling
 * into bids pays tax only, because nothing is listed.
 */
const BASIS_FOR_EXIT = {
  [EXIT_ROUTE.LISTED]: "sell",
  [EXIT_ROUTE.IMMEDIATE]: "buy",
};

/**
 * The basis a route prices on.
 *
 * The selling side stores a route rather than a basis, so this is the one place
 * that turns one into the other — a second copy would let a quoted price
 * disagree with the fee quoted beside it.
 *
 * @param {string|null|undefined} exit - One of EXIT_ROUTE
 * @returns {string|undefined}
 */
export function basisForExit(exit) {
  return BASIS_FOR_EXIT[exit];
}

/**
 * The sides a control offers, named for what is being priced rather than for the
 * side itself: a basis is also called buy or sell, so "buying market" beside a
 * basis of "Sell Orders" reads as a contradiction when it is the normal case.
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
 * Market and basis resolve independently, so a job naming a market without a
 * basis keeps the account's basis rather than losing it. An empty value is not a
 * choice at any rung — that rule is what lets a stored document leave a field out
 * rather than having to carry a placeholder.
 *
 * @param {object} params
 * @param {object|null|undefined} params.jobPricing - `layout.localPricing`
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {string} params.side - One of PRICING_SIDE
 * @returns {{marketDisplay: string, orderDisplay: string}}
 */
export function resolvePricingSide({ jobPricing, accountPricing, side }) {
  const { marketDisplay, orderDisplay } = resolvePricingSideRungs({
    jobPricing,
    accountPricing,
    side,
  });

  return { marketDisplay, orderDisplay };
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
 * @param {object|null|undefined} params.jobPricing - `layout.localPricing`
 * @param {object|null|undefined} params.accountPricing - `defaultPricing`
 * @param {string} params.side - One of PRICING_SIDE
 * @returns {{marketDisplay: string, orderDisplay: string,
 *   marketRung: string, orderRung: string}}
 */
export function resolvePricingSideRungs({ jobPricing, accountPricing, side }) {
  const job = jobPricing?.[side];
  const account = accountPricing?.[side];

  const market = answer(job?.market, account?.market, DEFAULT_MARKET_OPTION);
  // The selling side answers its basis with a route; the buying side stores one
  // directly. A job's own basis still outranks either, because a job that named
  // one has answered for itself.
  const basis = answer(
    job?.basis,
    account?.basis || basisForExit(account?.exit),
    DEFAULT_ORDER_OPTION,
  );

  return {
    marketDisplay: market.value,
    orderDisplay: basis.value,
    marketRung: market.rung,
    orderRung: basis.rung,
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
 * @param {object|null|undefined} jobPricing - `layout.localPricing`
 * @param {string} side - One of PRICING_SIDE
 * @param {"market"|"basis"} key
 * @param {string|null|undefined} value
 * @returns {object|null}
 */
export function setJobPricingSide(jobPricing, side, key, value) {
  const next = {
    buying: { market: null, basis: null, ...jobPricing?.buying },
    selling: { market: null, basis: null, ...jobPricing?.selling },
  };
  next[side] = { ...next[side], [key]: value || null };

  const chosen = Object.values(next).some((one) => one.market || one.basis);

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
 * @param {Object<string, {market?: string, basis?: string}>|null|undefined} groups
 * @param {number|string} groupID
 * @param {"market"|"basis"} key
 * @param {string|null|undefined} value
 * @returns {Object<string, {market?: string, basis?: string}>|undefined}
 */
export function setGroupPricing(groups, groupID, key, value) {
  const id = String(groupID);
  const next = { ...groups };
  const entry = { ...next[id], [key]: value || undefined };

  if (!entry.market && !entry.basis) {
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
 * Market and basis are answered separately and each stops at the first group
 * that names it, so a group naming a market without a basis narrows one axis and
 * leaves the other to whatever answers next. A nearer group outranks a further
 * one, which is the same rule every other rung uses.
 *
 * @param {object} params
 * @param {number|undefined} params.marketGroupID - The item's own market group
 * @param {Object<string, {parent_id?: number}>} params.marketGroups - The tree
 * @param {Object<string, {market?: string, basis?: string}>} [params.groupDefaults]
 * @returns {{market: string|null, basis: string|null}}
 */
export function resolveGroupDefault({
  marketGroupID,
  marketGroups,
  groupDefaults,
}) {
  const answer = { market: null, basis: null };
  if (!marketGroupID || !groupDefaults) return answer;

  let id = marketGroupID;
  for (let step = 0; step < MAX_GROUP_DEPTH && id; step += 1) {
    const chosen = groupDefaults[String(id)];
    if (chosen) {
      answer.market ||= chosen.market || null;
      answer.basis ||= chosen.basis || null;
      if (answer.market && answer.basis) return answer;
    }
    id = marketGroups?.[String(id)]?.parent_id;
  }

  return answer;
}

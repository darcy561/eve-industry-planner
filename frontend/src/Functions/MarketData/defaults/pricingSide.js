import GLOBAL_CONFIG from "../../../global-config-app";
import { EXIT_ROUTE } from "../../Job/returns";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * Which side of a job is being priced, which is not which side of the order book
 * — that is the order type, and the two disagree.
 */
export const PRICING_SIDE = {
  BUYING: "buying",
  SELLING: "selling",
};

/**
 * Which side of the book each route out reads, a route also saying whether a
 * broker fee is charged where an order type cannot.
 */
const ORDER_TYPE_FOR_EXIT = {
  [EXIT_ROUTE.LISTED]: "sell",
  [EXIT_ROUTE.IMMEDIATE]: "buy",
};

/**
 * The order type a route prices on, this being the one place that turns one into
 * the other.
 *
 * @param {string|null|undefined} exit - One of EXIT_ROUTE
 * @returns {string|undefined}
 */
export function orderTypeForExit(exit) {
  return ORDER_TYPE_FOR_EXIT[exit];
}

/**
 * The sides a control offers, named for what is being priced rather than for the
 * side itself, an order type being called buy or sell too.
 */
export const PRICING_SIDES = [
  { side: PRICING_SIDE.BUYING, noun: "Materials" },
  { side: PRICING_SIDE.SELLING, noun: "Output" },
];

/**
 * Which rung of the ladder answered an axis, naming only the rungs
 * `resolvePricingSideRungs` itself walks.
 */
export const PRICING_RUNG = {
  JOB: "job",
  ACCOUNT: "account",
  GLOBAL: "global",
};

/**
 * Where one side of a job is priced: the job's own choice, then the account's
 * default, then the global one, each axis resolving independently.
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
 * Which rung answered each axis, alongside the value it answered with, for a
 * caller that has a rung of its own to insert underneath.
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
 * A choice worth storing as an override, or undefined where it only repeats the
 * default beneath it.
 *
 * @param {string|null|undefined} chosen
 * @param {string|null|undefined} beneath - What the ladder answers without it
 * @returns {string|null|undefined}
 */
export function overrideUnlessDefault(chosen, beneath) {
  return chosen === beneath ? undefined : chosen;
}

/**
 * A job's pricing override with one field of one side set, and null once the last
 * choice is cleared.
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
 * A side's group table with one group's field set, and undefined once the last
 * choice is cleared, at either level.
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
 * How far a walk may climb before it stops looking. EVE's market tree is a
 * handful of levels deep.
 */
const MAX_GROUP_DEPTH = 32;

/**
 * The nearest market group default above an item, for one side of a job, each
 * axis stopping at the first group that names it.
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
      answer.orderType ||=
        chosen.orderType || orderTypeForExit(chosen.exit) || null;
      if (answer.marketLocation && answer.orderType) return answer;
    }
    id = marketGroups?.[String(id)]?.parent_id;
  }

  return answer;
}

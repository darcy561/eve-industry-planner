import {
  purchaseComplete,
  purchasedCost,
  quantityPurchased,
} from "../../../Components/Edit Job/Edit Job Hooks/materialSelectors";
import { ORDER_TYPES } from "../../../Context/defaultValues";
import { MATERIAL_PLAN } from "../../Job/figures/materialSourcingRow.js";
import { PRICING_RUNG, resolveGroupDefault } from "./pricingSide";

/**
 * What answering the market-group rung takes: the tree, the account's table
 * against it, and which rung each axis was answered by.
 *
 * @typedef {object} GroupRungContext
 * @property {Object<string, {parent_id?: number}>} marketGroups - The tree
 * @property {Object<string, {market?: string, orderType?: string}>} groupDefaults -
 *   The account side's group table
 * @property {(typeID: number) => number|undefined} marketGroupOf - An item's own
 *   market group
 * @property {string} marketLocationRung - Which rung answered defaultMarketLocation
 * @property {string} orderTypeRung - Which rung answered defaultOrderType
 */

/**
 * Which hub and order type apply to one material row, a row's own override
 * outranking the panel default on each axis independently.
 *
 * @param {object} build - The job's build, holding materialPriceOverrides
 * @param {number} materialTypeID
 * @param {string} defaultMarketLocation
 * @param {string} defaultOrderType
 * @param {GroupRungContext} [groupPricing] - Absent until the tree has loaded, which
 *   is a normal early state: the ladder then reads as it did before rung 3
 * @returns {{marketLocation: string, orderType: string}}
 */
export function getEffectiveMaterialPriceHub(
  build,
  materialTypeID,
  defaultMarketLocation,
  defaultOrderType,
  groupPricing,
) {
  const override = build?.materialPriceOverrides?.[materialTypeID];

  const group = groupPricing
    ? resolveGroupDefault({
        marketGroupID: groupPricing.marketGroupOf?.(materialTypeID),
        marketGroups: groupPricing.marketGroups,
        groupDefaults: groupPricing.groupDefaults,
      })
    : null;

  return {
    marketLocation:
      override?.marketDisplay ??
      beneathTheJob(group?.marketLocation, groupPricing?.marketLocationRung) ??
      defaultMarketLocation,
    orderType:
      override?.orderDisplay ??
      beneathTheJob(group?.orderType, groupPricing?.orderTypeRung) ??
      defaultOrderType,
  };
}

/**
 * Marks an axis as one the group rung may not answer, for a caller varying that
 * axis itself.
 */
const SUPPRESSED = "suppressed";

/**
 * A group's answer, where what it would displace is something it outranks. An
 * unnamed rung yields too.
 *
 * @param {string|null|undefined} chosen
 * @param {string|undefined} rung - The rung that answered the panel default
 * @returns {string|undefined}
 */
function beneathTheJob(chosen, rung) {
  if (!chosen) return undefined;
  return rung === PRICING_RUNG.ACCOUNT || rung === PRICING_RUNG.GLOBAL
    ? chosen
    : undefined;
}

/**
 * @typedef {object} OrderTypeOption
 * @property {string} id - One of the ORDER_TYPES ids
 * @property {string} label - Display name
 * @property {number} total - What the job's materials cost on this orderType
 * @property {number} delta - That total less the current orderType's total
 * @property {boolean} isCurrent - Whether this is the orderType in effect
 */

/**
 * What the job's materials cost on each of the four bases, a material carrying
 * its own override keeping it on every one.
 *
 * @param {object} params
 * @param {Array<{typeID: number, quantity: number}>} params.rows - The rows the
 *   panel draws, each stating how many the job takes
 * @param {object} params.build - The job's build, holding materialPriceOverrides
 * @param {string} params.marketLocation - The market in effect
 * @param {string} params.orderType - The order type in effect
 * @param {(typeID: number, hub: string, orderType: string) => number} params.getPrice
 * @param {GroupRungContext} [params.groupPricing]
 * @returns {OrderTypeOption[]}
 */
export function materialCostByOrderType({
  rows: materialRows,
  build,
  marketLocation,
  orderType,
  getPrice,
  groupPricing,
}) {
  const rows = Array.isArray(materialRows) ? materialRows : [];

  const perCandidate = groupPricing && {
    ...groupPricing,
    orderTypeRung: SUPPRESSED,
  };

  const totalOn = (candidate) =>
    rows.reduce((total, material) => {
      const resolved = getEffectiveMaterialPriceHub(
        build,
        material.typeID,
        marketLocation,
        candidate,
        perCandidate,
      );
      const price = getPrice(
        material.typeID,
        resolved.marketLocation,
        resolved.orderType,
      );
      return total + price * material.quantity;
    }, 0);

  const totalsById = new Map(
    ORDER_TYPES.map((entry) => [entry.id, totalOn(entry.id)]),
  );
  const current = totalsById.get(orderType) ?? 0;

  return ORDER_TYPES.map((entry) => {
    const total = totalsById.get(entry.id) ?? 0;
    return {
      id: entry.id,
      label: entry.name,
      caption: entry.caption,
      description: entry.description,
      total,
      delta: total - current,
      isCurrent: entry.id === orderType,
    };
  });
}

/**
 * How many rows are not on the panel's order type, and how many are not
 * estimates at all, an override being invisible otherwise.
 *
 * @param {Array<object>} rows - Rows from buildMaterialSourcingRow
 * @param {string} marketLocation - The panel's market
 * @param {string} orderType - The panel's order type
 * @returns {{overridden: number, purchased: number}}
 */
export function summariseOrderTypeUse(rows, marketLocation, orderType) {
  const list = Array.isArray(rows) ? rows : [];

  return {
    overridden: list.filter(
      (row) =>
        (row.marketLocation && row.marketLocation !== marketLocation) ||
        (row.orderType && row.orderType !== orderType),
    ).length,
    purchased: list.filter((row) => row.plan === MATERIAL_PLAN.PAID).length,
  };
}

/**
 * @typedef {object} MaterialPurchaseState
 * @property {'paid'|'part-paid'|'estimated'} kind
 * @property {number} paidCost - What the job is charged for what was bought
 * @property {number} paidQuantity - How many of the requirement that covered
 * @property {number} remainingQuantity - How many are still to buy
 */

/**
 * Whether a row is still an estimate, reports what was actually paid, or is both
 * where the material was bought in part.
 *
 * @param {object} material - A material row as the job stores it
 * @param {number} requirement - How many of it the job's setups call for
 * @returns {MaterialPurchaseState}
 */
export function materialPurchaseState(material, requirement = 0) {
  const paidQuantity = quantityPurchased(material, requirement);
  const paidCost = purchasedCost(material, requirement);
  const remainingQuantity = Math.max(0, requirement - paidQuantity);

  if (purchaseComplete(material, requirement)) {
    return { kind: "paid", paidCost, paidQuantity, remainingQuantity: 0 };
  }
  if (paidQuantity > 0) {
    return { kind: "part-paid", paidCost, paidQuantity, remainingQuantity };
  }
  return { kind: "estimated", paidCost: 0, paidQuantity: 0, remainingQuantity };
}

/**
 * How old the figures a job is priced against are, taken from the oldest
 * material because a total is only as fresh as the stalest price in it.
 *
 * @param {Array<{typeID: number}>} materials
 * @param {(typeID: number) => number|undefined} refreshedAt - When a type's
 *   figures were last refreshed. Passed in rather than imported, so this module
 *   stays free of the store and testable without one
 * @returns {number|null} Milliseconds since the oldest was refreshed, or null
 *   where nothing has a timestamp
 */
export function priceAge(materials = [], refreshedAt) {
  let oldest = null;

  for (const material of materials) {
    const updated = refreshedAt?.(material.typeID);
    if (!Number.isFinite(updated) || updated <= 0) continue;
    if (oldest === null || updated < oldest) oldest = updated;
  }

  return oldest === null ? null : Date.now() - oldest;
}

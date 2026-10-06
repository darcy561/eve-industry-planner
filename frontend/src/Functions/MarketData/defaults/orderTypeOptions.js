import { ORDER_TYPES } from "../../../Context/defaultValues";

/**
 * @typedef {object} OrderTypeOption
 * @property {string} id - One of the ORDER_TYPES ids
 * @property {string} label - Display name
 * @property {string} [caption]
 * @property {string} [description]
 * @property {number} total - What the figure comes to on this order type
 * @property {number} delta - That total less the current order type's total
 * @property {boolean} isCurrent - Whether this is the order type in effect
 */

/**
 * Each order type with what a figure comes to on it and how far that sits from the one in effect.
 *
 * @param {(orderType: string) => number} totalOn - The figure on one order type
 * @param {string} orderType - The order type in effect
 * @returns {OrderTypeOption[]}
 */
export function orderTypeOptions(totalOn, orderType) {
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

import { sameID } from "../../Helper/ids";
import { readStoredOrders } from "../prices/priceStore.js";

/** What a surface waiting on these orders is keyed under. */
export const CITADEL_ORDERS_QUERY_KEY = ["citadelOrders"];

/**
 * Every order for one type across a set of citadels, selected from what the
 * rotation last read and never fetched.
 *
 * @param {import("../registry/marketSources.js").MarketSource[]} citadels - The markets to
 *   read, already narrowed to the region in question
 * @param {number|string} typeID
 * @returns {Promise<Array<object>>} Orders as ESI returned them, in no
 *   particular order
 */
export async function ordersForTypeAtCitadels(citadels, typeID) {
  if (!typeID) return [];

  const perMarket = await Promise.all(
    (citadels ?? []).map(async (citadel) => {
      const held = await readStoredOrders(citadel.id);
      return (held?.orders ?? []).filter((order) =>
        sameID(order.type_id, typeID),
      );
    }),
  );

  return perMarket.flat();
}

import { sameID } from "../../Helper/ids";
import { readStoredOrders } from "../prices/priceStore.js";

/**
 * One type's orders at the citadels a reader has saved, from what was last read
 * for each of them.
 *
 * **Read, never fetched.** ESI has no per-type form of the structure endpoint,
 * so a type's orders can only be had by walking the whole market — up to thirty
 * pages for one structure. The rotation already walks every saved citadel on a
 * schedule and keeps what it read, so asking here is a matter of selecting from
 * what is held. A surface that fetched on being opened would spend that walk to
 * answer about one type and would do it again for the next type a reader looked
 * at.
 *
 * A citadel nothing has read yet contributes nothing rather than an absence to
 * report: the reader is looking at a region, and a market missing from it is not
 * an error in what the rest of the region says.
 */

/** What a surface waiting on these orders is keyed under. */
export const CITADEL_ORDERS_QUERY_KEY = ["citadelOrders"];

/**
 * Every order for one type across a set of citadels.
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

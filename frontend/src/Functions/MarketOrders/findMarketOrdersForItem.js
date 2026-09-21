import useUsersStore from "../../Zustand/usersStore";
import { getAllCachedCharacterMarketOrders } from "../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import { getAllCachedCharacterHistoricMarketOrders } from "../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import { getAllCachedCorporationMarketOrders } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { getAllCachedCorporationHistoricMarketOrders } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";

/**
 * Finds market orders for a specific item from cached character and corporation data.
 * Searches through active and historic orders, handling corporation order precedence
 * and filtering based on linked orders and temporary modifications.
 *
 * @param {Object} queryClient - React Query client for data access
 * @param {number} itemID - The item whose orders are wanted
 * @param {Array<number>} [temporaryOrderIDsToAdd=[]] - Temporary order IDs to add
 * @param {Array<number>} [temporaryOrderIDsToRemove=[]] - Temporary order IDs to remove
 * @returns {Array<Object>} Array of matching market orders
 */
export default function findMarketOrdersForItem(
  queryClient,
  itemID,
  temporaryOrderIDsToAdd = [],
  temporaryOrderIDsToRemove = [],
) {
  const { linkedOrders, characters } = useUsersStore.getState().account;

  // A corporation's list carries every member's orders, and only the member who issued one has the
  // skills and standings its broker fee is worked out from. An order this account cannot attribute
  // would be priced at the base rate and that figure written onto the job, so it is not offered.
  const hashByCharacterID = new Map(
    (characters ?? []).map(({ CharacterID, CharacterHash }) => [
      CharacterID,
      CharacterHash,
    ]),
  );

  /**
   * The account character that issued an order, or null when another member did.
   *
   * @param {Object} order
   * @returns {string|null}
   */
  function issuingCharacterHash(order) {
    if (!order.is_corporation) return order.CharacterHash ?? null;
    return hashByCharacterID.get(order.issued_by) ?? null;
  }

  const { data: characterMarketOrders } =
    getAllCachedCharacterMarketOrders(queryClient);
  const { data: characterHistoricMarketOrders } =
    getAllCachedCharacterHistoricMarketOrders(queryClient);
  const { data: corpMarketOrders } =
    getAllCachedCorporationMarketOrders(queryClient);
  const { data: corpHistoricMarketOrders } =
    getAllCachedCorporationHistoricMarketOrders(queryClient);

  // One row per order. ESI reports the same order on the character wallet and
  // the corporation wallet, and again in the historic list once it closes, so
  // without this the panel offers it two or three times over.
  //
  // The corporation's reading owns a corporation order, whichever arrives
  // first; otherwise the first reading wins, which is the live list.
  const byOrderID = new Map();

  [
    ...Object.values(characterMarketOrders),
    ...Object.values(characterHistoricMarketOrders),
    ...Object.values(corpMarketOrders),
    ...Object.values(corpHistoricMarketOrders),
  ]
    .flat()
    .forEach((order) => {
      if (!orderCriteria(order)) return;

      const characterHash = issuingCharacterHash(order);
      if (!characterHash) return;

      const held = byOrderID.get(order.order_id);
      if (!held || (order.is_corporation && !held.is_corporation)) {
        // Carried on the row so the fee is worked out from the member who issued the order rather
        // than from whichever token fetched the corporation's list.
        byOrderID.set(order.order_id, {
          ...order,
          CharacterHash: characterHash,
        });
      }
    });

  const matchingMarketOrders = [...byOrderID.values()];

  /**
   * Determines if an order matches the criteria for the input job.
   * Checks item type, linked status, and temporary modifications.
   *
   * @param {Object} order - Market order to evaluate
   * @returns {boolean} True if order matches criteria, false otherwise
   *
   * @private
   */
  function orderCriteria(order) {
    // Must be the correct item type
    if (order.type_id !== itemID) {
      return false;
    }

    const orderId = order.order_id;
    const isLinked = linkedOrders.has(orderId);
    const isBeingRemoved = temporaryOrderIDsToRemove.includes(orderId);
    const isInAddTemp = temporaryOrderIDsToAdd.includes(orderId);

    // If linked to another job and not flagged for removal, exclude it
    if (isLinked && !isBeingRemoved) {
      return false;
    }

    // If in temporary add list and not flagged for removal, exclude it
    if (isInAddTemp && !isBeingRemoved) {
      return false;
    }

    return true;
  }

  return matchingMarketOrders;
}

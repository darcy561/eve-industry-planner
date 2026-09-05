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
 * @param {Object} inputJob - Job object containing itemID to search for
 * @param {Array<number>} [temporaryOrderIDsToAdd=[]] - Temporary order IDs to add
 * @param {Array<number>} [temporaryOrderIDsToRemove=[]] - Temporary order IDs to remove
 * @returns {Array<Object>} Array of matching market orders
 * 
 * @example
 * const orders = findMarketOrdersForItem(
 *   queryClient,
 *   { itemID: 34 },
 *   [],
 *   []
 * );
 * console.log(orders.length); // Number of matching orders
 */
export default function findMarketOrdersForItem(
  queryClient,
  inputJob,
  temporaryOrderIDsToAdd = [],
  temporaryOrderIDsToRemove = []
) {
  const linkedOrders = useUsersStore.getState().account.linkedOrders;

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

      const held = byOrderID.get(order.order_id);
      if (!held || (order.is_corporation && !held.is_corporation)) {
        byOrderID.set(order.order_id, order);
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
    if (order.type_id !== inputJob.itemID) {
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

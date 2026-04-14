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

  const matchingMarketOrders = [];

  [
    ...Object.values(characterMarketOrders),
    ...Object.values(characterHistoricMarketOrders),
    ...Object.values(corpMarketOrders),
    ...Object.values(corpHistoricMarketOrders),
  ]
    .flat()
    .forEach((order) => {
      if (orderCriteria(order)) {
        // Check if this is a corporation order that should replace a character order
        if (order.is_corporation) {
          // Find and remove any existing character order with the same order_id
          const existingIndex = matchingMarketOrders.findIndex(
            existingOrder => existingOrder.order_id === order.order_id && !existingOrder.is_corporation
          );

          if (existingIndex !== -1) {
            // Replace the character order with the corporation order
            matchingMarketOrders[existingIndex] = order;
          } else {
            // Add the corporation order if no character order exists
            matchingMarketOrders.push(order);
          }
        } else {
          // For character orders, only add if no corporation order already exists
          const hasCorpOrder = matchingMarketOrders.some(
            existingOrder => existingOrder.order_id === order.order_id && existingOrder.is_corporation
          );

          if (!hasCorpOrder) {
            matchingMarketOrders.push(order);
          }
        }
      }
    });

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

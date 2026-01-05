import { useState, useEffect } from "react";
import useUsersStore from "../Zustand/usersStore";
import getWorldData from "../Functions/EveESI/World/getWorldData";
import findMarketOrdersForItem from "../Functions/MarketOrders/findMarketOrdersForItem";
import { useGetAllCharacterMarketOrders } from "./EveEsi/Character/useGetAllCharacterMarketOrders";
import { useGetAllCharacterHistoricMarketOrders } from "./EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import { useGetAllCorporationMarketOrders } from "./EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { useGetAllCorporationHistoricMarketOrders } from "./EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";

/**
 * Updates existing linked market orders with the latest data from ESI
 * Compares current order data with fresh data and updates if changes are detected
 *
 * @param {Array} allOrders - Array of all market orders from ESI
 * @param {Object} activeJob - The current active job containing market orders to update
 * @param {Object} actions - Actions object for updating the active job
 * @returns {void}
 */
function updateLinkedMarketOrdersWithLatestData(allOrders, activeJob, actions) {
  if (!allOrders || !activeJob) return;

  let hasChanges = false;

  activeJob.build.sale.marketOrders.forEach((order) => {
    // Find all orders with the same order_id (could be both character and corporation)
    const matchingOrders = allOrders.filter(
      (newOrder) => newOrder.order_id === order.order_id
    );

    if (matchingOrders.length === 0) return;

    // Prefer corporation order over character order if both exist
    const latestOrderData =
      matchingOrders.find((order) => order.is_corporation) || matchingOrders[0];

    if (!latestOrderData) return;

    if (!order.complete) {
      const shouldBeComplete =
        latestOrderData.volume_remain === 0 ||
        latestOrderData.state === "expired" ||
        latestOrderData.state === "cancelled";

      const newState = latestOrderData.state ? latestOrderData.state : "active";

      if (
        order.volume_remain !== latestOrderData.volume_remain ||
        Date.parse(order.issued) !== Date.parse(latestOrderData.issued) ||
        shouldBeComplete ||
        order?.state !== newState
      ) {
        // Update the existing order object directly
        order.duration = latestOrderData.duration;
        order.item_price = latestOrderData.price;
        order.range = latestOrderData.range;
        order.volume_remain = latestOrderData.volume_remain;
        order.issued = latestOrderData.issued;
        order.timeStamps = [
          ...(order.timeStamps || []),
          latestOrderData.issued,
        ];
        order.complete = shouldBeComplete;
        order.state = newState;

        hasChanges = true;
      }
    }
  });

  // Only update if there are actual changes
  if (hasChanges) {
    actions.updateActiveJob(activeJob);
  }
}

/**
 * Custom hook that gathers market orders and updates existing linked orders with latest ESI data
 *
 * This hook performs several key operations:
 * - Retrieves cached market orders from both character and corporation sources
 * - Finds matching market orders for the active job's item
 * - Updates existing linked market orders with fresh data from ESI
 * - Gathers world data (location names) for all relevant market order locations
 * - Handles loading states and error management
 *
 * @param {Object} queryClient - React Query client instance for cache access
 * @param {Object} activeJob - The current active job containing market orders to update
 * @param {Array} linkedOrders - Array of currently linked market orders
 * @param {Object} esiDataToLink - ESI data object containing market orders to add/remove
 * @param {Object} actions - Actions object for updating the active job and store
 *
 * @returns {Object} Object containing:
 *   - marketOrderMatches: Array of matching market orders found
 *   - isLoading: Boolean indicating if market orders or world data are being loaded
 *   - isError: Boolean indicating if there was an error loading market orders or processing
 *   - error: Error object if an error occurred (from market orders or processing)
 *
 * @example
 * const { marketOrderMatches, isWorldDataLoading, error } =
 *   useGatherMarketOrdersAndUpdateExistingLinkedOrders(
 *     queryClient,
 *     activeJob,
 *     linkedOrders,
 *     esiDataToLink,
 *     actions
 *   );
 */
export function useGatherMarketOrdersAndUpdateExistingLinkedOrders(
  queryClient,
  activeJob,
  linkedOrders,
  esiDataToLink,
  actions
) {
  const [marketOrderMatches, setMarketOrderMatches] = useState([]);
  const [isWorldDataLoading, setIsWorldDataLoading] = useState(false);
  const [error, setError] = useState(null);

  const parentUser = useUsersStore((state) =>
    state.users.actions.findParentUser()
  );

  // Subscribe to market order cache updates using React Query hooks
  // React Query hooks automatically trigger re-renders when cache updates
  const {
    data: characterMarketOrders = {},
    isLoading: isCharacterMarketOrdersLoading,
    isError: isCharacterMarketOrdersError,
    error: characterMarketOrdersError,
  } = useGetAllCharacterMarketOrders();
  const {
    data: characterHistoricMarketOrders = {},
    isLoading: isCharacterHistoricMarketOrdersLoading,
    isError: isCharacterHistoricMarketOrdersError,
    error: characterHistoricMarketOrdersError,
  } = useGetAllCharacterHistoricMarketOrders();
  const {
    data: corporationMarketOrders = {},
    isLoading: isCorporationMarketOrdersLoading,
    isError: isCorporationMarketOrdersError,
    error: corporationMarketOrdersError,
  } = useGetAllCorporationMarketOrders();
  const {
    data: corporationHistoricMarketOrders = {},
    isLoading: isCorporationHistoricMarketOrdersLoading,
    isError: isCorporationHistoricMarketOrdersError,
    error: corporationHistoricMarketOrdersError,
  } = useGetAllCorporationHistoricMarketOrders();

  // Combine all loading and error states
  const isLoading =
    isCharacterMarketOrdersLoading ||
    isCharacterHistoricMarketOrdersLoading ||
    isCorporationMarketOrdersLoading ||
    isCorporationHistoricMarketOrdersLoading ||
    isWorldDataLoading;

  const isError =
    isCharacterMarketOrdersError ||
    isCharacterHistoricMarketOrdersError ||
    isCorporationMarketOrdersError ||
    isCorporationHistoricMarketOrdersError ||
    !!error;

  const combinedError =
    characterMarketOrdersError ||
    characterHistoricMarketOrdersError ||
    corporationMarketOrdersError ||
    corporationHistoricMarketOrdersError ||
    error;

  useEffect(() => {
    async function processGatherMarketOrdersAndUpdateExistingLinkedOrders() {
      if (!queryClient) {
        setMarketOrderMatches([]);
        setError(null);
        return;
      }

      try {
        setIsWorldDataLoading(true);
        setError(null);

        // Use the data directly from the React Query hooks (already subscribed to updates)
        // No need to read from cache again - the hooks provide the latest data

        const allCharacterOrders = [
          ...Object.values(characterMarketOrders),
          ...Object.values(characterHistoricMarketOrders).flat(),
        ].flat();
        const allCorpOrders = [
          ...Object.values(corporationMarketOrders),
          ...Object.values(corporationHistoricMarketOrders).flat(),
        ].flat();
        const allOrders = [...allCharacterOrders, ...allCorpOrders];

        // Use the shared function to find matching market orders
        const matches = findMarketOrdersForItem(
          queryClient,
          activeJob,
          esiDataToLink.marketOrders.add,
          esiDataToLink.marketOrders.remove
        );

        // Filter allOrders to only include orders for the current job's item type
        const jobSpecificOrders = allOrders.filter(
          (order) => order.type_id === activeJob.itemID
        );

        // Update existing linked market orders with latest data
        updateLinkedMarketOrdersWithLatestData(
          jobSpecificOrders,
          activeJob,
          actions
        );

        setMarketOrderMatches(matches);
        // Gather location data for world data
        const allLocationIDs = new Set();

        matches.forEach((order) => {
          if (order.location_id) allLocationIDs.add(order.location_id);
        });

        // Also include locations from existing linked orders
        if (activeJob.build.sale.marketOrders.length > 0) {
          activeJob.build.sale.marketOrders.forEach((order) => {
            if (order.location_id) allLocationIDs.add(order.location_id);
          });
        }

        if (allLocationIDs.size > 0) {
          const locationNames = await getWorldData(allLocationIDs, parentUser);
          useUsersStore
            .getState()
            .worldData.actions.addUniverseIDs(locationNames);
        }

        setIsWorldDataLoading(false);
      } catch (err) {
        console.error(
          "Error in processGatherMarketOrdersAndUpdateExistingLinkedOrders:",
          err
        );
        setError(err);
        setIsWorldDataLoading(false);
      }
    }

    processGatherMarketOrdersAndUpdateExistingLinkedOrders();
  }, [
    queryClient,
    linkedOrders,
    esiDataToLink,
    activeJob.itemID,
    characterMarketOrders,
    characterHistoricMarketOrders,
    corporationMarketOrders,
    corporationHistoricMarketOrders,
  ]);

  return {
    marketOrderMatches,
    isLoading,
    isError,
    error: combinedError,
  };
}

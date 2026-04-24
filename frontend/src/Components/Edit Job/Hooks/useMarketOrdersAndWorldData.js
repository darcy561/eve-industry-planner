import { useState, useEffect } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import findMarketOrdersForItem from "../../../Functions/MarketOrders/findMarketOrdersForItem";
import { useGetAllCharacterMarketOrders } from "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import { useGetAllCharacterHistoricMarketOrders } from "../../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import { useGetAllCorporationMarketOrders } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { useGetAllCorporationHistoricMarketOrders } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";

function updateLinkedMarketOrdersWithLatestData(allOrders, activeJob, actions) {
  if (!allOrders || !activeJob) return;

  let hasChanges = false;
  activeJob.build.sale.marketOrders.forEach((order) => {
    const matchingOrders = allOrders.filter(
      (newOrder) => newOrder.order_id === order.order_id
    );
    if (matchingOrders.length === 0) return;
    const latestOrderData =
      matchingOrders.find((o) => o.is_corporation) || matchingOrders[0];
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
        order.duration = latestOrderData.duration;
        order.item_price = latestOrderData.price;
        order.range = latestOrderData.range;
        order.volume_remain = latestOrderData.volume_remain;
        order.issued = latestOrderData.issued;
        order.timeStamps = [...(order.timeStamps || []), latestOrderData.issued];
        order.complete = shouldBeComplete;
        order.state = newState;
        hasChanges = true;
      }
    }
  });

  if (hasChanges) {
    actions.updateActiveJob(activeJob);
  }
}

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

        const allCharacterOrders = [
          ...Object.values(characterMarketOrders),
          ...Object.values(characterHistoricMarketOrders).flat(),
        ].flat();
        const allCorpOrders = [
          ...Object.values(corporationMarketOrders),
          ...Object.values(corporationHistoricMarketOrders).flat(),
        ].flat();
        const allOrders = [...allCharacterOrders, ...allCorpOrders];

        const matches = findMarketOrdersForItem(
          queryClient,
          activeJob,
          esiDataToLink.marketOrders.add,
          esiDataToLink.marketOrders.remove
        );

        const jobSpecificOrders = allOrders.filter(
          (order) => order.type_id === activeJob.itemID
        );

        updateLinkedMarketOrdersWithLatestData(jobSpecificOrders, activeJob, actions);
        setMarketOrderMatches(matches);

        const allLocationIDs = new Set();
        matches.forEach((order) => {
          if (order.location_id) allLocationIDs.add(order.location_id);
        });
        if (activeJob.build.sale.marketOrders.length > 0) {
          activeJob.build.sale.marketOrders.forEach((order) => {
            if (order.location_id) allLocationIDs.add(order.location_id);
          });
        }

        if (allLocationIDs.size > 0) {
          const locationNames = await getWorldData(
            allLocationIDs,
            useUsersStore.getState().account.actions.getMainCharacter()
          );
          useUsersStore.getState().worldData.actions.addUniverseIDs(locationNames);
        }

        setIsWorldDataLoading(false);
      } catch (err) {
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

import { useState, useEffect, useMemo } from "react";
import useLocationNames from "../../../Hooks/EveEsi/useLocationNames";
import findMarketOrdersForItem from "../../../Functions/MarketOrders/findMarketOrdersForItem";
import applyLatestOrderData from "../../../Functions/MarketOrders/applyLatestOrderData";
import { useGetAllCharacterMarketOrders } from "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import { useGetAllCharacterHistoricMarketOrders } from "../../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import { useGetAllCorporationMarketOrders } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { useGetAllCorporationHistoricMarketOrders } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";
import { asNumberIDSet } from "../../../Functions/Helper/ids";

function updateLinkedMarketOrdersWithLatestData(allOrders, activeJob, actions) {
  if (applyLatestOrderData(activeJob, allOrders)) {
    actions.updateActiveJob(activeJob);
  }
}

export function useGatherMarketOrdersAndUpdateExistingLinkedOrders(
  queryClient,
  activeJob,
  linkedOrders,
  esiDataToLink,
  actions,
) {
  const [marketOrderMatches, setMarketOrderMatches] = useState([]);
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

  const linkedOrderRows = Object.values(activeJob.esi.marketOrders);
  const locationIds = useMemo(
    () =>
      asNumberIDSet(
        [...marketOrderMatches, ...linkedOrderRows].map(
          (order) => order.location_id,
        ),
      ),
    [marketOrderMatches, linkedOrderRows],
  );
  // The panel waits for the names before it draws, rather than drawing rows that say nothing yet.
  // The tabs beneath it read the same per-id cache, so this costs no extra lookup.
  const { isLoading: areNamesLoading } = useLocationNames(locationIds);

  const isLoading =
    isCharacterMarketOrdersLoading ||
    isCharacterHistoricMarketOrdersLoading ||
    isCorporationMarketOrdersLoading ||
    isCorporationHistoricMarketOrdersLoading ||
    areNamesLoading;

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
          esiDataToLink.marketOrders.remove,
        );

        const jobSpecificOrders = allOrders.filter(
          (order) => order.type_id === activeJob.itemID,
        );

        updateLinkedMarketOrdersWithLatestData(
          jobSpecificOrders,
          activeJob,
          actions,
        );
        setMarketOrderMatches(matches);
      } catch (err) {
        setError(err);
      }
    }

    processGatherMarketOrdersAndUpdateExistingLinkedOrders();
    // `activeJob` and `actions` are written to here, not read from: listing the job would re-run the
    // match on every edit the reducer makes to it, including the one this effect itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

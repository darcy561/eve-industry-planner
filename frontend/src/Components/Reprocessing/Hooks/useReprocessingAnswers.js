import { useMemo } from "react";
import { useMarketPricesQuery } from "../../../Hooks/React Query/World/marketPrices.js";
import { readMarketPriceForType } from "../../../Functions/MarketData/prices/marketPriceForType.js";
import { reprocessingSetupFrom } from "../../../Functions/Reprocessing/engine/reprocessingSetup";
import {
  fromMineralsAnswer,
  toMineralsAnswer,
  typesPricedByFromMinerals,
  typesPricedByToMinerals,
} from "../../../Functions/Reprocessing/reprocessingRuns";
import { parseInputMineralString } from "../../../Functions/Reprocessing/reprocessingInput";
import { valueReprocessing } from "../../../Functions/Reprocessing/valuation/valuation";
import { likelyOutputUnits } from "../../../Functions/Reprocessing/engine/mineralSpreads";
import { orderTypeOptions } from "../../../Functions/MarketData/defaults/orderTypeOptions";
import { reprocessingDirections } from "./reprocessingReducer";
import { useHeldStaticFile } from "../../../Hooks/Static/useHeldStaticFile";
import {
  primeReprocessing,
  readReprocessingItems,
  subscribeReprocessing,
} from "../../../Functions/Static/reprocessing";
import {
  primeItems,
  readItemRecords,
  subscribeItemRecords,
} from "../../../Functions/Static/items";

/**
 * What the page's committed paste comes to in the chosen direction, worked out while rendering from
 * the reader's choices, with the prices it reads asked for and followed as they arrive.
 *
 * @param {Object} state - the page's state from useReprocessingReducer
 * @param {Object} settings - the reprocessing settings in force
 * @param {Object<string, number>} skills - the skill levels in force
 * @param {{feePercent: number}} fees - what selling the outputs costs
 * @returns {{toMinerals: boolean, result: Object|null, valuation: Object|null,
 *   likelyOutputs: Object<string, {low: number, high: number}>,
 *   orderTypeOptions: Array<Object>|null,
 *   itemTypeIDs: Array<string>, reprocessingObjects: Array<Object>, outright: Array<Object>,
 *   requestedMinerals: Object, leftOut: Array<Object>, unread: Array<string>,
 *   setup: Object, isPricing: boolean}}
 */
export function useReprocessingAnswers(state, settings, skills, fees) {
  const { direction, pastes, currentStructure, marketLocation, orderType } =
    state;
  const paste = pastes[direction].committed;
  const toMinerals = direction === reprocessingDirections.toMinerals;
  const reprocessingFile = useHeldStaticFile({
    subscribe: subscribeReprocessing,
    read: readReprocessingItems,
    prime: primeReprocessing,
  });
  const itemRecords = useHeldStaticFile({
    subscribe: subscribeItemRecords,
    read: readItemRecords,
    prime: primeItems,
  });

  const setup = useMemo(
    () => reprocessingSetupFrom(currentStructure, skills),
    [currentStructure, skills],
  );
  const toAnswer = useMemo(
    () =>
      toMinerals && paste && reprocessingFile && itemRecords
        ? toMineralsAnswer(paste, setup)
        : null,
    [toMinerals, paste, setup, reprocessingFile, itemRecords],
  );
  const likelyOutputs = useMemo(
    () => (toAnswer ? likelyOutputUnits(toAnswer.result) : {}),
    [toAnswer],
  );
  const fromRead = useMemo(
    () =>
      !toMinerals && paste && reprocessingFile && itemRecords
        ? parseInputMineralString(paste)
        : null,
    [toMinerals, paste, reprocessingFile, itemRecords],
  );
  const wants = useMemo(() => {
    const types = toAnswer
      ? typesPricedByToMinerals(toAnswer.result)
      : fromRead
        ? typesPricedByFromMinerals()
        : [];
    return types.map((typeID) => ({ typeID, marketLocation }));
  }, [toAnswer, fromRead, marketLocation]);
  const { isLoading, refreshTimes } = useMarketPricesQuery(wants, {
    enabled: wants.length > 0,
  });
  const fromAnswer = useMemo(
    () =>
      fromRead && !isLoading
        ? fromMineralsAnswer(
            fromRead.items,
            setup,
            (typeID) =>
              readMarketPriceForType(typeID, marketLocation, orderType),
            settings,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fromRead,
      setup,
      marketLocation,
      orderType,
      settings,
      isLoading,
      refreshTimes,
    ],
  );

  const priced = useMemo(
    () => {
      if (!toAnswer || isLoading) return null;
      const valueOn = (candidate) =>
        valueReprocessing(
          toAnswer.result,
          (typeID) => readMarketPriceForType(typeID, marketLocation, candidate),
          { feePercent: fees.feePercent, taxPercent: setup.taxPercent },
        );
      const valuation = valueOn(orderType);
      return {
        valuation,
        orderTypeOptions: orderTypeOptions(
          (candidate) =>
            candidate === orderType
              ? valuation.totals.reprocessed
              : valueOn(candidate).totals.reprocessed,
          orderType,
        ),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      toAnswer,
      isLoading,
      marketLocation,
      orderType,
      fees.feePercent,
      setup,
      refreshTimes,
    ],
  );

  return {
    toMinerals,
    result: toAnswer?.result ?? null,
    likelyOutputs,
    valuation: priced?.valuation ?? null,
    orderTypeOptions: priced?.orderTypeOptions ?? null,
    itemTypeIDs: toAnswer
      ? toAnswer.result.items.map((item) => item.typeID)
      : (fromAnswer?.oreSelection.map((item) => String(item.id)) ?? []),
    reprocessingObjects: fromAnswer?.oreSelection ?? [],
    outright: fromAnswer?.outright ?? [],
    requestedMinerals: fromRead?.items ?? {},
    leftOut: toAnswer?.notReprocessable ?? fromRead?.notFromOre ?? [],
    unread: toAnswer?.unread ?? fromRead?.unread ?? [],
    setup,
    isPricing: wants.length > 0 && isLoading,
  };
}

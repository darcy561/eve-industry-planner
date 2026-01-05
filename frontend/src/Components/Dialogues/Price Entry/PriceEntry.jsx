import { useEffect } from "react";
import { subscribeToEvent } from "../../../utils/EventSystem";
import { PriceEntryContent } from "./DataProviders";
import usePriceEntryReducer from "./Hooks/usePriceEntryReducer";

export function PriceEntryDialog() {
  const { state, actions } = usePriceEntryReducer();

  useEffect(() => {
    const unsubscribe = subscribeToEvent("priceEntry", (data) => {
      if (data.open) {
        actions.toggleIsOpen();
        actions.setRequestedJobIDs(data.jobIDs);
        if (data.displayMarket) {
          actions.setDisplayMarket(data.displayMarket);
        }
        if (data.displayOrder) {
          actions.setDisplayOrder(data.displayOrder);
        }
      } else {
        actions.resetState();
      }
    });
    return () => unsubscribe();
  }, [actions]);

  if (!state.isOpen) return null;
  return <PriceEntryContent state={state} actions={actions} />;
}


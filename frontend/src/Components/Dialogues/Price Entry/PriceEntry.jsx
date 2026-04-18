import { useRef } from "react";
import { PriceEntryContent } from "./DataProviders";
import usePriceEntryReducer from "./Hooks/usePriceEntryReducer";
import { useSyncedDialogEventState } from "../../../Styled Components/Dialog/ContentDialog";

function serializePriceEntryEvent(messageData) {
  return JSON.stringify({
    isOpen: Boolean(messageData.isOpen),
    jobIDs: messageData.jobIDs ?? [],
    displayMarket: messageData.displayMarket ?? null,
    displayOrder: messageData.displayOrder ?? null,
  });
}

export function PriceEntryDialog() {
  const { state, actions } = usePriceEntryReducer();
  const stateRef = useRef(state);
  stateRef.current = state;

  useSyncedDialogEventState(
    "priceEntry",
    () => ({
      isOpen: false,
      jobIDs: [],
      displayMarket: null,
      displayOrder: null,
    }),
    serializePriceEntryEvent,
    (msg) => {
      if (msg.isOpen) {
        actions.setRequestedJobIDs(msg.jobIDs);
        if (msg.displayMarket) {
          actions.setDisplayMarket(msg.displayMarket);
        }
        if (msg.displayOrder) {
          actions.setDisplayOrder(msg.displayOrder);
        }
        if (!stateRef.current.isOpen) {
          actions.toggleIsOpen();
        }
      } else {
        actions.resetState();
      }
    },
  );

  if (!state.isOpen) return null;
  return <PriceEntryContent state={state} actions={actions} />;
}

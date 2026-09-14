import { PriceEntryContent } from "./DataProviders";
import usePriceEntryReducer from "./Hooks/usePriceEntryReducer";
import { useSyncedDialogueEventState } from "../../../Styled Components/Dialogue/ContentDialogue";

function serializePriceEntryEvent(messageData) {
  return JSON.stringify({
    isOpen: Boolean(messageData.isOpen),
    jobIDs: messageData.jobIDs ?? [],
    marketLocation: messageData.marketLocation ?? null,
    listingType: messageData.listingType ?? null,
  });
}

export function PriceEntryDialogue() {
  const { state, actions } = usePriceEntryReducer();

  useSyncedDialogueEventState(
    "priceEntry",
    () => ({
      isOpen: false,
      jobIDs: [],
      marketLocation: null,
      listingType: null,
    }),
    serializePriceEntryEvent,
    (msg) => {
      if (msg.isOpen) {
        actions.setRequestedJobIDs(msg.jobIDs ?? []);
        if (msg.marketLocation) {
          actions.setMarketLocation(msg.marketLocation);
        }
        if (msg.listingType) {
          actions.setListingType(msg.listingType);
        }
        if (!state.isOpen) {
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

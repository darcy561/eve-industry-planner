import { useRef } from "react";
import { ShoppingListContent } from "./DataProviders";
import useShoppingListReducer from "./Hooks/useShoppingListReducer";
import { useSyncedDialogEventState } from "../../../Styled Components/Dialog/ContentDialog";

function serializeShoppingListEvent(messageData) {
  return JSON.stringify({
    isOpen: Boolean(messageData.isOpen),
    jobIDs: messageData.jobIDs ?? [],
  });
}

export function ShoppingListDialog() {
  const { state, actions } = useShoppingListReducer();
  const stateRef = useRef(state);
  stateRef.current = state;

  useSyncedDialogEventState(
    "shoppingList",
    () => ({
      isOpen: false,
      jobIDs: [],
    }),
    serializeShoppingListEvent,
    (msg) => {
      if (msg.isOpen) {
        actions.setRequestedJobIDs(msg.jobIDs ?? []);
        if (!stateRef.current.isOpen) {
          actions.toggleIsOpen();
        }
      } else {
        actions.resetState();
      }
    },
  );

  if (!state.isOpen) return null;
  return <ShoppingListContent state={state} actions={actions} />;
}

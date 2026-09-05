import { useRef } from "react";
import { ShoppingListContent } from "./DataProviders";
import useShoppingListReducer from "./Hooks/useShoppingListReducer";
import { useSyncedDialogueEventState } from "../../../Styled Components/Dialogue/ContentDialogue";

function serializeShoppingListEvent(messageData) {
  return JSON.stringify({
    isOpen: Boolean(messageData.isOpen),
    jobIDs: messageData.jobIDs ?? [],
  });
}

export function ShoppingListDialogue() {
  const { state, actions } = useShoppingListReducer();
  const stateRef = useRef(state);
  stateRef.current = state;

  useSyncedDialogueEventState(
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

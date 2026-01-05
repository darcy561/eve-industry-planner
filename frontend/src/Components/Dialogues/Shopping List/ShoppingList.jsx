import { useEffect } from "react";
import { subscribeToEvent } from "../../../utils/EventSystem";
import { ShoppingListContent } from "./DataProviders";
import useShoppingListReducer from "./Hooks/useShoppingListReducer";

export function ShoppingListDialog() {
  const { state, actions } = useShoppingListReducer();

  useEffect(() => {
    const unsubscribe = subscribeToEvent("shoppingList", (data) => {
      actions.toggleIsOpen();
      actions.setRequestedJobIDs(data.jobIDs);
    });
    return () => unsubscribe();
  }, []);

  if (!state.isOpen) return null;
  return <ShoppingListContent state={state} actions={actions} />;
}




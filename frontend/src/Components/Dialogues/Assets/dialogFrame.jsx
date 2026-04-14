import { useEffect } from "react";
import { subscribeToEvent } from "../../../utils/EventSystem";
import useAssetsDialogReducer from "./Hooks/useAssetsDialogReducer";
import { AssetsDataProvider } from "./dialogDataProviders";
import useUsersStore from "../../../Zustand/usersStore";

function AssetsDialogue() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  if (!isLoggedIn) return null;

  const { state, actions } = useAssetsDialogReducer();

  useEffect(() => {
    const unsubscribe = subscribeToEvent("showAssetsDialog", (data) => {
      actions.toggleIsOpen();
      actions.setSelectedTypeID(data.selectedTypeID);
    });

    return () => unsubscribe();
  }, []);

  if (!state.isOpen) return null;

  return <AssetsDataProvider state={state} actions={actions} />;
}

export default AssetsDialogue;

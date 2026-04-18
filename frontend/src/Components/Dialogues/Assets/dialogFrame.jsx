import useAssetsDialogReducer from "./Hooks/useAssetsDialogReducer";
import { AssetsDataProvider } from "./dialogDataProviders";
import useUsersStore from "../../../Zustand/usersStore";
import { useSyncedDialogEventState } from "../../../Styled Components/Dialog/ContentDialog";

function serializeAssetsDialogEvent(messageData) {
  return JSON.stringify({
    isOpen: Boolean(messageData.isOpen),
    selectedTypeID:
      messageData.selectedTypeID === undefined
        ? null
        : messageData.selectedTypeID,
  });
}

function AssetsDialogue() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { state, actions } = useAssetsDialogReducer();
  useSyncedDialogEventState(
    "showAssetsDialog",
    () => ({
      isOpen: false,
      selectedTypeID: null,
    }),
    serializeAssetsDialogEvent,
    (msg) => {
      actions.toggleIsOpen();
      actions.setSelectedTypeID(msg.selectedTypeID ?? null);
    },
    { enabled: isLoggedIn },
  );

  if (!isLoggedIn) return null;
  if (!state.isOpen) return null;

  return <AssetsDataProvider state={state} actions={actions} />;
}

export default AssetsDialogue;

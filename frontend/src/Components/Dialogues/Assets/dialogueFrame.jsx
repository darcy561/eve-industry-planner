import useAssetsDialogueReducer from "./Hooks/useAssetsDialogueReducer";
import { AssetsDataProvider } from "./dialogueDataProviders";
import useUsersStore from "../../../Zustand/usersStore";
import { useSyncedDialogueEventState } from "../../../Styled Components/Dialogue/ContentDialogue";

function serializeAssetsDialogueEvent(messageData) {
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
  const { state, actions } = useAssetsDialogueReducer();
  useSyncedDialogueEventState(
    "showAssetsDialogue",
    () => ({
      isOpen: false,
      selectedTypeID: null,
    }),
    serializeAssetsDialogueEvent,
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

import { useEffect, useRef } from "react";
import { AppEvent } from "../../../analytics/appEventNames";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import ContentDialog, {
  DialogCloseAction,
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import useUsersStore from "../../../Zustand/usersStore";
import {
  useBuildStatsQuery,
  normalizeBuildStatsTypeID,
} from "../../../Hooks/React Query/Backend/buildStats";
import ArchiveDialogBody from "./ArchiveDialogBody";

function BlueprintArchiveDialog() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const [messageData, , resetDialog] = useDialogEventState(
    "showBlueprintArchiveDialog",
    () => ({
      isOpen: false,
      selectedTypeID: null,
      displayName: "",
    }),
  );

  const typeId = messageData.selectedTypeID;
  const normalizedId = normalizeBuildStatsTypeID(typeId);
  const analyticsLoggedRef = useRef(false);

  const { data, isLoading, error } = useBuildStatsQuery(typeId, {
    enabled:
      messageData.isOpen && !!normalizedId && isLoggedIn,
  });

  useEffect(() => {
    if (!messageData.isOpen) {
      analyticsLoggedRef.current = false;
    }
  }, [messageData.isOpen]);

  useEffect(() => {
    if (
      !messageData.isOpen ||
      !normalizedId ||
      !isLoggedIn ||
      isLoading ||
      analyticsLoggedRef.current
    ) {
      return;
    }
    analyticsLoggedRef.current = true;
    trackAppEvent(AppEvent.VIEW_ARCHIVED_JOB_DATA);
  }, [messageData.isOpen, normalizedId, isLoading, isLoggedIn]);

  function handleClose() {
    resetDialog();
  }

  const displayTitleBase = messageData.displayName?.trim() || "Blueprint";
  const queryError =
    error instanceof Error
      ? error
      : error
        ? new Error(String(error?.message || error))
        : null;

  return (
    <ContentDialog
      open={messageData.isOpen}
      onClose={handleClose}
      title={`${displayTitleBase} Archived Data`}
      dialogTitleProps={{ id: "BlueprintArchiveDialog" }}
      componentName="BlueprintArchiveDialog"
      maxWidth="sm"
      fullWidth
      asyncState={{
        isLoading: Boolean(isLoggedIn && normalizedId && isLoading),
        isError: Boolean(isLoggedIn && normalizedId && queryError),
        error: queryError,
        loadingMessage: "Loading archived statistics…",
      }}
      actions={<DialogCloseAction onClose={handleClose} />}
      dialogContentSx={{
        padding: "20px",
        overflow: "auto",
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      <ArchiveDialogBody
        isLoggedIn={isLoggedIn}
        normalizedId={normalizedId}
        isLoading={isLoading}
        data={data}
      />
    </ContentDialog>
  );
}

export default BlueprintArchiveDialog;

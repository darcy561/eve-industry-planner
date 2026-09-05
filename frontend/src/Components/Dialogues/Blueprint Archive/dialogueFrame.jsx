import { useEffect, useMemo, useRef } from "react";
import { AppEvent } from "../../../analytics/appEventNames";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import useUsersStore from "../../../Zustand/usersStore";
import {
  useAccountTotalsQuery,
  normalizeTotalsTypeID,
} from "../../../Hooks/React Query/Backend/statisticsTotals";
import ArchiveDialogueBody from "./ArchiveDialogueBody";
import { mapApiStatsToArchiveBreakdown } from "./mapApiStatsToArchiveBreakdown";

function BlueprintArchiveDialogue() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const [messageData, , resetDialogue] = useDialogueEventState(
    "showBlueprintArchiveDialogue",
    () => ({
      isOpen: false,
      selectedTypeID: null,
      displayName: "",
    }),
  );

  const typeId = messageData.selectedTypeID;
  const normalizedId = normalizeTotalsTypeID(typeId);
  const analyticsLoggedRef = useRef(false);

  const { data, isLoading, error } = useAccountTotalsQuery(typeId, {
    enabled:
      messageData.isOpen && !!normalizedId && isLoggedIn,
  });

  // Derived rather than fetched: the breakdown is a reshaping of the row already
  // in hand, so it costs one pass over three segments and no extra request.
  const statsBreakdown = useMemo(
    () => mapApiStatsToArchiveBreakdown(data),
    [data],
  );

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
    resetDialogue();
  }

  const displayTitleBase = messageData.displayName?.trim() || "Blueprint";
  const queryError =
    error instanceof Error
      ? error
      : error
        ? new Error(String(error?.message || error))
        : null;

  return (
    <ContentDialogue
      open={messageData.isOpen}
      onClose={handleClose}
      title={`${displayTitleBase} Archived Data`}
      dialogueTitleProps={{ id: "BlueprintArchiveDialogue" }}
      componentName="BlueprintArchiveDialogue"
      maxWidth="sm"
      fullWidth
      asyncState={{
        isLoading: Boolean(isLoggedIn && normalizedId && isLoading),
        isError: Boolean(isLoggedIn && normalizedId && queryError),
        error: queryError,
        loadingMessage: "Loading archived statistics…",
      }}
      actions={<DialogueCloseAction onClose={handleClose} />}
      dialogueContentSx={{
        padding: "20px",
        overflow: "auto",
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      <ArchiveDialogueBody
        isLoggedIn={isLoggedIn}
        normalizedId={normalizedId}
        isLoading={isLoading}
        data={data}
        statsBreakdown={statsBreakdown}
      />
    </ContentDialogue>
  );
}

export default BlueprintArchiveDialogue;

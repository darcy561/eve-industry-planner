import { useEffect, useMemo, useRef, useState } from "react";
import { AppEvent } from "../../../analytics/appEventNames";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import ContentDialog, {
  DialogCloseAction,
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import useUsersStore from "../../../Zustand/usersStore";
import {
  useBuildStatsQuery,
  useCorpBuildStatsQuery,
  normalizeBuildStatsTypeID,
} from "../../../Hooks/React Query/Backend/buildStats";
import { mapApiStatsToArchiveBreakdown } from "./mapApiStatsToArchiveBreakdown";
import ArchiveDialogBody from "./ArchiveDialogBody";

function BlueprintArchiveDialog() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const corporations = useUsersStore((state) => state.account.corporations);
  const firstCorpId =
    corporations?.[0]?.corporation_id != null
      ? String(corporations[0].corporation_id)
      : "";

  const [statsScope, setStatsScope] = useState(
    /** @type {'personal' | 'corp'} */ ("personal"),
  );
  const [selectedCorpId, setSelectedCorpId] = useState(firstCorpId);

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
  const corpIdForQuery = normalizeBuildStatsTypeID(selectedCorpId);
  const hasCorporations = (corporations?.length ?? 0) > 0;
  const analyticsLoggedRef = useRef(false);

  useEffect(() => {
    if (firstCorpId && selectedCorpId === "") {
      setSelectedCorpId(firstCorpId);
    }
  }, [firstCorpId, selectedCorpId]);

  useEffect(() => {
    if (!messageData.isOpen) {
      setStatsScope("personal");
    }
  }, [messageData.isOpen]);

  const personalEnabled =
    messageData.isOpen &&
    !!normalizedId &&
    isLoggedIn &&
    statsScope === "personal";
  const corpEnabled =
    messageData.isOpen &&
    !!normalizedId &&
    isLoggedIn &&
    statsScope === "corp" &&
    !!corpIdForQuery &&
    hasCorporations;

  const personalQuery = useBuildStatsQuery(typeId, {
    enabled: personalEnabled,
  });
  const corpQuery = useCorpBuildStatsQuery(selectedCorpId, typeId, {
    enabled: corpEnabled,
  });

  const apiData =
    statsScope === "personal" ? personalQuery.data : corpQuery.data;

  const isAggregateLoading =
    statsScope === "personal"
      ? personalQuery.isLoading
      : corpQuery.isLoading;

  const statsBreakdown = useMemo(
    () => mapApiStatsToArchiveBreakdown(apiData),
    [apiData],
  );

  const error =
    statsScope === "personal" ? personalQuery.error : corpQuery.error;

  const isLoading = isAggregateLoading;

  function handleStatsScopeChange(nextScope) {
    setStatsScope(nextScope);
    if (nextScope === "corp" && firstCorpId) {
      setSelectedCorpId((prev) => prev || firstCorpId);
    }
  }

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
      maxWidth="md"
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
        data={apiData}
        statsBreakdown={statsBreakdown}
        statsScope={statsScope}
        onStatsScopeChange={handleStatsScopeChange}
        selectedCorpId={selectedCorpId}
        onSelectedCorpIdChange={setSelectedCorpId}
        hasCorporations={hasCorporations}
      />
    </ContentDialog>
  );
}

export default BlueprintArchiveDialog;

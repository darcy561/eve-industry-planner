import { Skeleton, Stack } from "@mui/material";
import { useCallback } from "react";
import PriceHistoryLineGraph from "../../../Styled Components/LineGraph/priceHistory";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketHistoryData } from "../../../Hooks/EveEsi/World/useMarketHistoryData";

function PriceHistoryDialogue() {
  const [messageData, setMessageData, resetDialogue] = useDialogueEventState(
    "showPriceHistoryDialogue",
    () => ({
      isOpen: false,
      selectedTypeID: null,
      selectedLocation: null,
    }),
  );
  const {
    marketHistory,
    worldData,
    isLoading,
    error,
    isWorldDataLoading,
    worldDataError,
  } = useMarketHistoryData(messageData.selectedTypeID, messageData.selectedLocation);

  const handleClose = useCallback(() => {
    useUsersStore.getState().worldData.actions.addUniverseIDs(worldData);
    resetDialogue();
  }, [worldData, resetDialogue]);

  const isFetchActive =
    messageData.isOpen &&
    !!messageData.selectedTypeID &&
    !!messageData.selectedLocation?.regionID;

  const queryError =
    error instanceof Error
      ? error
      : error
        ? new Error(String(error?.message ?? error))
        : null;

  const loadingSkeleton = (
    <Stack spacing={2}>
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rounded" height={48} />
      <Skeleton variant="rounded" height={420} />
    </Stack>
  );

  return (
    <ContentDialogue
      open={messageData.isOpen}
      onClose={handleClose}
      loadingVariant="dense"
      useAppShellDesign
      componentName="PriceHistoryDialogue"
      maxWidth="lg"
      fullWidth
      asyncState={{
        isLoading: Boolean(isFetchActive && isLoading),
        isError: Boolean(isFetchActive && queryError),
        error: queryError,
        loadingMessage: "Loading market history…",
      }}
      loadingSkeleton={loadingSkeleton}
      helperArea={
        isFetchActive && isWorldDataLoading
          ? "Resolving structure, system, and region names…"
          : isFetchActive && worldDataError
            ? "Some location names could not be resolved."
            : null
      }
      dialogueSx={{
        "& .MuiDialog-paper": {
          height: "90vh",
          width: "90vw",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        },
      }}
      dialogueContentSx={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        maxWidth: "100%",
        display: "flex",
        alignItems: "stretch",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "hidden",
      }}
      actions={<DialogueCloseAction onClose={handleClose} />}
      dialogueActionsProps={{ sx: { display: "flex" } }}
    >
      <PriceHistoryLineGraph
        graphData={marketHistory}
        typeID={messageData.selectedTypeID}
        regionID={messageData.selectedLocation?.regionID}
        updateRegionID={(x) =>
          setMessageData((prev) => ({
            ...prev,
            selectedLocation: { ...prev.selectedLocation, regionID: x },
          }))
        }
        alternativeRegionData={worldData}
      />
    </ContentDialogue>
  );
}

export default PriceHistoryDialogue;

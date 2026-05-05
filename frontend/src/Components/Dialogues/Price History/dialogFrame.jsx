import { useCallback, useEffect, useState } from "react";
import PriceHistoryLineGraph from "../../../Styled Components/LineGraph/priceHistory";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import ContentDialog, {
  DialogCloseAction,
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketHistoryData } from "../../../Hooks/EveEsi/World/useMarketHistoryData";

function PriceHistoryDialog() {
  const [messageData, setMessageData, resetDialog] = useDialogEventState(
    "showPriceHistoryDialog",
    () => ({
      isOpen: false,
      selectedTypeID: null,
      selectedLocation: null,
    }),
  );
  const [worldData, setWorldData] = useState({});

  const handleClose = useCallback(() => {
    useUsersStore.getState().worldData.actions.addUniverseIDs(worldData);
    resetDialog();
  }, [worldData, resetDialog]);

  const { marketHistory, isLoading, error } = useMarketHistoryData(
    messageData.selectedTypeID,
    messageData.selectedLocation,
  );

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

  useEffect(() => {
    if (marketHistory?.length > 0 && messageData.selectedLocation) {
      getWorldData(
        [messageData.selectedLocation.regionID],
        useUsersStore.getState().account.actions.getMainCharacter(),
      ).then(setWorldData);
    }
  }, [marketHistory?.length, messageData.selectedLocation?.regionID]);

  return (
    <ContentDialog
      open={messageData.isOpen}
      onClose={handleClose}
      componentName="PriceHistoryDialog"
      maxWidth="lg"
      fullWidth
      asyncState={{
        isLoading: Boolean(isFetchActive && isLoading),
        isError: Boolean(isFetchActive && queryError),
        error: queryError,
        loadingMessage: "Loading market history…",
      }}
      dialogSx={{
        "& .MuiDialog-paper": {
          height: "90vh",
          width: "90vw",
        },
      }}
      dialogContentSx={{
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        overflowY: "hidden",
      }}
      actions={<DialogCloseAction onClose={handleClose} />}
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
    </ContentDialog>
  );
}

export default PriceHistoryDialog;

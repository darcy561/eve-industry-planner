import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import MarketDataDisplayGrid from "../../../Styled Components/DataGrid/marketbar";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import ContentDialog, {
  DialogCloseAction,
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketData } from "../../../Hooks/EveEsi/World/useMarketData";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";

function MarketDataDialog() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [messageData, setMessageData, resetDialog] = useDialogEventState(
    "showMarketDataDialog",
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

  const { marketData, isLoading, error } = useMarketData(
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
    if (marketData.length > 0 && messageData.selectedLocation) {
      const locations = new Set();
      marketData.forEach((item) => {
        locations.add(item.location_id);
        locations.add(item.system_id);
      });
      locations.add(messageData.selectedLocation.regionID);
      locations.add(messageData.selectedLocation.stationID);

      getWorldData(
        locations,
        useUsersStore.getState().account.actions.getMainCharacter(),
      ).then(setWorldData);
    }
  }, [
    marketData.length,
    messageData.selectedLocation?.regionID,
    messageData.selectedLocation?.stationID,
  ]);

  const regionName =
    useUsersStore
      .getState()
      .worldData.actions.findUniverseData(
        messageData.selectedLocation?.regionID,
        worldData,
      )?.name || "Unknown Region";

  return (
    <ContentDialog
      open={messageData.isOpen}
      onClose={handleClose}
      componentName="MarketDataDialog"
      maxWidth="lg"
      fullWidth
      isLoading={Boolean(isFetchActive && isLoading)}
      isError={Boolean(isFetchActive && queryError)}
      error={queryError}
      loadingMessage="Loading market data…"
      dialogSx={{
        "& .MuiDialog-paper": {
          height: "100vh",
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
      dialogActionsProps={{ sx: { display: "flex" } }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            marginBottom: theme.spacing(1),
          }}
        >
          <Box
            sx={{
              display: "flex",
              flex: 1,
              marginBottom: isMobile ? theme.spacing(1) : 0,
            }}
          >
            <Typography variant="h6" color="primary">
              Region Market Data For {regionName}
            </Typography>
          </Box>
          <Box sx={{ width: isMobile ? "100%" : "200px" }}>
            <MarketLocationSelect
              value={messageData.selectedLocation?.id}
              onChange={(location) =>
                setMessageData((prev) => ({
                  ...prev,
                  selectedLocation: location,
                }))
              }
            />
          </Box>
        </Box>
        {marketData.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                color: "text.secondary",
              }}
            >
              No market data available for this item in {regionName}
            </Typography>
          </Box>
        ) : (
          <MarketDataDisplayGrid
            marketData={marketData}
            typeID={messageData.selectedTypeID}
            regionID={messageData.selectedLocation?.regionID}
            alternativeRegionData={worldData}
            isLoading={isLoading}
          />
        )}
      </Box>
    </ContentDialog>
  );
}

export default MarketDataDialog;

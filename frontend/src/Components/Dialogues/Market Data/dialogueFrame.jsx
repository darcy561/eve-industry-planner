import {
  Box,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useCallback } from "react";
import MarketDataDisplayGrid from "../../../Styled Components/DataGrid/marketbar";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketData } from "../../../Hooks/EveEsi/World/useMarketData";

function MarketDataDialogue() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [messageData, setMessageData, resetDialogue] = useDialogueEventState(
    "showMarketDataDialogue",
    () => ({
      isOpen: false,
      selectedTypeID: null,
      selectedLocation: null,
    }),
  );
  const {
    marketData,
    worldData,
    isLoading,
    error,
    isWorldDataLoading,
    worldDataError,
  } = useMarketData(messageData.selectedTypeID, messageData.selectedLocation);

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

  const regionName =
    useUsersStore
      .getState()
      .worldData.actions.findUniverseData(
        messageData.selectedLocation?.regionID,
        worldData,
      )?.name || "Unknown Region";

  const loadingSkeleton = (
    <Stack spacing={2}>
      <Skeleton variant="text" width="50%" />
      <Skeleton variant="rounded" height={44} />
      <Skeleton variant="rounded" height={420} />
    </Stack>
  );

  return (
    <ContentDialogue
      open={messageData.isOpen}
      onClose={handleClose}
      loadingVariant="dense"
      useAppShellDesign
      componentName="MarketDataDialogue"
      maxWidth="lg"
      fullWidth
      asyncState={{
        isLoading: Boolean(isFetchActive && isLoading),
        isError: Boolean(isFetchActive && queryError),
        error: queryError,
        loadingMessage: "Loading market data…",
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
          height: "100vh",
          width: "90vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
      dialogueContentSx={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        display: "flex",
        alignItems: "stretch",
        flexDirection: "column",
        overflowY: "hidden",
      }}
      actions={<DialogueCloseAction onClose={handleClose} />}
      dialogueActionsProps={{ sx: { display: "flex" } }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
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
              useAppShellStyling
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
              minHeight: 360,
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
            isLoading={Boolean(isFetchActive && isLoading)}
          />
        )}
      </Box>
    </ContentDialogue>
  );
}

export default MarketDataDialogue;

import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Icon,
  Typography,
} from "@mui/material";
import { useState, useEffect } from "react";
import PriceHistoryLineGraph from "../../../Styled Components/LineGraph/priceHistory";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import ErrorIcon from "@mui/icons-material/Error";
import { subscribeToEvent } from "../../../utils/EventSystem";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketHistoryData } from "../../../Hooks/EveEsi/World/useMarketHistoryData";

function PriceHistoryDialog() {
  const [messageData, setMessageData] = useState({
    isOpen: false,
    selectedTypeID: null,
    selectedLocation: null,
  });
  const [worldData, setWorldData] = useState({});

  const { marketHistory, isLoading, error } = useMarketHistoryData(
    messageData.selectedTypeID,
    messageData.selectedLocation
  );

  // Subscribe to dialog open event
  useEffect(() => {
    const unsubscribe = subscribeToEvent("showPriceHistoryDialog", (data) => {
      setMessageData((prev) => {
        const updatedData = { ...prev };
        Object.entries(data).forEach(([key, value]) => {
          if (value !== null) {
            updatedData[key] = value;
          }
        });
        return updatedData;
      });
    });

    return () => unsubscribe();
  }, []);

  // Update world data when market history changes
  useEffect(() => {
    if (marketHistory?.length > 0 && messageData.selectedLocation) {
      getWorldData(
        [messageData.selectedLocation.regionID],
        useUsersStore.getState().account.actions.getMainCharacter()
      ).then(setWorldData);
    }
  }, [marketHistory?.length, messageData.selectedLocation?.regionID]);

  function handleClose() {
    useUsersStore
      .getState()
      .worldData.actions.addUniverseIDs(worldData);
    setMessageData({
      isOpen: false,
      selectedTypeID: null,
      selectedLocation: null,
    });
  }

  return (
    <Dialog
      open={messageData.isOpen}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
      sx={{
        "& .MuiDialog-paper": {
          height: "90vh",
          width: "90vw",
        },
      }}
    >
      <DialogContent
        sx={{
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          overflowY: "hidden",
        }}
      >
        {error && (
          <>
            <Icon color="error">
              <ErrorIcon />
            </Icon>
            <Typography variant="h6" color="error">
              Error Retrieving Market History Data
            </Typography>
          </>
        )}

        {isLoading && <CircularProgress color="primary" />}
        {!isLoading && !error && (
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
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="text" onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PriceHistoryDialog;

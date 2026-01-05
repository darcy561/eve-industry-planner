import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Icon,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState, useEffect } from "react";
import ErrorIcon from "@mui/icons-material/Error";
import MarketDataDisplayGrid from "../../../Styled Components/DataGrid/marketbar";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import { subscribeToEvent } from "../../../utils/EventSystem";
import useUsersStore from "../../../Zustand/usersStore";
import { useMarketData } from "../../../Hooks/EveEsi/World/useMarketData";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";

function MarketDataDialog() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [messageData, setMessageData] = useState({
    isOpen: false,
    selectedTypeID: null,
    selectedLocation: null,
  });
  const [worldData, setWorldData] = useState({});

  const { marketData, isLoading, error } = useMarketData(
    messageData.selectedTypeID,
    messageData.selectedLocation
  );
  // Subscribe to dialog open event
  useEffect(() => {
    const unsubscribe = subscribeToEvent("showMarketDataDialog", (data) => {
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

  // Update world data when market data changes
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
        useUsersStore.getState().users.actions.findParentUser()
      ).then(setWorldData);
    }
  }, [
    marketData.length,
    messageData.selectedLocation?.regionID,
    messageData.selectedLocation?.stationID,
  ]);

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

  const regionName =
    useUsersStore
      .getState()
      .worldData.actions.findUniverseData(
        messageData.selectedLocation?.regionID,
        worldData
      )?.name || "Unknown Region";

  return (
    <Dialog
      open={messageData.isOpen}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
      sx={{
        "& .MuiDialog-paper": {
          height: "100vh",
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
              Error Retrieving Market Data
            </Typography>
          </>
        )}

        {isLoading && <CircularProgress color="primary" />}

        {!isLoading && !error && (
          <Box display="flex" flexDirection="column" height="100%" width="100%">
            <Box
              display="flex"
              flexDirection={isMobile ? "column" : "row"}
              sx={{ marginBottom: theme.spacing(1) }}
            >
              <Box
                display="flex"
                flex={1}
                sx={{ marginBottom: isMobile ? theme.spacing(1) : 0 }}
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
                display="flex"
                justifyContent="center"
                alignItems="center"
                height="100%"
              >
                <Typography variant="h6" color="text.secondary">
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
        )}
      </DialogContent>
      <DialogActions display="flex">
        <Button size="small" variant="text" onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default MarketDataDialog;

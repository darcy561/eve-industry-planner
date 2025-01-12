import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Icon,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { ApplicationSettingsContext } from "../../../Context/LayoutContext";
import GLOBAL_CONFIG from "../../../global-config-app";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import { useHelperFunction } from "../../../Hooks/GeneralHooks/useHelperFunctions";
import { EveIDsContext } from "../../../Context/EveDataContext";
import ErrorIcon from "@mui/icons-material/Error";
import getMarketData from "../../../Functions/EveESI/World/getMarketData";
import MarketDataDisplayGrid from "../../../Styled Components/DataGrid/marketbar";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

function MarketDataDialog({ isOpen, setIsOpen, typeID, setTypeID }) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { updateEveIDs } = useContext(EveIDsContext);
  const [selectedLocation, setSelectedLocation] = useState(() =>
    MARKET_OPTIONS.find((i) => i.id === applicationSettings.defaultMarket)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [graphData, setGraphData] = useState([]);
  const [hasError, setHasError] = useState(false);
  const [temporaryWorldData, setTemporaryWorldData] = useState({});
  const { findParentUser, findUniverseItemObject } = useHelperFunction();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  function handleClose() {
    updateEveIDs((prev) => ({ ...prev, ...temporaryWorldData }));
    setIsOpen((prev) => !prev);
    setTypeID(null);
  }

  useEffect(() => {
    async function getData() {
      try {
        if (!typeID) return;
        setIsLoading(true);
        const jsonData = await getMarketData(selectedLocation.regionID, typeID);
        const locations = jsonData.reduce((prev, item) => {
          prev.add(item.location_id);
          prev.add(item.system_id);
          return prev;
        }, new Set());
        locations.add(selectedLocation.regionID);
        locations.add(selectedLocation.stationID);

        const marketData = jsonData.map((order) => {
          const expiration = calculateExpiration(order.issued, order.duration); // Use duration in days
          return {
            ...order,
            expiration: expiration.toLocaleString(), // Format expiration to a string
          };
        });

        function calculateExpiration(issued, duration) {
          const issuedDate = new Date(issued); // Parse the ISO 8601 string to a Date object
          const expirationDate = new Date(
            issuedDate.getTime() + duration * 24 * 60 * 60 * 1000
          );
          return expirationDate;
        }

        const newWorldData = await getWorldData(locations, findParentUser());

        setGraphData(marketData);
        setTemporaryWorldData(newWorldData);
        setHasError(false);
        setIsLoading(false);
      } catch (err) {
        setHasError(true);
      }
    }

    getData();
  }, [isOpen, selectedLocation, typeID]);

  const regionName =
    findUniverseItemObject(selectedLocation.regionID, temporaryWorldData)
      ?.name || "Unknown Region";

  return (
    <Dialog
      open={isOpen}
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
        {hasError && (
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

        {!isLoading && (
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
                <Select
                  variant="standard"
                  size="small"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  fullWidth
                >
                  {MARKET_OPTIONS.map((option) => (
                    <MenuItem key={option.id} value={option}>
                      {option.name}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Box>
            <MarketDataDisplayGrid
              marketData={graphData}
              typeID={typeID}
              regionID={selectedLocation.regionID}
              alternativeRegionData={temporaryWorldData}
              isLoading={isLoading}
            />
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

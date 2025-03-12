import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Icon,
  Typography,
} from "@mui/material";
import { useContext, useEffect, useState } from "react";
import getMarketHistory from "../../../Functions/EveESI/World/getMarketHistory";
import { ApplicationSettingsContext } from "../../../Context/LayoutContext";
import GLOBAL_CONFIG from "../../../global-config-app";
import PriceHistoryLineGraph from "../../../Styled Components/LineGraph/priceHistory";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import { useHelperFunction } from "../../../Hooks/GeneralHooks/useHelperFunctions";
import { EveIDsContext } from "../../../Context/EveDataContext";
import ErrorIcon from "@mui/icons-material/Error";

const { MARKET_OPTIONS, DEFAULT_REGION } = GLOBAL_CONFIG;

function PriceHistoryDialog({ isOpen, setIsOpen, typeID, setTypeID }) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { updateEveIDs } = useContext(EveIDsContext);
  const [selectedRegion, setSelectedRegion] = useState(
    () =>
      MARKET_OPTIONS.find((i) => i.id === applicationSettings.defaultMarket)
        ?.regionID || DEFAULT_REGION
  );
  const [isLoading, setIsLoading] = useState(true);
  const [graphData, setGraphData] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [temporaryWorldData, setTemporaryWorldData] = useState({});
  const { findParentUser } = useHelperFunction();

  function handleClose() {
    updateEveIDs((prev) => ({ ...prev, ...temporaryWorldData }));
    setIsOpen((prev) => !prev);
    setTypeID(null);
  }

  useEffect(() => {
    async function getHistory() {
      if (!typeID) return;
      setIsLoading(true);
      const jsonData = await getMarketHistory(selectedRegion, typeID);
      const newWorldData = await getWorldData(
        [selectedRegion],
        findParentUser()
      );
      if (jsonData instanceof Error) {
        setHasError(true);
        setIsLoading(false);
        return;
      }
      setTemporaryWorldData((prev) => ({ ...prev, ...newWorldData }));
      setGraphData(jsonData);
      setIsLoading(false);
    }

    getHistory();
  }, [isOpen, selectedRegion, typeID]);

  return (
    <Dialog
      open={isOpen}
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
          <PriceHistoryLineGraph
            graphData={graphData}
            typeID={typeID}
            regionID={selectedRegion}
            updateRegionID={setSelectedRegion}
            alternativeRegionData={temporaryWorldData}
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

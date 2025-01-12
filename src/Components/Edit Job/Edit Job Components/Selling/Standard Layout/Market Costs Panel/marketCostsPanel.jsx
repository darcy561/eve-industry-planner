import {
  Box,
  Grid,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import GLOBAL_CONFIG from "../../../../../../global-config-app";
import { useHelperFunction } from "../../../../../../Hooks/GeneralHooks/useHelperFunctions";
import { useState } from "react";
import MarketDataDialog from "../../../../../Dialogues/Market Data/dialogFrame";
import PriceHistoryDialog from "../../../../../Dialogues/Price History/dialogFrame";
import TimelineIcon from "@mui/icons-material/Timeline";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";

export function MarketCostsPanel({ activeJob }) {
  const [isPriceHistoryDialogOpen, setIsPriceHistoryDialogOpen] =
    useState(false);
  const [priceHistoryTypeID, setPriceHistoryTypeID] = useState(null);
  const [isMarketDataDialogOpen, setIsMarketDataDialogOpen] = useState(false);
  const [marketDataTypeID, setMarketDataTypeID] = useState(null);
  const { findItemPriceObject } = useHelperFunction();

  const { MARKET_OPTIONS } = GLOBAL_CONFIG;
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const itemCosts = findItemPriceObject(activeJob.itemID);

  return (
    <Paper
      elevation={3}
      sx={{
        minWidth: "100%",
        padding: "20px",
        position: "relative",
      }}
      square
    >
      {isPriceHistoryDialogOpen && (
        <PriceHistoryDialog
          isOpen={isPriceHistoryDialogOpen}
          setIsOpen={setIsPriceHistoryDialogOpen}
          typeID={priceHistoryTypeID}
          setTypeID={setPriceHistoryTypeID}
        />
      )}
      {isMarketDataDialogOpen && (
        <MarketDataDialog
          isOpen={isMarketDataDialogOpen}
          setIsOpen={setIsMarketDataDialogOpen}
          typeID={marketDataTypeID}
          setTypeID={setMarketDataTypeID}
        />
      )}

      <Box
        sx={{
          position: "absolute",
          top: "10px",
          right: "10px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: "10px",
        }}
      >
        <Tooltip title="Item Price History" arrow placement="top">
          <IconButton
            size="small"
            color="primary"
            onClick={() => {
              setIsPriceHistoryDialogOpen((prev) => !prev);
              setPriceHistoryTypeID(activeJob.itemID);
            }}
          >
            <TimelineIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Current Market Data" arrow placement="top">
          <IconButton
            size="small"
            color="primary"
            onClick={() => {
              setIsMarketDataDialogOpen((prev) => !prev);
              setMarketDataTypeID(activeJob.itemID);
            }}
          >
            <LocalAtmIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Grid container>
        <Grid item xs={12} sx={{ marginBottom: "20px" }}>
          <Typography variant="h6" color="primary" align="center">
            Current Market Prices
          </Typography>
        </Grid>

        {MARKET_OPTIONS.map(({ id, name }) => {
          const optionCosts = itemCosts[id];
          return (
            <Grid container item xs={12} sm={6} md={4} align="center">
              <Grid item xs={12} sm={2}>
                <Typography sx={{ typography: { xs: "body2", lg: "body1" } }}>
                  {name}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={10}>
                <Typography sx={{ typography: { xs: "caption", lg: "body1" } }}>
                  Sell:{" "}
                  {itemCosts
                    ? optionCosts.sell.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : 0}
                </Typography>
                <Typography sx={{ typography: { xs: "caption", lg: "body1" } }}>
                  Buy:{" "}
                  {itemCosts
                    ? optionCosts.buy.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : 0}
                </Typography>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
    </Paper>
  );
}

import { useContext, useState } from "react";
import GLOBAL_CONFIG from "../../../../../../global-config-app";
import { Grid, MenuItem, Paper, Select, Typography } from "@mui/material";
import { listingType } from "../../../../../../Context/defaultValues";
import { CurrentMaterialHeader } from "./currentMaterialHeader";
import { MaterialCostRow_MaterialPricePanel } from "./itemRow";
import { MaterialTotals_MaterialPricesPanel } from "./materialTotals";
import { ApplicationSettingsContext } from "../../../../../../Context/LayoutContext";
import PriceHistoryDialog from "../../../../../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../../../../../Dialogues/Market Data/dialogFrame";

export function MaterialCostPanel({
  activeJob,
  updateActiveJob,
  jobModified,
  setJobModified,
  temporaryChildJobs,
  updateTemporaryChildJobs,
  esiDataToLink,
  updateEsiDataToLink,
  parentChildToEdit,
  updateParentChildToEdit,
}) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const [marketSelect, updateMarketSelect] = useState(
    applicationSettings.defaultMarket
  );
  const [listingSelect, updateListingSelect] = useState(
    applicationSettings.defaultOrders
  );
  const [isPriceHistoryDialogOpen, setIsPriceHistoryDialogOpen] =
    useState(false);
  const [priceHistoryTypeID, setPriceHistoryTypeID] = useState(null);
  const [isMarketDataDialogOpen, setIsMarketDataDialogOpen] = useState(false);
  const [marketDataTypeID, setMarketDataTypeID] = useState(null);
  const { MARKET_OPTIONS } = GLOBAL_CONFIG;

  if (!activeJob.build.setup[activeJob.layout.setupToEdit]) return null;

  return (
    <Paper
      elevation={3}
      square
      sx={{ minWidth: "100%", padding: "20px", position: "relative" }}
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
      <Grid container>
        <Grid
          item
          xs={12}
          align="center"
          sx={{ marginBottom: { xs: "50px", sm: "20px", lg: "40px" } }}
        >
          <Typography variant="h6" color="primary">
            Estimated Market Costs
          </Typography>
        </Grid>
        <Select
          value={listingSelect}
          variant="standard"
          size="small"
          onChange={(e) => {
            updateListingSelect(e.target.value);
          }}
          sx={{
            width: "120px",
            position: "absolute",
            top: { xs: "55px", sm: "20px" },
            left: { xs: "10%", sm: "30px" },
          }}
        >
          {listingType.map((option) => {
            return (
              <MenuItem key={option.name} value={option.id}>
                {option.name}
              </MenuItem>
            );
          })}
        </Select>
        <Select
          value={marketSelect}
          variant="standard"
          size="small"
          onChange={(e) => {
            updateMarketSelect(e.target.value);
          }}
          sx={{
            width: "90px",
            position: "absolute",
            top: { xs: "55px", sm: "20px" },
            right: { xs: "10%", sm: "30px" },
          }}
        >
          {MARKET_OPTIONS.map((option) => {
            return (
              <MenuItem key={option.name} value={option.id}>
                {option.name}
              </MenuItem>
            );
          })}
        </Select>
      </Grid>
      <CurrentMaterialHeader
        activeJob={activeJob}
        marketSelect={marketSelect}
        listingSelect={listingSelect}
        setIsPriceHistoryDialogOpen={setIsPriceHistoryDialogOpen}
        setPriceHistoryTypeID={setPriceHistoryTypeID}
        setIsMarketDataDialogOpen={setIsMarketDataDialogOpen}
        setMarketDataTypeID={setMarketDataTypeID}
      />
      <Grid container item xs={12}>
        {activeJob.build.materials.map((material) => {
          return (
            <MaterialCostRow_MaterialPricePanel
              key={material.typeID}
              activeJob={activeJob}
              updateActiveJob={updateActiveJob}
              material={material}
              marketSelect={marketSelect}
              listingSelect={listingSelect}
              jobModified={jobModified}
              setJobModified={setJobModified}
              temporaryChildJobs={temporaryChildJobs}
              updateTemporaryChildJobs={updateTemporaryChildJobs}
              esiDataToLink={esiDataToLink}
              updateEsiDataToLink={updateEsiDataToLink}
              parentChildToEdit={parentChildToEdit}
              updateParentChildToEdit={updateParentChildToEdit}
              setIsPriceHistoryDialogOpen={setIsPriceHistoryDialogOpen}
              setPriceHistoryTypeID={setPriceHistoryTypeID}
              setIsMarketDataDialogOpen={setIsMarketDataDialogOpen}
              setMarketDataTypeID={setMarketDataTypeID}
            />
          );
        })}
        <MaterialTotals_MaterialPricesPanel
          activeJob={activeJob}
          marketSelect={marketSelect}
          listingSelect={listingSelect}
          temporaryChildJobs={temporaryChildJobs}
          parentChildToEdit={parentChildToEdit}
        />
      </Grid>
    </Paper>
  );
}

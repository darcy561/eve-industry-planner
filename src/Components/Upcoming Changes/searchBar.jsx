import { Grid, Paper } from "@mui/material";
import { useContext } from "react";
import { EvePricesContext } from "../../Context/EveDataContext";
import { useJobBuild } from "../../Hooks/useJobBuild";
import getMarketData from "../../Functions/MarketData/findMarketData";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";

export function UpcomingChangesSearch({
  updateTranqItem,
  updateSisiItem,
  updateItemLoad,
  updateLoadComplete,
}) {
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { buildJob } = useJobBuild();

  return (
    <Paper
      square
      elevation={3}
      sx={{
        padding: "20px",
      }}
    >
      <Grid container>
        <Grid item xs={12} sm={4} lg={3} xl={2}>
          <VirtualisedRecipeSearch
            onSelect={async (value) => {
              updateItemLoad(true);
              let newTranqJob = await buildJob({
                itemID: value.itemID,
                throwError: false,
              });
              let newSisiJob = await buildJob({
                itemID: value.itemID,
                sisiData: true,
                throwError: false,
              });
              let priceIDRequest = new Set();
              priceIDRequest.add(value.itemID);
              if (newTranqJob !== undefined) {
                newTranqJob.build.materials.forEach((mat) => {
                  priceIDRequest.add(mat.typeID);
                });
              }
              if (newSisiJob !== undefined) {
                newSisiJob.build.materials.forEach((mat) => {
                  priceIDRequest.add(mat.typeID);
                });
              }

              let itemPriceResult = await getMarketData(
                priceIDRequest,
                evePrices
              );
              updateEvePrices((prev) => ({
                ...prev,
                ...itemPriceResult,
              }));
              if (newTranqJob === undefined) {
                updateTranqItem("missing");
              } else {
                updateTranqItem(newTranqJob);
              }
              if (newSisiJob === undefined) {
                updateSisiItem("missing");
              } else {
                updateSisiItem(newSisiJob);
              }
              updateItemLoad(false);
            }}
          />
        </Grid>
      </Grid>
    </Paper>
  );
}

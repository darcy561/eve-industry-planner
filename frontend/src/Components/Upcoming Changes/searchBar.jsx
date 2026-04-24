import { Paper, Grid } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import getMarketData from "../../Functions/MarketData/findMarketData";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import useUsersStore from "../../Zustand/usersStore"
import { buildJob } from "../../Functions/JobPlanner/buildJob";

export function UpcomingChangesSearch({
  updateTranqItem,
  updateSisiItem,
  updateItemLoad,
  updateLoadComplete,
}) {
  const queryClient = useQueryClient();

  return (
    <Paper
      square
      elevation={3}
      sx={{
        padding: "20px",
      }}
    >
      <Grid container>
        <Grid
          size={{
            xs: 12,
            sm: 4,
            lg: 3,
            xl: 2
          }}>
          <VirtualisedRecipeSearch
            onSelect={async (value) => {
              updateItemLoad(true);
              let newTranqJob = await buildJob(
                {
                  itemID: value.itemID,
                  throwError: false,
                  skipJobCreateAnalytics: true,
                },
                { queryClient }
              );
              let newSisiJob = await buildJob(
                {
                  itemID: value.itemID,
                  sisiData: true,
                  throwError: false,
                  skipJobCreateAnalytics: true,
                },
                { queryClient }
              );
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

              let itemPriceResult = await getMarketData(priceIDRequest);
              useUsersStore
                .getState()
                .worldData.actions.addMarketData(itemPriceResult);
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

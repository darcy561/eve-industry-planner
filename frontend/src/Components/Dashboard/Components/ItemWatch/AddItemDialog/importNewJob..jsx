import { Typography, Grid } from "@mui/material";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import getMissingESIData from "../../../../../Functions/Shared/getMissingESIData";
import checkJobTypeIsBuildable from "../../../../../Functions/Helper/checkJobTypeIsBuildable";
import { recalculateInstallCostsWithNewData } from "../../../../../Functions/Installation Costs/installCosts";
import VirtualisedRecipeSearch from "../../../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import useUsersStore from "../../../../../Zustand/usersStore";
import { buildJob } from "../../../../../Functions/JobPlanner/buildJob";

export function ImportNewJob_WatchlistDialog({
  setFailedImport,
  changeLoadingText,
  setMaterialJobs,
  updateSaveReady,
  changeLoadingState,
  updateWatchlistItemRequest,
  watchlistItemToEdit,
  updateGroupSelect,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const queryClient = useQueryClient();

  useEffect(() => {
    async function findJobToEdit() {
      if (!watchlistItemToEdit) return;
      await importWatchlistItem(
        userWatchlist.items[watchlistItemToEdit].typeID
      );
      updateGroupSelect(userWatchlist.items[watchlistItemToEdit].group);
    }
    findJobToEdit();
  }, []);

  async function importWatchlistItem(requestedID) {
    changeLoadingState(true);
    changeLoadingText("Importing Item Data...");
    let materialMap = {};

    const WatchlistItemJob = await buildJob(
      {
        itemID: requestedID,
        skipJobCreateAnalytics: true,
      },
      { queryClient }
    );

    if (!WatchlistItemJob) {
      changeLoadingText("Error Importing Data...");
      setFailedImport(true);
      changeLoadingState(false);
      return;
    }

    materialMap[WatchlistItemJob.itemID] = WatchlistItemJob;
    const materialJobRequests = WatchlistItemJob.build.materials.reduce(
      (prev, material) => {
        if (checkJobTypeIsBuildable(material.jobType)) {
          prev.push({
            itemID: material.typeID,
            skipJobCreateAnalytics: true,
          });
        }
        return prev;
      },
      []
    );

    const MaterialJobs = await buildJob(materialJobRequests, { queryClient });

    for (let job of MaterialJobs) {
      materialMap[job.itemID] = job;
    }

    const { requestedMarketData, requestedSystemIndexes } =
      await getMissingESIData([...MaterialJobs, WatchlistItemJob]);

    recalculateInstallCostsWithNewData(
      MaterialJobs,
      requestedMarketData,
      requestedSystemIndexes
    );

    useUsersStore
      .getState()
      .worldData.actions.addMarketData(requestedMarketData);
    useUsersStore
      .getState()
      .worldData.actions.addSystemIndex(requestedSystemIndexes);
    updateWatchlistItemRequest(WatchlistItemJob.itemID);
    setMaterialJobs(materialMap);
    updateSaveReady(true);
    changeLoadingState(false);
  }

  return (
    <Grid sx={{ marginBottom: "40px" }} size={12}>
      <Grid align="center" size={12}>
        <Typography> Select An Item To Begin</Typography>
      </Grid>
      <VirtualisedRecipeSearch
        onSelect={async (value) => {
          await importWatchlistItem(value.itemID);
        }}
      />
    </Grid>
  );
}

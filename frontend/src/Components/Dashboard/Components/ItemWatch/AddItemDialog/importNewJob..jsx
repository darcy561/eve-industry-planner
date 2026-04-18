import { Typography, Grid } from "@mui/material";

import { useJobBuild } from "../../../../../Hooks/useJobBuild";
import { useEffect } from "react";
import getMissingESIData from "../../../../../Functions/Shared/getMissingESIData";
import checkJobTypeIsBuildable from "../../../../../Functions/Helper/checkJobTypeIsBuildable";
import recalculateInstallCostsWithNewData from "../../../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import VirtualisedRecipeSearch from "../../../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import useUsersStore from "../../../../../Zustand/usersStore";

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
  const { buildJob } = useJobBuild();

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

    const WatchlistItemJob = await buildJob({
      itemID: requestedID,
      skipJobCreateAnalytics: true,
    });

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

    const MaterialJobs = await buildJob(materialJobRequests);

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

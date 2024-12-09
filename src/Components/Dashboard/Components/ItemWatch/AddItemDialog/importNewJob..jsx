import { Grid, Typography } from "@mui/material";
import { useJobBuild } from "../../../../../Hooks/useJobBuild";
import { useContext, useEffect } from "react";
import {
  EvePricesContext,
  SystemIndexContext,
} from "../../../../../Context/EveDataContext";
import { UserWatchlistContext } from "../../../../../Context/AuthContext";
import getMissingESIData from "../../../../../Functions/Shared/getMissingESIData";
import checkJobTypeIsBuildable from "../../../../../Functions/Helper/checkJobTypeIsBuildable";
import { useInstallCostsCalc } from "../../../../../Hooks/GeneralHooks/useInstallCostCalc";
import recalculateInstallCostsWithNewData from "../../../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import VirtualisedRecipeSearch from "../../../../../Styled Components/autocomplete/virtualisedRecipeSearch";

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
  const { userWatchlist } = useContext(UserWatchlistContext);
  const { evePrices, updateEvePrices } = useContext(EvePricesContext);
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { buildJob } = useJobBuild();
  const { calculateInstallCostFromJob } = useInstallCostsCalc();

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
          prev.push({ itemID: material.typeID });
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
      await getMissingESIData(
        [...MaterialJobs, WatchlistItemJob],
        evePrices,
        systemIndexData
      );

    recalculateInstallCostsWithNewData(
      MaterialJobs,
      calculateInstallCostFromJob,
      requestedMarketData,
      requestedSystemIndexes
    );

    updateEvePrices((prev) => ({
      ...prev,
      ...requestedMarketData,
    }));
    updateSystemIndexData((prev) => ({
      ...prev,
      ...requestedSystemIndexes,
    }));
    updateWatchlistItemRequest(WatchlistItemJob.itemID);
    setMaterialJobs(materialMap);
    updateSaveReady(true);
    changeLoadingState(false);
  }

  return (
    <Grid item xs={12} sx={{ marginBottom: "40px" }}>
      <Grid item xs={12} align="center">
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

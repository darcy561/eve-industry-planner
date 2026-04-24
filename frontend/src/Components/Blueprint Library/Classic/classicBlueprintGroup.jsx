import { useState } from "react";
import { showBlueprintArchiveDialog } from "../../../Events/dialogEvents";
import {
  Box,
  CircularProgress,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCachedData } from "../../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES, STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { BlueprintEntry } from "./classicBlueprintEntry";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import { saveJobsViaApi } from "../../../Functions/JobDocuments/saveJobsViaApi.js";
import getMissingESIData from "../../../Functions/Shared/getMissingESIData";
import recalculateInstallCostsWithNewData from "../../../Functions/Installation Costs/recalculateInstallCostsWithNewData";
import { showSnackbarSuccess } from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";
import useGetAllIndustryJobs from "../../../Hooks/EveEsi/useGetAllIndustryJobs";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { buildJob } from "../../../Functions/JobPlanner/buildJob";

export function ClassicBlueprintGroup({ bpID, blueprintResults }) {
  const { updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const [loadingBuild, updateLoadingBuild] = useState(false);
  const queryClient = useQueryClient();
  const { data: blueprintIDs, isLoading: blueprintIDsLoading, error: blueprintIDsError } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  const { data: apiJobs = [], isLoading: apiJobsLoading, error: apiJobsError } = useGetAllIndustryJobs();

  const esiJobs = apiJobs.filter(
    (i) => i.product_type_id === bpID || i.blueprint_type_id === bpID
  );

  let bpData = blueprintIDs?.find((i) => i.blueprintID === bpID);
  let output = blueprintResults.blueprints.filter((bp) => bp.type_id === bpID);

  // Deduplicate output by item_id to ensure unique keys
  const uniqueOutput = Array.from(
    new Map(output.map((bp) => [bp.item_id, bp])).values()
  );

  return (
    <Grid
      key={bpID}
      container
      size={{
        xs: 12,
        sm: 6
      }}>
      <ContentPanel 
        title={bpData?.name}
        componentName={`Classic Blueprint Group - ${bpID}`}
        isLoading={blueprintIDsLoading || apiJobsLoading}
        isError={blueprintIDsError || apiJobsError}
        error={blueprintIDsError || apiJobsError}
        titleAlign="left"
        paperSx={{ position: "relative", height: "auto" }}
        contentGridSx={{
          overflow: "visible",
          minHeight: "auto",
          flex: "0 1 auto",
        }}
      >
        <Grid
          container
          size={12}>
          <Box sx={{ position: "absolute", top: 20, right: 20 }}>
            {!loadingBuild ? (
              <Tooltip title="Create Job On Planner" arrow placement="bottom">
                <IconButton
                  color="primary"
                  size="small"
                  disabled={!bpData}
                  onClick={async () => {
                    if (!bpData) return;
                    updateLoadingBuild((prev) => !prev);

                    const newJob = await buildJob(
                      { itemID: bpData.itemID },
                      { queryClient }
                    );
                    if (!newJob) {
                      updateLoadingBuild((prev) => !prev);
                      return;
                    }

                    await saveJobsViaApi(newJob);

                    const { requestedMarketData, requestedSystemIndexes } =
                      await getMissingESIData(newJob);
                    recalculateInstallCostsWithNewData(
                      newJob,
                      requestedMarketData,
                      requestedSystemIndexes
                    );
                    useUsersStore
                      .getState()
                      .worldData.actions.addMarketData(requestedMarketData);
                    useUsersStore
                      .getState()
                      .worldData.actions.addSystemIndex(requestedSystemIndexes);
                    updateOrAddJobsToJobArray(newJob);
                    showSnackbarSuccess(`${newJob.name} Added`, 3);

                    updateLoadingBuild((prev) => !prev);
                  }}
                >
                  <AddIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <CircularProgress color="primary" size={14} />
            )}
            <Tooltip title="Archived Job Data" arrow placement="bottom">
              <IconButton
                color="primary"
                size="small"
                disabled={!bpData}
                onClick={() => {
                  showBlueprintArchiveDialog(bpData.itemID, bpData?.name);
                }}
              >
                <AssessmentOutlinedIcon />
              </IconButton>
            </Tooltip>

          </Box>

          {!blueprintIDsLoading && !apiJobsLoading ? (
            uniqueOutput.length > 0 ? (
              uniqueOutput.map((blueprint) => {
                return (
                  <BlueprintEntry
                    key={`${bpID}-${blueprint.item_id}`}
                    blueprint={blueprint}
                    esiJobs={esiJobs}
                    bpData={bpData}
                  />
                );
              })
            ) : (
              <Grid size={12}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  No Blueprints Owned
                </Typography>
              </Grid>
            )
          ) : null}
        </Grid>
      </ContentPanel>
    </Grid>
  );
}

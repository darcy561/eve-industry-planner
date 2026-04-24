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
import { CompactBlueprintEntry } from "../Compact/compactBlueprintEntry";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import useGetAllIndustryJobs from "../../../Hooks/EveEsi/useGetAllIndustryJobs";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import addNewJobsToPlanner from "../../../Functions/JobPlanner/addNewJobsToPlanner";

export function CompactBlueprintGroup({ bpID, blueprintResults, currentFilter = "all" }) {
  const [loadingBuild, updateLoadingBuild] = useState(false);
  const queryClient = useQueryClient();
  const { data: blueprintIDs, isLoading: blueprintIDsLoading, error: blueprintIDsError } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  const { data: apiJobs = [], isLoading: apiJobsLoading, error: apiJobsError } = useGetAllIndustryJobs();

  const esiJobs = apiJobs.filter(
    (i) => i.product_type_id === bpID || i.blueprint_type_id === bpID
  );

  let bpData = blueprintIDs?.find((i) => i.blueprintID === bpID);
  let filteredResults = blueprintResults.blueprints.filter(
    (bp) => bp.type_id === bpID
  );

  // If we're in active filter mode, further filter to only include blueprints with active jobs
  // This ensures the count only shows blueprints that actually have active jobs
  // We need to check this even if the parent filtered, because the parent might include
  // all blueprints of a type that has at least one active job
  let resultsToGroup = currentFilter === "active"
    ? filteredResults.filter((bp) => {
      // Check if this specific blueprint has an active job
      // Match by blueprint_id (the job's blueprint) to item_id (the blueprint's unique ID)
      const hasActiveJob = esiJobs.some(
        (job) => job.blueprint_id === bp.item_id && job.status === "active"
      );
      return hasActiveJob;
    })
    : filteredResults;

  // Deduplicate by item_id to ensure we don't count the same blueprint multiple times
  // This is especially important for the active filter where we want accurate counts
  // The parent component may pass duplicate blueprints, so we deduplicate here
  resultsToGroup = Array.from(
    new Map(resultsToGroup.map((bp) => [bp.item_id, bp])).values()
  );

  function sortObjectsIntoArrays(objects) {
    if (!objects || objects.length === 0) {
      return [];
    }
    const result = {};

    objects.forEach((obj) => {
      if (!obj) return;

      // Handle undefined/null values in key generation
      const me = obj["material_efficiency"] ?? 0;
      const te = obj["time_efficiency"] ?? 0;
      const qty = obj["quantity"] ?? 0;
      const runs = obj["runs"] ?? -1;
      const isCorp = obj["is_corporation"] ?? false;

      // Check if this blueprint has an active job
      // This splits active and non-active blueprints into separate groups
      const hasActiveJob = esiJobs.some(
        (job) => job.blueprint_id === obj.item_id && job.status === "active"
      );

      let key = `${me}-${te}-${qty}-${runs}-${isCorp}-${hasActiveJob ? "active" : "inactive"}`;

      // Use CharacterHash (capital C) to match blueprint object structure
      if (obj.CharacterHash) {
        key += `-${obj.CharacterHash}`;
      } else if (obj.corporation_id) {
        key += `-${obj.corporation_id}`;
      }

      if (!result[key]) {
        result[key] = [];
      }

      result[key].push(obj);
    });

    // Deduplicate each group by item_id to ensure accurate counts
    // This prevents the same blueprint from being counted multiple times in a group
    return Object.values(result).map((group) => {
      return Array.from(
        new Map(group.map((bp) => [bp.item_id, bp])).values()
      );
    });
  }

  const sortedResults = sortObjectsIntoArrays(resultsToGroup);

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
        componentName={`Compact Blueprint Group - ${bpID}`}
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
                <Box component="span" sx={{ display: "inline-flex" }}>
                  <IconButton
                    color="primary"
                    size="small"
                    disabled={!bpData}
                    onClick={async () => {
                      if (!bpData) return;
                      updateLoadingBuild((prev) => !prev);
                      await addNewJobsToPlanner(
                        [{ itemID: bpData.itemID }],
                        queryClient
                      );
                      updateLoadingBuild((prev) => !prev);
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
              </Tooltip>
            ) : (
              <CircularProgress color="primary" size={14} />
            )}
            <Tooltip title="Archived Job Data" arrow placement="bottom">
              <Box component="span" sx={{ display: "inline-flex" }}>
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
              </Box>
            </Tooltip>
          </Box>

          <Grid container spacing={1} size={12}>
            {!blueprintIDsLoading && !apiJobsLoading ? (
              sortedResults.length > 0 ? (
                sortedResults
                  .filter((group) => group && group.length > 0 && group[0])
                  .map((blueprintGroup) => {
                    return (
                      <CompactBlueprintEntry
                        key={blueprintGroup[0].item_id}
                        blueprintGroup={blueprintGroup}
                        bpData={bpData}
                        esiJobs={esiJobs}
                      />
                    );
                  })
              ) : (
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  No Blueprints Owned
                </Typography>
              )
            ) : null}
          </Grid>
        </Grid>
      </ContentPanel>
    </Grid>
  );
}

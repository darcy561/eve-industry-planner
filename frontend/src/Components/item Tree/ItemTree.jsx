import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import { useQueryClient } from "@tanstack/react-query";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import { useCachedData } from "../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import { buildJob } from "../../Functions/JobPlanner/buildJob";
import JobDependencyTreeFlow from "../../Styled Components/JobTreeFlow/JobDependencyTreeFlow";
import { buildItemTreeLocally } from "./itemTreeBuilder";
import { showSnackbarInfo, showSnackbarSuccess } from "../../Events/snackbarEvents";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { AppEvent } from "../../analytics/appEventNames";

export function ItemTree() {
  const queryClient = useQueryClient();
  const [selectedItems, setSelectedItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [fitViewRequestKey, setFitViewRequestKey] = useState(0);
  const { data: fullItemList, isLoading, isError } = useCachedData(
    CACHED_DATA_FILES.FULL_ITEM_LIST
  );

  const orderedJobs = useMemo(
    () => [...jobs].sort((a, b) => String(a.jobID).localeCompare(String(b.jobID))),
    [jobs]
  );

  function addItemToSelection(input) {
    const itemID = input?.itemID;
    if (!itemID) return;
    trackAppEvent(AppEvent.VIEW_ITEM_TREE_ITEM, 1, {
      byType: { [String(itemID)]: 1 },
    });
    setSelectedItems((prev) => {
      const copy = prev.map((i) => ({ ...i }));
      const existing = copy.find((i) => i.itemID === itemID);
      if (existing) {
        existing.itemQty += 1;
      } else {
        copy.push({ itemID, itemQty: 1 });
      }
      return copy;
    });
  }

  async function addRootJobs() {
    if (selectedItems.length === 0) return;
    setIsBuilding(true);
    try {
      const existingTypeIds = new Set(jobs.map((j) => j.itemID));
      const requests = selectedItems
        .filter((s) => !existingTypeIds.has(s.itemID))
        .map((s) => ({
          itemID: s.itemID,
          itemQty: s.itemQty,
          parentJobs: [],
          skipJobCreateAnalytics: true,
        }));
      if (requests.length === 0) {
        showSnackbarInfo("Selected items already exist in this item tree.");
        return;
      }
      const newJobs = await buildJob(requests, { queryClient });
      if (!Array.isArray(newJobs) || newJobs.length === 0) return;
      const merged = await buildItemTreeLocally({
        jobs: [...jobs, ...newJobs],
        queryClient,
        buildFullTree: false,
      });
      setJobs(merged);
      setFitViewRequestKey((prev) => prev + 1);
      setSelectedItems([]);
      showSnackbarSuccess(`${newJobs.length} item jobs added.`);
    } finally {
      setIsBuilding(false);
    }
  }

  async function buildTree(buildFullTree) {
    if (jobs.length === 0) return;
    setIsBuilding(true);
    try {
      const next = await buildItemTreeLocally({
        jobs,
        queryClient,
        buildFullTree,
      });
      setJobs(next);
      setFitViewRequestKey((prev) => prev + 1);
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <DefaultPageLayout>
      <ContentPanel
        componentName="Item Tree Page"
        isLoading={isLoading}
        isError={isError}
        paperSx={{ overflow: "hidden" }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, height: "100%" }}>
          <Grid container spacing={1} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <VirtualisedRecipeSearch onSelect={addItemToSelection} />
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={addRootJobs}
                  disabled={isBuilding || selectedItems.length < 1}
                >
                  Add Items
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => buildTree(false)}
                  disabled={isBuilding || jobs.length < 1}
                >
                  Display Next Level
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => buildTree(true)}
                  disabled={isBuilding || jobs.length < 1}
                >
                  Display Full Tree
                </Button>
                <Button
                  variant="text"
                  color="error"
                  size="small"
                  onClick={() => setJobs([])}
                  disabled={isBuilding || jobs.length < 1}
                >
                  Clear Tree
                </Button>
              </Stack>
            </Grid>
            <Grid size={12}>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", minHeight: 34 }}>
                {selectedItems.map((itemObj) => (
                  <Chip
                    key={itemObj.itemID}
                    label={fullItemList?.[itemObj.itemID]?.name ?? String(itemObj.itemID)}
                    size="small"
                    deleteIcon={<ClearIcon />}
                    onDelete={() =>
                      setSelectedItems((prev) =>
                        prev.filter((i) => i.itemID !== itemObj.itemID)
                      )
                    }
                    avatar={
                      <Avatar
                        src={`https://image.eveonline.com/Type/${itemObj.itemID}_32.png`}
                      />
                    }
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ minHeight: 0, flex: 1 }}>
            {orderedJobs.length < 1 ? (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Add an item recipe to start building an item tree.
                </Typography>
              </Box>
            ) : (
              <JobDependencyTreeFlow
                jobs={orderedJobs}
                hideLegend
                fitViewRequestKey={fitViewRequestKey}
              />
            )}
          </Box>
        </Box>
      </ContentPanel>
    </DefaultPageLayout>
  );
}

export default ItemTree;

import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ClearIcon from "@mui/icons-material/Clear";
import { useQueryClient } from "@tanstack/react-query";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import { useCachedData } from "../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import { appShellSetupSectionPaperSx } from "../../Context/appShell";
import { buildJob } from "../../Functions/JobPlanner/buildJob";
import JobDependencyTreeFlow from "../../Styled Components/JobTreeFlow/JobDependencyTreeFlow";
import { buildItemTreeLocally } from "./itemTreeBuilder";
import {
  showSnackbarInfo,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { AppEvent } from "../../analytics/appEventNames";
import { LoadingBrandBackdrop } from "../loadingBrand";

const treeSurfaceSx = {
  ...appShellSetupSectionPaperSx,
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  p: { xs: 1.5, md: 2 },
};

export function ItemTree() {
  const queryClient = useQueryClient();
  const [selectedItems, setSelectedItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [fitViewRequestKey, setFitViewRequestKey] = useState(0);
  const {
    data: fullItemList,
    isLoading,
    isError,
  } = useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST);

  const orderedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => String(a.jobID).localeCompare(String(b.jobID))),
    [jobs],
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
        buildFullTree: true,
      });
      setJobs(merged);
      setFitViewRequestKey((prev) => prev + 1);
      setSelectedItems([]);
      showSnackbarSuccess(
        `${newJobs.length} item job${newJobs.length === 1 ? "" : "s"} added with full dependency tree.`,
      );
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <DefaultPageLayout>
      <LoadingBrandBackdrop
        sx={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          borderRadius: 3,
          alignItems: "stretch",
          justifyContent: "flex-start",
          py: { xs: 2, md: 3 },
          px: { xs: 1, md: 2 },
        }}
      >
        <ContentPanel
          componentName="Item Tree Page"
          isLoading={isLoading}
          isError={isError}
          elevation={0}
          variant="outlined"
          paperSx={{
            ...appShellSetupSectionPaperSx,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            alignSelf: "stretch",
          }}
        >
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
            <Paper
              variant="outlined"
              sx={{
                ...appShellSetupSectionPaperSx,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box
                aria-hidden
                sx={(theme) => ({
                  position: "absolute",
                  inset: 0,
                  bottom: "auto",
                  height: "58%",
                  pointerEvents: "none",
                  background:
                    theme.palette.mode === "dark"
                      ? `radial-gradient(ellipse 88% 72% at 50% -18%, ${alpha(
                          theme.palette.primary.main,
                          0.18,
                        )} 0%, transparent 58%)`
                      : `radial-gradient(ellipse 88% 72% at 50% -18%, ${alpha(
                          theme.palette.primary.main,
                          0.12,
                        )} 0%, transparent 58%)`,
                })}
              />
              <Stack spacing={1.5} sx={{ position: "relative", zIndex: 1 }}>
                <Box sx={{ pb: 0.25 }}>
                  <Typography
                    variant="h5"
                    color="primary"
                    sx={{ fontWeight: 600 }}
                  >
                    Item tree
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.75, maxWidth: "62ch" }}
                  >
                    Search for items to add to the viewer, multiple items can be
                    added and their trees will be combined.
                  </Typography>
                </Box>

                <Grid container spacing={2} sx={{ alignItems: "flex-start" }}>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <VirtualisedRecipeSearch
                      onSelect={addItemToSelection}
                      appShellStyled
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 7 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}
                    >
                      <Button
                        variant="contained"
                        size="small"
                        onClick={addRootJobs}
                        disabled={isBuilding || selectedItems.length < 1}
                      >
                        Add items
                      </Button>
                      <Button
                        variant="text"
                        color="error"
                        size="small"
                        onClick={() => setJobs([])}
                        disabled={isBuilding || jobs.length < 1}
                      >
                        Clear tree
                      </Button>
                    </Stack>
                  </Grid>
                  <Grid size={12}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      Selected queue
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      sx={{ flexWrap: "wrap", gap: 0.75, minHeight: 36 }}
                    >
                      {selectedItems.length < 1 ? (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          No items queued — pick from search above.
                        </Typography>
                      ) : (
                        selectedItems.map((itemObj) => (
                          <Chip
                            key={itemObj.itemID}
                            label={`${fullItemList?.[itemObj.itemID]?.name ?? String(itemObj.itemID)} ×${itemObj.itemQty}`}
                            size="small"
                            deleteIcon={<ClearIcon />}
                            onDelete={() =>
                              setSelectedItems((prev) =>
                                prev.filter((i) => i.itemID !== itemObj.itemID),
                              )
                            }
                            avatar={
                              <Avatar
                                src={`https://image.eveonline.com/Type/${itemObj.itemID}_32.png`}
                                sx={{ width: 24, height: 24 }}
                              />
                            }
                            variant="outlined"
                            sx={(theme) => ({
                              borderColor: alpha(
                                theme.palette.primary.main,
                                0.28,
                              ),
                              bgcolor: alpha(
                                theme.palette.background.paper,
                                theme.palette.mode === "dark" ? 0.4 : 0.92,
                              ),
                            })}
                          />
                        ))
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={treeSurfaceSx}>
              <Box sx={{ minHeight: 0, flex: 1, position: "relative" }}>
                {orderedJobs.length < 1 ? (
                  <Box
                    sx={{
                      height: "100%",
                      minHeight: 240,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      px: 2,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      align="center"
                    >
                      Add at least one item to render the tree here.
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
            </Paper>
          </Stack>
        </ContentPanel>
      </LoadingBrandBackdrop>
    </DefaultPageLayout>
  );
}

export default ItemTree;

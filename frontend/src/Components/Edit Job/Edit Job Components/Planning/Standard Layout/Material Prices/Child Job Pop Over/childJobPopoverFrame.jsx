import { useMemo } from "react";
import { Paper, Popover, Typography, Grid } from "@mui/material";
import { ImportingStateLayout_ChildJobPopoverFrame } from "./fetchState";
import { ChildJobMaterials_ChildJobPopoverFrame } from "./childJobMaterials";
import { ChildJobSwitcher_ChildJobPopoverFrame } from "./switchChildJob";
import { DisplayMismatchedChildTotals_ChildJobPopoverFrame } from "./misMatchedTotals";
import { ChildJobMaterialTotalCosts_ChildJobPopoverFrame } from "./childJobTotalCosts";
import { calculateMaterialCostFromChildJobs } from "../../../../../../../Functions/Groups/materialCostFromChildJobs.js";
import { getJobInstallCostForPlanning } from "../../../../../../../Functions/Installation Costs/installCosts.js";
import { ButtonSelectionLogic_ChildJobPopoverFrame } from "./buttonSelectionLogic";
import { STANDARD_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../../Zustand/usersStore";
import { useChildJobBuildActions } from "../Hooks/useChildJobBuildActions";
import { useChildJobPopoverData } from "../Hooks/useChildJobPopoverData";

export function ChildJobPopoverFrame(props) {
  const {
    state,
    displayPopover,
    updateDisplayPopover,
    material,
    marketSelect,
    listingSelect,
    currentMaterialPrice,
    matchedChildJobs,
  } = props;
  const checkTypeIDisExempt =
    useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const worldMarketData = useUsersStore((state) => state.worldData.marketData);
  const { buildSingleChildJobPreview } = useChildJobBuildActions({
    state,
    actions: props.actions,
  });

  const childJobsLocation = state.activeJob.build.childJobs[material.typeID] || [];
  const {
    jobImportState,
    jobDisplay,
    setJobDisplay,
    childJobObjects,
    fetchError,
    isExistingJobInGroup,
  } = useChildJobPopoverData({
    state,
    displayPopover,
    material,
    matchedChildJobs,
    childJobsLocation,
    buildSingleChildJobPreview,
  });
  const currentJob = childJobObjects[jobDisplay];
  const handleClosePopover = () => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === "function") {
      activeElement.blur();
    }

    if (displayPopover && typeof displayPopover.focus === "function") {
      displayPopover.focus();
    }

    updateDisplayPopover(null);
  };

  const totalCostOfMaterials = useMemo(() => {
    return (currentJob?.build?.materials || []).reduce((prev, rowMaterial) => {
      const childJobs = currentJob.build.childJobs[rowMaterial.typeID];
      return (
        prev +
        calculateMaterialCostFromChildJobs(
          rowMaterial,
          childJobs,
          state.temporaryChildJobs[rowMaterial.typeID],
          {},
          marketSelect,
          listingSelect
        )
      );
    }, 0);
  }, [
    currentJob,
    listingSelect,
    marketSelect,
    state.temporaryChildJobs,
    worldMarketData,
  ]);

  const totalInstallCosts = getJobInstallCostForPlanning(currentJob);

  const quantityProduced = currentJob?.totalQuantityProduced ?? 0;
  const totalCostPerItem =
    quantityProduced !== 0
      ? (totalCostOfMaterials + totalInstallCosts) / quantityProduced
      : 0;

  return (
    <Popover
      id={material.typeID}
      open={Boolean(displayPopover)}
      anchorEl={displayPopover}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      onClose={handleClosePopover}
    >
      <Paper
        square
        elevation={3}
        sx={{ padding: "20px", maxWidth: { xs: "350px", sm: "450px" } }}
      >
        {jobImportState ? (
          <Grid container sx={{ flexDirection: "row" }}>
            <Grid sx={{ marginBottom: "10px" }} size={12}>
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="center"
              >
                {material.name}
              </Typography>
              {checkTypeIDisExempt(material.typeID) && (
                <Typography
                  align="center"
                  sx={{
                    color: "warning.main",
                    typography: STANDARD_TEXT_FORMAT
                  }}>
                  Material has been marked as exempt from builds.
                </Typography>
              )}
            </Grid>
            <Grid container sx={{ marginBottom: "10px" }} size={12}>
              <Grid size={6}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  <b>Item Quantity Required: {material.quantity}</b>
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <ChildJobMaterials_ChildJobPopoverFrame
                {...props}
                childJobObjects={childJobObjects}
                jobDisplay={jobDisplay}
              />
            </Grid>
            <ChildJobMaterialTotalCosts_ChildJobPopoverFrame
              currentMaterialPrice={currentMaterialPrice}
              totalCostOfMaterials={totalCostOfMaterials}
              totalInstallCosts={totalInstallCosts}
              totalCostPerItem={totalCostPerItem}
            />
            <DisplayMismatchedChildTotals_ChildJobPopoverFrame
              materialQuantity={material?.quantity || 0}
              totalItemsProduced={quantityProduced}
              totalCostPerItem={totalCostPerItem}
            />
            <ChildJobSwitcher_ChildJobPopoverFrame
              childJobObjects={childJobObjects}
              jobDisplay={jobDisplay}
              setJobDisplay={setJobDisplay}
            />

            <Grid align="center" sx={{ marginTop: "10px" }} size={12}>
              <ButtonSelectionLogic_ChildJobPopoverFrame
                {...props}
                childJobsLocation={childJobsLocation}
                childJobObjects={childJobObjects}
                jobDisplay={jobDisplay}
                isExistingJobInGroup={isExistingJobInGroup}
              />
            </Grid>
          </Grid>
        ) : (
          <ImportingStateLayout_ChildJobPopoverFrame
            fetchError={fetchError}
            material={material}
          />
        )}
      </Paper>
    </Popover>
  );
}

import { useEffect, useRef, useState } from "react";
import { Paper, Popover, Typography, Grid } from "@mui/material";

import { useJobBuild } from "../../../../../../../Hooks/useJobBuild";
import { ImportingStateLayout_ChildJobPopoverFrame } from "./fetchState";
import { ChildJobMaterials_ChildJobPopoverFrame } from "./childJobMaterials";
import { ChildJobSwitcher_ChildJobPopoverFrame } from "./switchChildJob";
import { DisplayMismatchedChildTotals_ChildJobPopoverFrame } from "./misMatchedTotals";
import { ChildJobMaterialTotalCosts_ChildJobPopoverFrame } from "./childJobTotalCosts";
import { useMaterialCostCalculations } from "../../../../../../../Hooks/GroupHooks/useMaterialCostCalculations";
import { useManageGroupJobs } from "../../../../../../../Hooks/GroupHooks/useManageGroupJobs";
import { ButtonSelectionLogic_ChildJobPopoverFrame } from "./buttonSelectionLogic";
import { STANDARD_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import getMarketData from "../../../../../../../Functions/MarketData/findMarketData";
import useUsersStore from "../../../../../../../Zustand/usersStore";

export function ChildJobPopoverFrame(props) {
  const {
    state,
    actions,
    displayPopover,
    updateDisplayPopover,
    material,
    marketSelect,
    listingSelect,
    currentMaterialPrice,
    matchedChildJobs,
  } = props;
  const checkTypeIDisExempt = useUsersStore.getState().applicationSettings.actions.checkTypeIDisExempt;
  const [tempPrices, updateTempPrices] = useState([]);
  const [jobImportState, updateJobImportState] = useState(false);
  const [jobDisplay, setJobDisplay] = useState(0);
  const [childJobObjects, updateChildJobObjects] = useState([]);
  const [fetchError, updateFetchError] = useState(false);
  const { buildJob } = useJobBuild();
  const { calculateMaterialCostFromChildJobs } = useMaterialCostCalculations();
  const { findMaterialJobIDInGroup } = useManageGroupJobs();

  const childJobsLocation = state.activeJob.build.childJobs[material.typeID];
  const currentJob = childJobObjects[jobDisplay];
  const isExistingJobInGroup = useRef(false);

  useEffect(() => {
    async function fetchData() {
      if (!displayPopover) return;
      const matchedGroupJob = findMaterialJobIDInGroup(
        material.typeID,
        state.activeJob.groupID
      );
      if (matchedGroupJob && matchedChildJobs.length === 0) {
        matchedChildJobs.push(matchedGroupJob);
        isExistingJobInGroup.current = true;
      } else if (matchedChildJobs.length === 0) {
        const newJob = await buildJob({
          itemID: material.typeID,
          itemQty: material.quantity,
          parentJobs: [state.activeJob.jobID],
          groupID: state.activeJob.groupID,
          systemID:
            state.activeJob.build.setup[state.activeJob.layout.setupToEdit]
              .systemID,
        });
        if (!newJob) {
          updateFetchError(true);
        }

        const itemPriceResult = await getMarketData(newJob.getMaterialIDs());

        updateTempPrices((prev) => ({ ...prev, ...itemPriceResult }));
        matchedChildJobs.push(newJob);
      }

      if (matchedChildJobs.length > 0) {
        updateChildJobObjects(matchedChildJobs);
      }
      updateJobImportState(true);
    }
    fetchData();

    return;
  }, [displayPopover]);

  const totalCostOfMaterials = (currentJob?.build?.materials || []).reduce(
    (prev, material) => {
      const childJobs = currentJob.build.childJobs[material.typeID];
      return (prev += calculateMaterialCostFromChildJobs(
        material,
        childJobs,
        state.temporaryChildJobs[material.typeID],
        tempPrices,
        marketSelect,
        listingSelect
      ));
    },
    0
  );

  const totalInstallCosts = Object.values(
    currentJob?.build?.setup || []
  ).reduce((prev, { estimatedInstallCost }) => {
    return (prev += estimatedInstallCost);
  }, 0);

  const totalCostPerItem =
    (currentJob?.build?.products?.totalQuantity || 0) !== 0
      ? (totalCostOfMaterials + totalInstallCosts) /
        currentJob.build.products.totalQuantity
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
      onClose={() => {
        updateDisplayPopover(null);
      }}
    >
      <Paper
        square
        elevation={3}
        sx={{ padding: "20px", maxWidth: { xs: "350px", sm: "450px" } }}
      >
        {jobImportState ? (
          <Grid container direction="row">
            <Grid sx={{ marginBottom: "10px" }} size={12}>
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="center"
              >
                {material.name}
              </Typography>
              {checkTypeIDisExempt(material.typeID) && (
                <Typography
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                  align="center"
                  color="warning.main"
                >
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
                tempPrices={tempPrices}
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
              totalItemsProduced={
                currentJob?.build?.products?.totalQuantity || 0
              }
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
                tempPrices={tempPrices}
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

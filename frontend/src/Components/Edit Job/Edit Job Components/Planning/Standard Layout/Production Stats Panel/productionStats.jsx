import { useCallback } from "react";
import { Typography, Grid } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale, formatTimeDuration } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function ProductionStats({ state, actions }) {
  const { activeJob } = state;
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const setupToEdit = activeJob.layout.setupToEdit;

  const calculateParentRequirements = useCallback(() => {
    let returnObject = {
      parentTotal: 0,
      multipleChildren: false,
      childrenTotal: 0,
    };

    const parentJobSelection = actions.getCurrentParentJobs();

    for (let jobID of parentJobSelection) {
      const job = findJobInJobArray(jobID);

      if (!job) continue;

      const material = job.build.materials.find(
        (i) => i.typeID === activeJob.itemID
      );
      if (!material) continue;
      returnObject.parentTotal += material.quantity;

      const flag = job.build.childJobs[material.typeID].some(
        (i) => i !== activeJob.jobID
      );

      if (flag) {
        for (let childID of job.build.childJobs[material.typeID]) {
          if (childID === activeJob.jobID) continue;
          let childJob = findJobInJobArray(childID);
          if (!childJob) continue;
          returnObject.multipleChildren = true;
          returnObject.childrenTotal += childJob.build.products.totalQuantity;
        }
      }
    }
    return returnObject;
  }, [jobArray, state.parentChildToEdit]);

  if (!activeJob.build.setup[setupToEdit]) return null;

  const timeDisplayFigure = formatTimeDuration(activeJob.build.setup[setupToEdit].estimatedTime);
  const parentRequirements = calculateParentRequirements();

  return (
    <ContentPanel paperSx={{ height: "auto" }}>
      <Grid container direction="column" sx={{}}>
        <Grid container>
          <Grid container sx={{ marginBottom: "5px" }} size={12}>
            <Grid size={10}>
              <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                Items Produced Per Blueprint Run
              </Typography>
            </Grid>
            <Grid size={2}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                align="right"
              >
                {formatNumberForLocale(activeJob.itemsProducedPerRun, {
                  max: 0,
                })}
              </Typography>
            </Grid>
          </Grid>
          <Grid container sx={{ marginBottom: "5px" }} size={12}>
            <Grid size={10}>
              <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                Total Items Per Job Slot
              </Typography>
            </Grid>
            <Grid size={2}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                align="right"
              >
                {formatNumberForLocale(
                  activeJob.itemsProducedPerRun *
                    activeJob.build.setup[setupToEdit].runCount,
                  { max: 0 }
                )}
              </Typography>
            </Grid>
          </Grid>
          <Grid container sx={{ marginBottom: "5px" }} size={12}>
            <Grid size={10}>
              <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                Total Produced Items For Setup
              </Typography>
            </Grid>
            <Grid size={2}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                align="right"
              >
                {formatNumberForLocale(
                  activeJob.itemsProducedPerRun *
                    activeJob.build.setup[setupToEdit].runCount *
                    activeJob.build.setup[setupToEdit].jobCount,
                  { max: 0 }
                )}
              </Typography>
            </Grid>
          </Grid>
          <Grid container size={12}>
            <Grid size={10}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                color={
                  activeJob.build.products.totalQuantity +
                    parentRequirements.childrenTotal <
                  parentRequirements.parentTotal
                    ? "error.main"
                    : null
                }
              >
                Total Produced Items For Job
              </Typography>
            </Grid>

            <Grid size={2}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                align="right"
                color={
                  activeJob.build.products.totalQuantity +
                    parentRequirements.childrenTotal <
                  parentRequirements.parentTotal
                    ? "error.main"
                    : null
                }
              >
                {formatNumberForLocale(activeJob.build.products.totalQuantity, {
                  max: 0,
                })}
              </Typography>
            </Grid>
          </Grid>
          {activeJob.parentJob.length > 0 && activeJob.groupID !== null ? (
            <>
              <Grid container sx={{ marginTop: "10px" }} size={12}>
                <Grid size={10}>
                  <Typography
                    sx={{ typography: { xs: "caption", sm: "body2" } }}
                  >
                    Parent Job(s) Require
                  </Typography>
                </Grid>
                <Grid size={2}>
                  <Typography
                    sx={{ typography: { xs: "caption", sm: "body2" } }}
                    align="right"
                  >
                    {formatNumberForLocale(parentRequirements.parentTotal, {
                      max: 0,
                    })}
                  </Typography>
                </Grid>
              </Grid>
              {parentRequirements.multipleChildren ? (
                <Grid container sx={{ marginTop: "5px" }} size={12}>
                  <Grid size={10}>
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                      color={
                        activeJob.build.products.totalQuantity +
                          parentRequirements.childrenTotal <
                        parentRequirements.parentTotal
                          ? "error.main"
                          : null
                      }
                    >
                      Parents Other Children Produce
                    </Typography>
                  </Grid>
                  <Grid size={2}>
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                      align="right"
                      color={
                        activeJob.build.products.totalQuantity +
                          parentRequirements.childrenTotal <
                        parentRequirements.parentTotal
                          ? "error.main"
                          : null
                      }
                    >
                      {formatNumberForLocale(parentRequirements.childrenTotal, {
                        max: 0,
                      })}
                    </Typography>
                  </Grid>
                </Grid>
              ) : null}
            </>
          ) : null}
          <Grid container size={12}>
            <Grid sx={{ marginTop: "20px" }} size={12}>
              <Typography
                align="center"
                sx={{ typography: { xs: "caption", sm: "body2" } }}
              >
                Time Per Job Slot
              </Typography>
            </Grid>

            <Grid size={12}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                align="center"
              >
                {timeDisplayFigure}
              </Typography>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}

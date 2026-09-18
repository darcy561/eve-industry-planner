import { useCallback } from "react";
import { Typography, Grid } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import useUsersStore from "../../../../../../Zustand/usersStore";
import {
  formatNumberForLocale,
  formatTimeDuration,
} from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { resolveParentRequirements } from "../../../../../../Functions/Groups/parentRequirements";
import calculateTimeForSetup from "../../../../../../Functions/Blueprint Calculations/calculateTimeForSetup";

export function ProductionStats({ state, actions }) {
  const { activeJob } = state;
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const selectedSetup = activeJob.selectedSetup;
  const queryClient = useQueryClient();

  const calculateParentRequirements = useCallback(
    () =>
      resolveParentRequirements({
        parentJobIDs: actions.getCurrentParentJobs(),
        findJobInJobArray,
        itemID: activeJob.itemID,
        jobID: activeJob.jobID,
      }),
    [jobArray, state.parentChildToEdit],
  );

  if (!selectedSetup) return null;

  const timeDisplayFigure = formatTimeDuration(
    calculateTimeForSetup(selectedSetup, activeJob.skills, queryClient),
  );
  const parentRequirements = calculateParentRequirements();

  return (
    <ContentPanel paperSx={{ height: "auto" }}>
      <Grid container sx={{ flexDirection: "column" }}>
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
                  activeJob.itemsProducedPerRun * selectedSetup.runCount,
                  { max: 0 },
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
                    selectedSetup.runCount *
                    selectedSetup.jobCount,
                  { max: 0 },
                )}
              </Typography>
            </Grid>
          </Grid>
          <Grid container size={12}>
            <Grid size={10}>
              <Typography
                sx={{ typography: { xs: "caption", sm: "body2" } }}
                color={
                  activeJob.totalQuantityProduced +
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
                  activeJob.totalQuantityProduced +
                    parentRequirements.childrenTotal <
                  parentRequirements.parentTotal
                    ? "error.main"
                    : null
                }
              >
                {formatNumberForLocale(activeJob.totalQuantityProduced, {
                  max: 0,
                })}
              </Typography>
            </Grid>
          </Grid>
          {activeJob.parentJobs.length > 0 && activeJob.includedInGroup ? (
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
                        activeJob.totalQuantityProduced +
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
                        activeJob.totalQuantityProduced +
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

import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useFirebase } from "../../Hooks/useFirebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import useUsersStore from "../../Zustand/usersStore";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";

export function ArchiveBpData({ archiveOpen, updateArchiveOpen, bpData }) {
  const { updateArchivedJobs } = useUsersStore.getState().jobData.actions;
  const [jobData, updateJobData] = useState(undefined);
  const [getData, updateGetData] = useState(true);
  const { getArchivedJobData } = useFirebase();
  const analytics = getAnalytics();

  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  useEffect(() => {
    async function getArchiveData() {
      if (!archiveOpen || !bpData) {
        return;
      }
      const newArchivedJobsArray = await getArchivedJobData(bpData.itemID);
      const data = newArchivedJobsArray.find((i) => i.typeID === bpData.itemID);
      logEvent(analytics, "View Archived Job Data", {
        UID: parentUser.accountID,
      });
      updateGetData(false);
      updateJobData(data);
      updateArchivedJobs(newArchivedJobsArray);
    }
    getArchiveData();
  }, [archiveOpen, bpData]);

  return (
    <Dialog
      open={archiveOpen}
      onClose={() => {
        updateArchiveOpen(false);
      }}
      disableEnforceFocus={false}
      disableAutoFocus={false}
      sx={{ padding: "20px" }}
    >
      <DialogTitle align="center" color="primary" sx={{ marginBottom: "20px" }}>
        {bpData?.name || "Blueprint"} Archived Data
      </DialogTitle>
      {getData && (
        <DialogContent>
          <Grid container>
            <Grid align="center" size={12}>
              <CircularProgress color="primary" />
            </Grid>
            <Grid align="center" size={12}>
              <Typography>Loading...</Typography>
            </Grid>
          </Grid>
        </DialogContent>
      )}
      {jobData ? (
        <DialogContent>
          <Grid container>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Total Jobs:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>{jobData.totalJobs}</Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Total Items Built:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(jobData.itemBuildCount, { max: 0 })}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Average Item Cost:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(
                    ((jobData.jobCostTotal / jobData.itemBuildCount +
                      Number.EPSILON) *
                      100) /
                      100
                  )}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Job Cost Total:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(jobData.jobCostTotal)}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Sales Total:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(jobData.salesTotal)}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Brokers Fee Total:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(jobData.brokersFeeTotal)}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Transaction Fee Total:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>
                  {formatNumberForLocale(jobData.transactionFeeTotal)}
                </Typography>
              </Grid>
            </Grid>
            <Grid container size={12}>
              <Grid
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography>Profit/Loss:</Typography>
              </Grid>
              <Grid
                align="right"
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Typography
                  color={jobData.profitLoss >= 0 ? "primary" : "error"}
                >
                  {formatNumberForLocale(jobData.profitLoss)}
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>
      ) : (
        <DialogContent>
          <Grid align="center">
            You have no archived jobs matching this item type.
          </Grid>
        </DialogContent>
      )}
    </Dialog>
  );
}

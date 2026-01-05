import { useMemo } from "react";
import { Icon, Typography, Tooltip, Grid } from "@mui/material";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import DoneIcon from "@mui/icons-material/Done";
import CloseIcon from "@mui/icons-material/Close";
import { jobTypes } from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

export default function ArchiveJobsPanel({ state }) {
  const archivedJobs = useUsersStore((state) => state.jobData.archivedJobs);
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);

  const archiveData = useMemo(
    () => archivedJobs.find((i) => i.typeID === state.activeJob.itemID),
    [archivedJobs]
  );

  if (!isLoggedIn) {
    return null;
  }
  return (
    <ContentPanel title="Archived Job Data" paperSx={{ height: "auto" }}>
      <Grid container spacing={2} width="100%">
        <Grid container size={12}>
          <Grid
            sx={{ display: { xs: "none", sm: "block" } }}
            size={{
              xs: 0,
              sm: state.activeJob.jobType === jobTypes.reaction ? 3 : 2,
            }}
          >
            <Typography
              align="center"
              sx={{ typography: STANDARD_TEXT_FORMAT }}
            >
              Total Items Produced
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 4,
              sm: 3,
            }}
          >
            <Typography
              align="center"
              sx={{ typography: STANDARD_TEXT_FORMAT }}
            >
              Total Job Cost
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 4,
              sm: 2,
            }}
          >
            <Typography
              align="center"
              sx={{ typography: STANDARD_TEXT_FORMAT }}
            >
              Job Cost Per Item
            </Typography>
          </Grid>
          <Grid
            sx={{
              display: {
                xs:
                  state.activeJob.jobType === jobTypes.reaction
                    ? "block"
                    : "none",
                sm: "block",
              },
            }}
            size={{
              xs: state.activeJob.jobType === jobTypes.reaction ? 4 : 0,
              sm: state.activeJob.jobType === jobTypes.reaction ? 3 : 2,
            }}
          >
            <Tooltip
              title="Jobs without any sales data will always display 0"
              arrow
              placement="top"
            >
              <Typography
                align="center"
                sx={{
                  typography: STANDARD_TEXT_FORMAT,
                }}
              >
                Profit/Loss
              </Typography>
            </Tooltip>
          </Grid>
          <Grid
            sx={{ display: { xs: "none", sm: "block" } }}
            size={{
              xs: 0,
              sm: 1,
            }}
          >
            <Tooltip
              title="Indicates weather this the job had a parent that it was used to construct."
              arrow
              placement="top"
            >
              <Typography
                align="center"
                sx={{ typography: STANDARD_TEXT_FORMAT }}
              >
                Child Job
              </Typography>
            </Tooltip>
          </Grid>
        </Grid>
        <Grid container size={12}>
          {archiveData !== undefined ? (
            archiveData.dataSnapshots.map((entry) => {
              return (
                <Grid key={entry.jobID} container size={12}>
                  <Grid
                    sx={{ display: { xs: "none", sm: "block" } }}
                    size={{
                      xs: 0,
                      sm: state.activeJob.jobType === jobTypes.reaction ? 3 : 2,
                    }}
                  >
                    <Typography
                      align="center"
                      sx={{
                        typography: STANDARD_TEXT_FORMAT,
                      }}
                    >
                      {formatNumberForLocale(entry.totalProduced, { max: 0 })}
                    </Typography>
                  </Grid>
                  <Grid
                    size={{
                      xs: 4,
                      sm: 3,
                    }}
                  >
                    <Typography
                      align="center"
                      sx={{ typography: STANDARD_TEXT_FORMAT }}
                    >
                      {formatNumberForLocale(entry.totalJobCost)}
                    </Typography>
                  </Grid>
                  <Grid
                    size={{
                      xs: 4,
                      sm: 2,
                    }}
                  >
                    <Typography
                      align="center"
                      sx={{ typography: STANDARD_TEXT_FORMAT }}
                    >
                      {formatNumberForLocale(entry.totalCostPerItem)}
                    </Typography>
                  </Grid>
                  <Grid
                    sx={{
                      display: {
                        xs:
                          state.activeJob.jobType === jobTypes.reaction
                            ? "block"
                            : "none",
                        sm: "block",
                      },
                    }}
                    size={{
                      xs: state.activeJob.jobType === jobTypes.reaction ? 4 : 0,
                      sm: state.activeJob.jobType === jobTypes.reaction ? 3 : 2,
                    }}
                  >
                    <Typography
                      align="center"
                      sx={{
                        typography: STANDARD_TEXT_FORMAT,
                      }}
                    >
                      {formatNumberForLocale(entry.profitLoss)}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    sx={{ display: { xs: "none", sm: "block" } }}
                    size={{
                      xs: 0,
                      sm: 1,
                    }}
                  >
                    {entry.childJob ? (
                      <Icon fontSize="small" color="success">
                        <DoneIcon />
                      </Icon>
                    ) : (
                      <Icon fontSize="small" color="error">
                        <CloseIcon />
                      </Icon>
                    )}
                  </Grid>
                </Grid>
              );
            })
          ) : (
            <Grid size={12}>
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="center"
              >
                No Archived Job Data To Display
              </Typography>
            </Grid>
          )}
        </Grid>
      </Grid>
    </ContentPanel>
  );
}

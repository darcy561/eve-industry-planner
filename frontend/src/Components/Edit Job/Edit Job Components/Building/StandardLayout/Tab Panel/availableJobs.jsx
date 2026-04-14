import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { MdOutlineAddLink } from "react-icons/md";
import { getAnalytics, logEvent } from "firebase/analytics";
import { useJobManagement } from "../../../../../../Hooks/useJobManagement";
import { LARGE_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useState } from "react";
import PanelFallBack from "../../../../panelStates";
import { formatNumberForLocale, formatTimeRemaining } from "../../../../../../Functions/Helper/numberParser";

export function AvailableJobsTab(props) {
  const { state, actions, jobMatches, isLoading, isError, error } =
    props;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { findBlueprintType } = useJobManagement();
  const [clickedJobs, setClickedJobs] = useState(new Set());

  const analytics = getAnalytics();

  const getStatusColor = (status, isReadyToDeliver) => {
    if (isReadyToDeliver) {
      return "success";
    }
    switch (status) {
      case "active":
        return "warning";
      case "delivered":
        return "info";
      case "cancelled":
        return "error";
      default:
        return "default";
    }
  };

  const handleLinkAll = () => {
    for (let job of jobMatches) {
      const jobOwner = useUsersStore
        .getState()
        .account.actions.findCharacterById(job.installer_id);
      state.activeJob.linkESIJob(job, jobOwner);
    }
    actions.addIndustryESIJobsForAddition(jobMatches.map((job) => job.job_id));
    actions.updateActiveJob(state.activeJob);

    showSnackbarSuccess(`${jobMatches.length} Jobs Linked`);
    logEvent(analytics, "linkESIJobBulk", {
      UID: useUsersStore.getState().account.actions.getAccountID(),
      isLoggedIn: isLoggedIn,
    });
  };

  const handleJobClick = (job) => {
    const jobOwner = useUsersStore
      .getState()
      .account.actions.findCharacterById(job.installer_id);

    setClickedJobs((prev) => new Set([...prev, job.job_id]));

    setTimeout(() => {
      state.activeJob.linkESIJob(job, jobOwner);
      actions.addIndustryESIJobsForAddition(job.job_id);
      actions.updateActiveJob(state.activeJob);
      showSnackbarSuccess("Linked");
      logEvent(analytics, "linkESIJob", {
        UID: useUsersStore.getState().account.actions.getAccountID(),
        isLoggedIn: isLoggedIn,
      });
    }, 800);
  };

  // Show loading state first
  if (isLoading) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  // Show error state if there's an error
  if (isError) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  // Show jobs if we have matches and haven't reached the job limit
  if (
    jobMatches.length !== 0 &&
    state.activeJob.apiJobs.size < state.activeJob.totalJobCount()
  ) {
    return (
      <>
        <Grid
          container
          spacing={2}
          sx={{
            marginBottom: "10px",
            overflowY: "auto",
            maxHeight: {
              xs: "350px",
              sm: "260px",
              md: "240px",
              lg: "240px",
              xl: "480px",
            },
            "& > .MuiGrid-item": {
              transition: "all 800ms ease-in-out",
              "&.clicked": {
                transform: "scale(0.95)",
                opacity: 0,
                height: 0,
                margin: 0,
                padding: 0,
                overflow: "hidden",
              },
            },
          }}
        >
          {jobMatches.map((job) => {
            const jobOwner = useUsersStore
              .getState()
              .account.actions.findCharacterById(job.installer_id);

            if (!jobOwner) return null;

            const blueprintType = findBlueprintType(job.blueprint_id);
            const facilityName =
              useUsersStore
                .getState()
                .worldData.actions.findUniverseData(job.facility_id)?.name ||
              "Location Data Unavailable";
            const timeRemaining = formatTimeRemaining(Date.parse(job.end_date));
            const isReadyToDeliver =
              job.status === "active" && 
              (timeRemaining === "Complete" || 
               Date.parse(job.end_date) - Date.now() <= 0);

            return (
              <Grid
                key={`job-${job.job_id}`}
                className={clickedJobs.has(job.job_id) ? "clicked" : ""}
                size={{
                  xs: 12,
                  sm: 6,
                  md: 4,
                  lg: 3
                }}>
                <Tooltip
                  title="Click anywhere on the card to link this job"
                  placement="top"
                  arrow
                >
                  <Card
                    sx={{
                      height: "100%",
                      cursor: "pointer",
                      "&:hover": {
                        boxShadow: 6,
                      },
                      position: "relative",
                      overflow: "visible",
                    }}
                    onClick={() => handleJobClick(job)}
                  >
                    <Tooltip
                      title={`Progress: ${
                        job.status === "delivered"
                          ? "100"
                          : isReadyToDeliver
                          ? "100"
                          : Math.round(
                              100 -
                                ((Date.parse(job.end_date) - Date.now()) /
                                  (Date.parse(job.end_date) -
                                    Date.parse(job.start_date))) *
                                  100
                            )
                      }%`}
                      arrow
                    >
                      <LinearProgress
                        variant="determinate"
                        value={
                          job.status === "delivered"
                            ? 100
                            : isReadyToDeliver
                            ? 100
                            : 100 -
                              ((Date.parse(job.end_date) - Date.now()) /
                                (Date.parse(job.end_date) -
                                  Date.parse(job.start_date))) *
                                100
                        }
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 4,
                          borderRadius: "4px 4px 0 0",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: "4px 4px 0 0",
                          },
                        }}
                      />
                    </Tooltip>
                    <CardHeader
                      avatar={
                        <Tooltip
                          title={`Character: ${jobOwner.CharacterName}`}
                          arrow
                        >
                          <Badge
                            overlap="circular"
                            anchorOrigin={{
                              vertical: "bottom",
                              horizontal: "right",
                            }}
                            badgeContent={
                              <Avatar
                                src={`https://images.evetech.net/characters/${jobOwner.CharacterID}/portrait`}
                                variant="circular"
                                sx={{
                                  height: "24px",
                                  width: "24px",
                                  border: "1px solid white",
                                }}
                              />
                            }
                          >
                            <Avatar
                              src={`https://images.evetech.net/types/${job.blueprint_type_id}/${blueprintType}?size=64`}
                              variant="square"
                              sx={{ width: 40, height: 40 }}
                            />
                          </Badge>
                        </Tooltip>
                      }
                      action={
                        job.is_corporation && (
                          <Tooltip title="Corporation Job" arrow>
                            <Avatar
                              src={`https://images.evetech.net/corporations/${job.corporation_id}/logo?size=32`}
                              sx={{
                                width: 32,
                                height: 32,
                                border: "1px solid",
                                borderColor: "divider",
                              }}
                            />
                          </Tooltip>
                        )
                      }
                      title={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body1" noWrap>
                            {formatNumberForLocale(job.runs, { max: 0 })} Runs
                          </Typography>
                        </Stack>
                      }
                      subheader={
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                        >
                          {facilityName}
                        </Typography>
                      }
                    />
                    <CardContent sx={{ pt: 0, pb: 0 }}>
                      <Stack spacing={0.1}>
                        {job.status === "active" && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            align="center"
                          >
                            {isReadyToDeliver
                              ? "Ready to Deliver"
                              : timeRemaining}
                          </Typography>
                        )}
                        <Chip
                          label={
                            isReadyToDeliver
                              ? "Ready for Delivery"
                              : job.status.charAt(0).toUpperCase() +
                                job.status.slice(1)
                          }
                          color={getStatusColor(job.status, isReadyToDeliver)}
                          size="small"
                          sx={{
                            width: "100%",
                            height: 20,
                            "& .MuiChip-label": {
                              px: 0.5,
                            },
                          }}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
        {jobMatches.length > 1 && (
          <Grid container sx={{ marginTop: 2 }}>
            <Grid align="right" size={12}>
              <Tooltip
                title={
                  jobMatches.length > state.activeJob.jobCount
                    ? "Cannot link all jobs: Not enough job slots available"
                    : "Click to link all available jobs at once"
                }
                arrow
              >
                <span>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleLinkAll}
                    disabled={jobMatches.length > state.activeJob.jobCount}
                    startIcon={<MdOutlineAddLink />}
                  >
                    Link All Jobs
                  </Button>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
        )}
      </>
    );
  } else if (
    state.activeJob.build.costs.linkedJobs.length >= state.activeJob.jobCount
  ) {
    return (
      <Grid
        align="center"
        sx={{
          marginTop: { xs: "20px", sm: "30px" },
        }}
        size={12}>
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
          You have linked the maximum number of jobs from the API, if you need
          to link more increase the number of job slots used.
        </Typography>
      </Grid>
    );
  } else {
    return (
      <Grid
        align="center"
        sx={{
          marginTop: { xs: "20px", sm: "30px" },
        }}
        size={12}>
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
          There are no matching industry jobs from the API that match this job.
        </Typography>
      </Grid>
    );
  }
}

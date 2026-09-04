import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Badge,
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
import {
  LARGE_TEXT_FORMAT
} from "../../../../../../Context/defaultValues";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import PanelFallBack from "../../../../panelStates";
import { formatNumberForLocale, formatTimeRemaining } from "../../../../../../Functions/Helper/numberParser";
import findBlueprintType from "../../../../../../Functions/Shared/findBlueprintType";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";

/**
 * Unlinking an ESI job removes a run from `activeJob.build.costs.linkedJobs` (persisted), so
 * the gate is the active job lock (group locks cascade into it automatically).
 */
export function LinkedJobsTab(props) {
  const { state, actions, isLoading, isError, error } = props;
  const queryClient = useQueryClient();
  const [clickedJobs, setClickedJobs] = useState(new Set());
  const [removedJobs, setRemovedJobs] = useState(new Set());
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const getStatusColor = (status, isReadyToDeliver) => {
    if (isReadyToDeliver) {
      return "info";
    }
    switch (status) {
      case "active":
        return "warning";
      case "delivered":
        return "success";
      case "cancelled":
        return "error";
      default:
        return "default";
    }
  };

  const handleUnlinkJob = (job) => {
    if (jobLockReadOnly) return;
    setClickedJobs((prev) => new Set([...prev, job.job_id]));

    setTimeout(() => {
      setRemovedJobs((prev) => new Set([...prev, job.job_id]));
      state.activeJob.unlinkESIJob(job);
      actions.addIndustryESIJobsForRemoval(job.job_id);
      actions.updateActiveJob(state.activeJob);
      showSnackbarSuccess("Unlinked");
    }, 800);
  };

  if (isLoading) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  if (isError) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  if (state.activeJob.esiJobIDs.size !== 0) {
    return (
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
        {state.activeJob.build.costs.linkedJobs
          .filter((job) => !removedJobs.has(job.job_id))
          .map((job) => {
            const jobOwner = useUsersStore
              .getState()
              .account.actions.findCharacterByHash(job.CharacterHash);

            const blueprintType = findBlueprintType(job.blueprint_id, queryClient);
            const facilityData = useUsersStore
              .getState()
              .worldData.actions.findUniverseData(job.station_id);
            const timeRemaining = formatTimeRemaining(job.finishesAt);
            const isReadyToDeliver = job.isReadyToDeliver;

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
                  title={
                    jobLockReadOnly
                      ? lockReasonText({ action: "unlinking is disabled" })
                      : "Click anywhere on the card to unlink this job"
                  }
                  placement="top"
                  arrow
                >
                  <Card
                    sx={{
                      height: "100%",
                      cursor: jobLockReadOnly ? "not-allowed" : "pointer",
                      opacity: jobLockReadOnly ? 0.6 : 1,
                      "&:hover": {
                        boxShadow: jobLockReadOnly ? 1 : 6,
                      },
                      position: "relative",
                      overflow: "visible",
                    }}
                    onClick={() => handleUnlinkJob(job)}
                  >
                    <LinearProgress
                      variant="determinate"
                      value={job.progressPercent()}
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
                    <CardHeader
                      avatar={
                        <Tooltip
                          title={jobOwner?.CharacterName || "Unknown Character"}
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
                                src={
                                  jobOwner
                                    ? `https://images.evetech.net/characters/${jobOwner.CharacterID}/portrait`
                                    : ""
                                }
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
                        <Stack direction="row" spacing={1} sx={{
                          alignItems: "center"
                        }}>
                          <Typography variant="body1" noWrap>
                            {formatNumberForLocale(job.runs, { max: 0 })} Runs
                          </Typography>
                        </Stack>
                      }
                      subheader={
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{
                            color: "text.secondary"
                          }}
                        >
                          {facilityData
                            ? facilityData.name
                            : "Location Data Unavailable"}
                        </Typography>
                      }
                    />
                    <CardContent sx={{ pt: 0, pb: 0 }}>
                      <Stack spacing={0.1}>
                        {job.status === "active" && (
                          <Typography
                            variant="caption"
                            align="center"
                            sx={{
                              color: "text.secondary"
                            }}
                          >
                            {isReadyToDeliver
                              ? "Ready to Deliver"
                              : timeRemaining}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          align="center"
                          sx={{
                            color: "text.secondary"
                          }}
                        >
                          Install Cost: {formatNumberForLocale(job.cost)} ISK
                        </Typography>
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
    );
  } else {
    return (
      <Grid
        align="center"
        sx={{
          marginTop: { xs: "20px", sm: "30px" },
        }}
        size={12}>
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
          You currently have no industry jobs from the ESI linked to the this
          job.
        </Typography>
      </Grid>
    );
  }
}

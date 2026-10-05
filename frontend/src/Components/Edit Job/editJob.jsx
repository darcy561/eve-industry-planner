import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import {
  Avatar,
  Divider,
  Grid,
  IconButton,
  Step,
  StepButton,
  StepContent,
  Stepper,
  Tooltip,
  Typography,
  Box,
} from "@mui/material";
import { CloseJobIcon } from "./closeIcon";
import { SaveJobIcon } from "./saveIcon";
import { DeleteJobIcon } from "./deleteIcon";
import { LinkedJobBadge } from "./Linked Job Badge";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SchemaIcon from "@mui/icons-material/Schema";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { ShoppingListDialogue } from "../Dialogues/Shopping List/ShoppingList";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import { useJobDeletedRemotely } from "./Edit Job Hooks/useJobDeletedRemotely.js";
import { useIsScrolledOutOfView } from "../../Hooks/GeneralHooks/useIsScrolledOutOfView";
import StepErrorBoundary from "./StepErrorBoundary";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import { openJobLinkTreeFromEditPage } from "../../Events/jobDependencyTreeDialogueEvents";
import { useJobStatuses } from "../../Hooks/useJobStatuses";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
import {
  useJobActions,
  useJobDraft,
  useSessionLoading,
  useSessionLoadingMessage,
} from "./Edit Job Hooks/useJobDraft";
import {
  setJobPricing,
  setJobStatus,
  stepBackward,
  stepForward,
} from "./Edit Job Hooks/jobCommands";
import { useStripRedundantJobMarketHubOverrides } from "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import EditJobLeaveConfirmDialogue from "./EditJobLeaveConfirmDialogue";
import ChangeReviewDialogue from "./Change Review/ChangeReviewDialogue";
import IncomingSaveNotice from "./Change Review/IncomingSaveNotice";
import { useEditJobLeaveConfirm } from "./Edit Job Hooks/useEditJobLeaveConfirm";
import EditJobStepContentSelector from "./EditJobStepContentSelector";
import { useEditJobInitialState } from "./Edit Job Hooks/useEditJobInitialState";
import { useEditJobDocumentLocks } from "./Edit Job Hooks/useEditJobDocumentLocks";
import { useRefreshLinkedESIData } from "./Hooks/useRefreshLinkedESIData";
import {
  canJumpToJobStep,
  canMoveJobBackward,
  canMoveJobForward,
  getLastStepIndex,
  isFinalStepLockedForJob,
} from "../../Functions/Job/editing/jobStepNavigation";
import { TYPE_IMAGE, typeImageUrl } from "../../Functions/Shared/eveImage";
import { endEditSession } from "../../Functions/Job/editing/editSessionLifetime.js";

export default function EditJob_New() {
  const actions = useJobActions();
  const openJobID = useJobDraft((job) => job.jobID);
  const openJobName = useJobDraft((job) => job.name);
  const openJobItemID = useJobDraft((job) => job.itemID);
  const openJobGroupID = useJobDraft((job) => job.groupID);
  const jobPricing = useJobDraft((job) => job.build.localPricing);
  const jobStatus = useJobDraft((job) => job.jobStatus) ?? 0;
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const isReadyToSell = useJobDraft((job) => job.isReadyToSell);
  const isLoading = useSessionLoading();
  const loadingMessage = useSessionLoadingMessage();
  const { jobStatuses } = useJobStatuses();
  const params = useParams({ from: "/editjob/$jobID" });
  const { jobID } = params;
  const [prevStepButtonOutOfView, prevStepButtonRef] = useIsScrolledOutOfView();
  const [nextStepButtonOutOfView, nextStepButtonRef] = useIsScrolledOutOfView();

  useStripRedundantJobMarketHubOverrides(jobPricing, (patch) =>
    actions.run(setJobPricing(patch)),
  );
  useRefreshLinkedESIData(openJobID, actions.run);
  useEditJobDocumentLocks({
    jobID,
    openJobID,
    groupID: openJobGroupID,
    isLoading,
  });

  useEffect(() => () => endEditSession(), []);

  useWarnBeforeUnload();
  useJobDeletedRemotely(jobID);

  const { leaveConfirmDialogueProps } = useEditJobLeaveConfirm();
  useEditJobInitialState({
    jobID,
    currentActiveJobID: openJobID,
    actions,
  });

  const openJob = openJobID
    ? { jobStatus, includedInGroup, isReadyToSell }
    : null;
  const lastStepIndex = getLastStepIndex(jobStatuses.length);
  const finalStepGateActive = isFinalStepLockedForJob(openJob);
  const canMoveBackward = canMoveJobBackward(openJob);
  const canMoveForward = canMoveJobForward(openJob, {
    lastStepIndex,
    lockFinalStep: false,
  });
  const disableMoveForward = !canMoveJobForward(openJob, {
    lastStepIndex,
    lockFinalStep: finalStepGateActive,
  });
  const showFloatingPrevStep = canMoveBackward && prevStepButtonOutOfView;
  const showFloatingNextStep = canMoveForward && nextStepButtonOutOfView;

  function jumpToJobStep(targetStep) {
    if (
      !canJumpToJobStep(openJob, targetStep, {
        lastStepIndex,
        lockFinalStep: finalStepGateActive,
      })
    ) {
      return;
    }

    actions.run(setJobStatus(targetStep));
  }

  return (
    <>
      <ContentPanel
        componentName="Edit Job"
        isLoading={isLoading || !openJobID}
        loadingMessage={loadingMessage}
        loadingVariant="simple"
        contentGridSx={{ overflow: "visible" }}
      >
        {openJobID && (
          <Grid container sx={{ width: "100%" }}>
            <Grid
              size={12}
              sx={{
                position: "sticky",
                top: { xs: 56, sm: 64 },
                zIndex: (theme) => theme.zIndex.appBar - 3,
                backgroundColor: "background.paper",
                backgroundImage: (theme) =>
                  theme.palette.mode === "dark"
                    ? "linear-gradient(rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.08))"
                    : "none",
                boxShadow: (theme) => theme.shadows[3],
                borderBottom: 1,
                borderColor: "divider",
                mb: { xs: 1 },
                py: 1,
              }}
            >
              <Grid container sx={{ width: "100%", minWidth: 0 }}>
                <Grid
                  size={{
                    xs: 8,
                    sm: 8,
                    md: 9,
                    lg: 10,
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    minWidth: 0,
                    gap: { sm: 1.5, md: 2 },
                  }}
                >
                  <Avatar
                    src={typeImageUrl(openJobItemID, TYPE_IMAGE.ICON, 32)}
                    alt={openJobName}
                    variant="square"
                    sx={{
                      display: { xs: "none", sm: "block" },
                      height: { sm: "36px", md: "42px" },
                      width: { sm: "36px", md: "42px" },
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="h3"
                    color="primary"
                    align="left"
                    sx={{
                      flex: "1 1 0%",
                      minWidth: 0,
                      maxWidth: "100%",
                      fontSize: {
                        xs: "1.5rem",
                        sm: "2rem",
                        md: "3rem",
                      },
                      lineHeight: {
                        xs: 1.2,
                        sm: 1.3,
                        md: 1.4,
                      },
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {openJobName}
                  </Typography>
                </Grid>
                <Grid
                  align="right"
                  size={{
                    xs: 4,
                    sm: 4,
                    md: 3,
                    lg: 2,
                  }}
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    gap: {
                      xs: 0.5,
                      sm: 0.75,
                      md: 1,
                    },
                    flexShrink: 0,
                  }}
                >
                  <Tooltip title="View this jobs item tree">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={() => {
                          if (!openJobID) return;
                          const { activeGroup, pageView } =
                            readEditJobUrlSearch();
                          openJobLinkTreeFromEditPage({
                            jobId: openJobID,
                            activeGroup,
                            pageView,
                          });
                        }}
                        size="small"
                        aria-label="View this jobs item tree"
                        disabled={!openJobID}
                        sx={{
                          paddingRight: 2,
                        }}
                      >
                        <SchemaIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <DeleteJobIcon />
                  <CloseJobIcon />
                  <SaveJobIcon />
                </Grid>
              </Grid>
            </Grid>
            {showFloatingPrevStep && (
              <Box
                sx={{
                  position: "fixed",
                  top: { xs: 136, sm: 156 },
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: (theme) => theme.zIndex.appBar - 2,
                  backgroundColor: "background.paper",
                  borderRadius: "50%",
                  boxShadow: (theme) => theme.shadows[3],
                }}
              >
                <Tooltip title="Move to previous step" arrow placement="right">
                  <span>
                    <IconButton
                      color="primary"
                      onClick={() => actions.run(stepBackward())}
                      size="large"
                    >
                      <ArrowUpwardIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            )}
            {showFloatingNextStep && (
              <Box
                sx={{
                  position: "fixed",
                  bottom: 16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: (theme) => theme.zIndex.appBar - 2,
                  backgroundColor: "background.paper",
                  borderRadius: "50%",
                  boxShadow: (theme) => theme.shadows[3],
                }}
              >
                <Tooltip title="Move to next step" arrow placement="right">
                  <span>
                    <IconButton
                      color="primary"
                      onClick={() => actions.run(stepForward())}
                      size="large"
                      disabled={disableMoveForward}
                    >
                      <ArrowDownwardIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            )}
            <Grid
              sx={{ marginTop: { xs: "14px", sm: "10px" } }}
              size={{
                xs: 12,
                sm: 10,
              }}
            >
              <LinkedJobBadge />
            </Grid>
            <Grid size={12}>
              <IncomingSaveNotice />
            </Grid>
            <Grid size={12}>
              <Stepper activeStep={jobStatus} orientation="vertical">
                {jobStatuses.map((status) => {
                  return (
                    <Step
                      key={status.id}
                      sx={{
                        "& MuiStepIcon-text": {
                          fill: "#000",
                        },
                      }}
                    >
                      <StepButton
                        onClick={() => jumpToJobStep(status.id)}
                        disabled={
                          status.id === jobStatus ||
                          (status.id === lastStepIndex && finalStepGateActive)
                        }
                        sx={{
                          "& .MuiStepLabel-label": {
                            textAlign: "left",
                          },
                        }}
                      >
                        {status.name}
                      </StepButton>
                      <StepContent
                        sx={{
                          width: "100%",
                          marginLeft: { xs: 0, md: "12px" },
                          paddingLeft: { xs: 1, md: "20px" },
                          paddingRight: { xs: 0, md: 1 },
                          borderLeft: { xs: 0, md: 1 },
                          borderColor: { md: "divider" },
                        }}
                      >
                        <Divider />
                        {canMoveBackward && (
                          <Grid
                            align="center"
                            size={12}
                            ref={prevStepButtonRef}
                          >
                            <Tooltip
                              title="Move to previous step"
                              arrow
                              placement="right"
                            >
                              <IconButton
                                color="primary"
                                onClick={() => actions.run(stepBackward())}
                                size="large"
                              >
                                <ArrowUpwardIcon />
                              </IconButton>
                            </Tooltip>
                          </Grid>
                        )}
                        <StepErrorBoundary
                          currentStep={
                            jobStatuses[jobStatus]?.name || `Step ${jobStatus}`
                          }
                        >
                          <Box sx={{ width: "100%" }}>
                            <EditJobStepContentSelector />
                          </Box>
                        </StepErrorBoundary>
                        {canMoveForward && (
                          <Grid
                            align="center"
                            size={12}
                            ref={nextStepButtonRef}
                          >
                            <Tooltip
                              title="Move to next step"
                              arrow
                              placement="right"
                            >
                              <IconButton
                                color="primary"
                                onClick={() => actions.run(stepForward())}
                                size="large"
                                disabled={disableMoveForward}
                              >
                                <ArrowDownwardIcon />
                              </IconButton>
                            </Tooltip>
                          </Grid>
                        )}
                        <Divider />
                      </StepContent>
                    </Step>
                  );
                })}
              </Stepper>
            </Grid>
          </Grid>
        )}
      </ContentPanel>
      <ShoppingListDialogue />
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <AssetsDialogue />
      <EditJobLeaveConfirmDialogue {...leaveConfirmDialogueProps} />
      <ChangeReviewDialogue />
    </>
  );

  /**
   * Read `/editjob/$id` query params at call time (e.g.
   *
   * @returns {{ activeGroup: string|undefined, pageView: string|undefined }}
   */
  function readEditJobUrlSearch() {
    if (typeof window === "undefined") {
      return { activeGroup: undefined, pageView: undefined };
    }
    const p = new URLSearchParams(window.location.search);
    const ag = p.get("activeGroup");
    const pageView = p.get("pageView");
    return {
      activeGroup: ag && ag.trim() !== "" ? ag : undefined,
      pageView: pageView && pageView.trim() !== "" ? pageView : undefined,
    };
  }
}

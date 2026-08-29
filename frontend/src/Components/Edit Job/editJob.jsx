import { useEffect, useRef, useState } from "react";
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
import StepErrorBoundary from "./StepErrorBoundary";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import useUsersStore from "../../Zustand/usersStore";
import { openJobLinkTreeFromEditPage } from "../../Events/jobDependencyTreeDialogueEvents";
import { useJobStatuses } from "../Job Planner/Hooks/useJobStatuses";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
import useEditJobReducer from "./Edit Job Hooks/useEditJobReducer";
import { useStripRedundantJobMarketHubOverrides } from "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import EditJobLeaveConfirmDialogue from "./EditJobLeaveConfirmDialogue";
import { useEditJobLeaveConfirm } from "./Edit Job Hooks/useEditJobLeaveConfirm";
import EditJobStepContentSelector from "./EditJobStepContentSelector";
import { useEditJobInitialState } from "./Edit Job Hooks/useEditJobInitialState";
import { useEditJobDocumentLocks } from "./Edit Job Hooks/useEditJobDocumentLocks";
import {
  canJumpToJobStep,
  canMoveJobBackward,
  canMoveJobForward,
  getLastStepIndex,
  isFinalStepLockedForJob,
} from "../../Functions/Job/jobStepNavigation";



export default function EditJob_New() {
  const { state, actions } = useEditJobReducer();
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;
  const { jobStatuses } = useJobStatuses();
  const params = useParams({ from: "/editjob/$jobID" });
  const { jobID } = params;
  let backupJob = useRef(null);
  const prevStepButtonContainerRef = useRef(null);
  const nextStepButtonContainerRef = useRef(null);
  const [showFloatingPrevStep, setShowFloatingPrevStep] = useState(false);
  const [showFloatingNextStep, setShowFloatingNextStep] = useState(false);

  useStripRedundantJobMarketHubOverrides(
    state.activeJob,
    actions.updateActiveJob
  );
  useEditJobDocumentLocks({
    jobID,
    activeJob: state.activeJob,
    isLoading: state.isLoading,
  });

  useWarnBeforeUnload();

  const { leaveConfirmDialogueProps } = useEditJobLeaveConfirm({
    backupJobRef: backupJob,
    state,
  });
  useEditJobInitialState({
    jobID,
    currentActiveJobID: state.activeJob?.jobID,
    actions,
    backupJobRef: backupJob,
    setActiveJobID,
  });

  const currentStep = state.activeJob?.jobStatus ?? 0;
  const lastStepIndex = getLastStepIndex(jobStatuses.length);
  const finalStepGateActive = isFinalStepLockedForJob(state.activeJob);
  const canMoveBackward = canMoveJobBackward(state.activeJob);
  const canMoveForward = canMoveJobForward(state.activeJob, {
    lastStepIndex,
    lockFinalStep: false,
  });
  const disableMoveForward = !canMoveJobForward(state.activeJob, {
    lastStepIndex,
    lockFinalStep: finalStepGateActive,
  });

  function jumpToJobStep(targetStep) {
    if (
      !canJumpToJobStep(state.activeJob, targetStep, {
        lastStepIndex,
        lockFinalStep: finalStepGateActive,
      })
    ) {
      return;
    }

    actions.updateActiveJob({
      ...state.activeJob,
      jobStatus: targetStep,
    });
  }

  useEffect(() => {
    if (!canMoveBackward) {
      setShowFloatingPrevStep(false);
      return;
    }

    const element = prevStepButtonContainerRef.current;
    if (!element) {
      setShowFloatingPrevStep(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingPrevStep(!entry.isIntersecting),
      { threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [canMoveBackward, state.activeJob?.jobStatus]);

  useEffect(() => {
    if (!canMoveForward) {
      setShowFloatingNextStep(false);
      return;
    }

    const element = nextStepButtonContainerRef.current;
    if (!element) {
      setShowFloatingNextStep(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingNextStep(!entry.isIntersecting),
      { threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [canMoveForward, state.activeJob?.jobStatus]);

  return (
    <DefaultPageLayout>
      <ContentPanel
        componentName="Edit Job"
        isLoading={state.isLoading || !state.activeJob}
        loadingMessage={state.loadingMessage}
        loadingVariant="simple"
        contentGridSx={{ overflow: "visible" }}
      >
        {state.activeJob && (
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
                    src={`https://images.evetech.net/types/${state.activeJob.itemID}/icon?size=32`}
                    alt={state.activeJob.name}
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
                    {state.activeJob.name}
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
                          if (!state.activeJob) return;
                          const { activeGroup, pageView } = readEditJobUrlSearch();
                          openJobLinkTreeFromEditPage({
                            jobId: state.activeJob.jobID,
                            activeGroup,
                            pageView,
                          });
                        }}
                        size="small"
                        aria-label="View this jobs item tree"
                        disabled={!state.activeJob}
                        sx={{
                          paddingRight: 2
                        }}
                      >
                        <SchemaIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <DeleteJobIcon state={state} />
                  <CloseJobIcon backupJob={backupJob.current} />
                  <SaveJobIcon state={state} />
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
                      onClick={actions.stepActiveJobBackward}
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
                      onClick={actions.stepActiveJobForward}
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
              <LinkedJobBadge state={state} actions={actions} />
            </Grid>
            <Grid size={12}>
              <Stepper
                activeStep={state.activeJob.jobStatus}
                orientation="vertical"
              >
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
                          status.id === currentStep ||
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
                      <StepContent sx={{ width: "100%" }}>
                        <Divider />
                        {canMoveBackward && (
                          <Grid
                            align="center"
                            size={12}
                            ref={prevStepButtonContainerRef}
                          >
                            <Tooltip
                              title="Move to previous step"
                              arrow
                              placement="right"
                            >
                              <IconButton
                                color="primary"
                                onClick={actions.stepActiveJobBackward}
                                size="large"
                              >
                                <ArrowUpwardIcon />
                              </IconButton>
                            </Tooltip>
                          </Grid>
                        )}
                        <StepErrorBoundary
                          currentStep={
                            jobStatuses[state.activeJob.jobStatus]?.name ||
                            `Step ${state.activeJob.jobStatus}`
                          }
                          state={state}
                        >
                          <Box sx={{ width: "100%" }}>
                            <EditJobStepContentSelector
                              state={state}
                              actions={actions}
                            />
                          </Box>
                        </StepErrorBoundary>
                        {canMoveForward && (
                          <Grid
                            align="center"
                            size={12}
                            ref={nextStepButtonContainerRef}
                          >
                            <Tooltip
                              title="Move to next step"
                              arrow
                              placement="right"
                            >
                              <IconButton
                                color="primary"
                                onClick={actions.stepActiveJobForward}
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
    </DefaultPageLayout>
  );

  /**
 * Read `/editjob/$id` query params at call time (e.g. link-tree button) - avoids subscribing
 * to search on every render when the dialogue is rarely opened.
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



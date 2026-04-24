import { useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Avatar,
  Divider,
  Grid,
  IconButton,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Tooltip,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { CloseJobIcon } from "./closeIcon";
import { SaveJobIcon } from "./saveIcon";
import { DeleteJobIcon } from "./deleteIcon";
import { LinkedJobBadge } from "./Linked Job Badge";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import calculateInstallCostfromSetup from "../../Functions/Helper/calculateInstallCostfromSetup";
import { ShoppingListDialog } from "../Dialogues/Shopping List/ShoppingList";
import Job from "../../Classes/job";
import { prefetchBuildStatsQuery } from "../../Hooks/React Query/Backend/buildStats";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import getMissingESIData from "../../Functions/Shared/getMissingESIData";
import StepErrorBoundary from "./StepErrorBoundary";
import PriceHistoryDialog from "../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../Dialogues/Market Data/dialogFrame";
import useUsersStore from "../../Zustand/usersStore";
import { useJobStatuses } from "../Job Planner/Hooks/useJobStatuses";
import AssetsDialogue from "../Dialogues/Assets/dialogFrame";
import useEditJobReducer from "./Edit Job Hooks/useEditJobReducer";
import { useStripRedundantJobMarketHubOverrides } from "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js";
import { useDocumentLock } from "../../Hooks/DocumentLock/useDocumentLock.js";
import { useRegisterHeaderDocumentLockUI } from "../../Hooks/DocumentLock/useRegisterHeaderDocumentLockUI.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";

// Lazy-loaded layout selector components
const LayoutSelector_EditJob_Planning = lazy(() =>
  import("./Edit Job Components/Planning/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Planning,
  }))
);
const LayoutSelector_EditJob_Purchasing = lazy(() =>
  import("./Edit Job Components/Purchasing/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Purchasing,
  }))
);
const LayoutSelector_EditJob_Building = lazy(() =>
  import("./Edit Job Components/Building/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Building,
  }))
);
const LayoutSelector_EditJob_Complete = lazy(() =>
  import("./Edit Job Components/Complete/LayoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Complete,
  }))
);
const LayoutSelector_EditJob_Selling = lazy(() =>
  import("./Edit Job Components/Selling/LayoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Selling,
  }))
);

export default function EditJob_New() {
  const { state, actions } = useEditJobReducer();
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;
  const { jobStatuses } = useJobStatuses();
  const queryClient = useQueryClient();
  const params = useParams({ from: "/editjob/$jobID" });
  const { jobID } = params;
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const activeGroupID = useUsersStore((s) => s.jobData.activeGroupID);
  
  useStripRedundantJobMarketHubOverrides(
    state.activeJob,
    actions.updateActiveJob
  );
  const documentLockReady = Boolean(
    isLoggedIn &&
    jobID &&
    state.activeJob &&
    state.activeJob.jobID === jobID &&
    !state.isLoading
  );
  
  const groupLockReady = Boolean(
    documentLockReady &&
      activeGroupID &&
      state.activeJob?.groupID === activeGroupID
  );

  useDocumentLock(USER_JOBS_COLLECTION, jobID ?? "", documentLockReady, {
    pendingAccessRequestMessage:
      "Another tab requested edit access for this job.",
  });

  useDocumentLock(
    USER_JOB_GROUPS_COLLECTION,
    activeGroupID ?? "",
    groupLockReady,
    {
      pendingAccessRequestMessage:
        "Another tab requested edit access for this group.",
    }
  );

  const headerLockRegistrations = useMemo(() => {
    const jobReg = {
      collection: USER_JOBS_COLLECTION,
      docID: jobID ?? "",
      enabled: documentLockReady,
      label: "Job",
      readOnlyMessage:
        "This job is being edited in another session (read-only).",
      treeOwnership: "full",
    };
    if (!groupLockReady || !activeGroupID) {
      return [jobReg];
    }
    return [
      jobReg,
      {
        collection: USER_JOB_GROUPS_COLLECTION,
        docID: activeGroupID,
        enabled: documentLockReady,
        label: "Group",
        readOnlyMessage:
          "This group is being edited in another session (read-only).",
        treeOwnership: "limited",
      },
    ];
  }, [jobID, documentLockReady, groupLockReady, activeGroupID]);

  useRegisterHeaderDocumentLockUI({
    registrations: headerLockRegistrations,
  });

  let backupJob = useRef(null);
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  useWarnBeforeUnload();

  useEffect(() => {
    async function setInitialState() {
      if (jobID === state.activeJob?.jobID) return;

      const matchedJob = useUsersStore.getState().jobData.actions.findJobInJobArray(jobID);

      if (!matchedJob) {
        console.error("Unable to find job document");
        navigate({ to: "/jobplanner" });
        return;
      }

      try {
        const linkedJobs = await useUsersStore
          .getState()
          .jobData.actions.jobsFromIdsOrObjects([
            ...matchedJob.getRelatedJobs(),
            jobID,
          ]);

        if (useUsersStore.getState().account.isLoggedIn) {
          await prefetchBuildStatsQuery(queryClient, matchedJob.itemID);
        }

        const { requestedMarketData, requestedSystemIndexes } =
          await getMissingESIData(linkedJobs);

        for (let setup of Object.values(matchedJob.build.setup)) {
          setup.estimatedInstallCost = calculateInstallCostfromSetup(
            setup,
            requestedMarketData,
            requestedSystemIndexes
          );
        }

        if (!matchedJob.layout.setupToEdit) {
          matchedJob.layout.setupToEdit =
            Object.keys(matchedJob.build.setup)[0] || null;
        }

        if (!matchedJob.layout.setupToEdit) {
          matchedJob.layout.setupToEdit =
            Object.keys(matchedJob.build.setup)[0] || null;
        }

        useUsersStore
          .getState()
          .worldData.actions.addMarketData(requestedMarketData);
        useUsersStore
          .getState()
          .worldData.actions.addSystemIndex(requestedSystemIndexes);

        backupJob.current = new Job(matchedJob);

        const activeJobObject = new Job(matchedJob);

        actions.setActiveJob(activeJobObject);

        setActiveJobID(activeJobObject.jobID);
        actions.setIsLoading(false);
      } catch (err) {
        console.error("Error importing job data:", err);
        navigate({ to: "/jobplanner" });
      }
    }
    setInitialState();
  }, [jobID]);

  function StepContentSelector(props) {
    const { state, actions } = props;

    const LoadingFallback = () => (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 200,
        }}
      >
        <CircularProgress />
      </Box>
    );

    switch (state.activeJob.jobStatus) {
      case 0:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Planning {...props} />
          </Suspense>
        );
      case 1:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Purchasing {...props} />
          </Suspense>
        );
      case 2:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Building {...props} />
          </Suspense>
        );
      case 3:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Complete {...props} />
          </Suspense>
        );
      case 4:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Selling {...props} />
          </Suspense>
        );
      default:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <LayoutSelector_EditJob_Planning {...props} />
          </Suspense>
        );
    }
  }

  return (
    <DefaultPageLayout>
      <ContentPanel
        componentName="Edit Job"
        isLoading={state.isLoading || !state.activeJob}
        loadingMessage={state.loadingMessage}
        loadingVariant="simple"
      >
        {state.activeJob && (
          <Grid container sx={{ width: "100%" }}>
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
              }}
            >
              <Typography
                variant="h3"
                color="primary"
                align="left"
                sx={{
                  width: "100%",
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
                  overflowWrap: "break-word",
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
              <DeleteJobIcon state={state} />
              <CloseJobIcon backupJob={backupJob.current} />
              <SaveJobIcon state={state} />
            </Grid>
            <Grid size={2} />
            <Grid
              align="center"
              sx={{ marginTop: { xs: "20px", md: "30px" } }}
              size={{
                xs: 12,
                sm: 5,
              }}
            >
              <Avatar
                src={`https://images.evetech.net/types/${state.activeJob.itemID}/icon?size=32`}
                alt={state.activeJob.name}
                variant="square"
                sx={{
                  height: { xs: "32px", sm: "64px" },
                  width: { xs: "32px", sm: "64px" },
                }}
              />
            </Grid>
            <Grid
              sx={{ marginTop: { xs: "10px", sm: "0px" } }}
              size={{
                xs: 12,
                sm: 5,
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
                      <StepLabel>{status.name}</StepLabel>
                      <StepContent sx={{ width: "100%" }}>
                        <Divider />
                        {state.activeJob.jobStatus !== 0 && (
                          <Grid align="center" size={12}>
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
                            <StepContentSelector
                              state={state}
                              actions={actions}
                            />
                          </Box>
                        </StepErrorBoundary>
                        {state.activeJob.jobStatus !== jobStatuses.length - 1 && (
                          <Grid align="center" size={12}>
                            <Tooltip
                              title="Move to next step"
                              arrow
                              placement="right"
                            >
                              <IconButton
                                color="primary"
                                onClick={actions.stepActiveJobForward}
                                size="large"
                                disabled={
                                  state.activeJob.includedInGroup &&
                                  !state.activeJob.isReadyToSell &&
                                  state.activeJob.jobStatus ===
                                    jobStatuses.length - 2
                                }
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
      <ShoppingListDialog />
      <PriceHistoryDialog />
      <MarketDataDialog />
      <AssetsDialogue />
    </DefaultPageLayout>
  );
}

import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { Box, Paper } from "@mui/material";
import { ShoppingListDialogue } from "../Dialogues/Shopping List/ShoppingList";
import useWarnBeforeUnload from "../../Hooks/GeneralHooks/useWarnBeforeUnload";
import { useJobDeletedRemotely } from "./Edit Job Hooks/useJobDeletedRemotely.js";
import StepErrorBoundary from "./StepErrorBoundary";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import { useJobStatuses } from "../../Hooks/useJobStatuses";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
import {
  useJobActions,
  useJobDraft,
  useSessionLoading,
  useSessionLoadingMessage,
} from "./Edit Job Hooks/useJobDraft";
import { setJobPricing } from "./Edit Job Hooks/jobCommands";
import { useStripRedundantJobMarketHubOverrides } from "../../Hooks/Planner/useStripRedundantJobMarketHubOverrides.js";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import ContentErrorBoundary from "../../Styled Components/Paper/ContentErrorBoundary";
import { appShellSetupSectionPaperSx } from "../../Context/appShell";
import EditJobLeaveConfirmDialogue from "./EditJobLeaveConfirmDialogue";
import ChangeReviewDialogue from "./Change Review/ChangeReviewDialogue";
import IncomingSaveNotice from "./Change Review/IncomingSaveNotice";
import { useEditJobLeaveConfirm } from "./Edit Job Hooks/useEditJobLeaveConfirm";
import EditJobStepContentSelector from "./EditJobStepContentSelector";
import { useEditJobInitialState } from "./Edit Job Hooks/useEditJobInitialState";
import { useEditJobDocumentLocks } from "./Edit Job Hooks/useEditJobDocumentLocks";
import { useRefreshLinkedESIData } from "./Hooks/useRefreshLinkedESIData";
import { endEditSession } from "../../Functions/Job/editing/editSessionLifetime.js";
import JobHeader from "./jobHeader";
import { JobStageSteps, JobStageTabs } from "./jobStageNavigation";

/** The Edit Job page: the job's header and stage tabs held on screen above the stage being worked in. */
export default function EditJob_New() {
  const actions = useJobActions();
  const openJobID = useJobDraft((job) => job.jobID);
  const openJobGroupID = useJobDraft((job) => job.groupID);
  const jobPricing = useJobDraft((job) => job.build.localPricing);
  const jobStatus = useJobDraft((job) => job.jobStatus) ?? 0;
  const isLoading = useSessionLoading();
  const loadingMessage = useSessionLoadingMessage();
  const { jobStatuses } = useJobStatuses();
  const { jobID } = useParams({ from: "/editjob/$jobID" });

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

  return (
    <>
      <Paper
        variant="outlined"
        sx={{ ...appShellSetupSectionPaperSx, width: "100%" }}
      >
        {isLoading || !openJobID ? (
          <PanelFallBack isLoading loadingMessage={loadingMessage} />
        ) : (
          <>
            <Box
              sx={{
                position: "sticky",
                top: { xs: 56, sm: 64 },
                zIndex: (theme) => theme.zIndex.appBar - 3,
                backgroundColor: "background.paper",
                borderBottom: 1,
                borderColor: "divider",
                mx: { xs: -2, md: -2.5 },
                px: { xs: 2, md: 2.5 },
                pt: 1,
                mb: 2,
              }}
            >
              <ContentErrorBoundary componentName="Edit Job">
                <JobHeader />
                <JobStageTabs />
              </ContentErrorBoundary>
            </Box>
            <IncomingSaveNotice />
            <StepErrorBoundary
              currentStep={jobStatuses[jobStatus]?.name || `Step ${jobStatus}`}
            >
              <EditJobStepContentSelector />
            </StepErrorBoundary>
            <ContentErrorBoundary componentName="Edit Job stage steps">
              <JobStageSteps />
            </ContentErrorBoundary>
          </>
        )}
      </Paper>
      <ShoppingListDialogue />
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <AssetsDialogue />
      <EditJobLeaveConfirmDialogue {...leaveConfirmDialogueProps} />
      <ChangeReviewDialogue />
    </>
  );
}

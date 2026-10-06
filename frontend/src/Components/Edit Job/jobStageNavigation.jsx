import { useId } from "react";
import { Box, Button, Tab, Tabs } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockIcon from "@mui/icons-material/Lock";
import ExplainerTooltip from "../../Styled Components/Tooltip/ExplainerTooltip";
import { useJobStatuses } from "../../Hooks/useJobStatuses";
import { countOf } from "../../Functions/Helper/numberParser";
import {
  canJumpToJobStep,
  getLastStepIndex,
  isFinalStepLockedForJob,
} from "../../Functions/Job/editing/jobStepNavigation";
import {
  useJobActions,
  useJobDraft,
  useParentJobIDs,
} from "./Edit Job Hooks/useJobDraft";
import {
  setJobStatus,
  stepBackward,
  stepForward,
} from "./Edit Job Hooks/jobCommands";

/**
 * Why the final stage is shut for this job: a job with parents has its output committed, and any
 * other grouped job waits to be marked ready for sale.
 *
 * @param {{parentCount: number, completeStageName?: string}} job
 * @returns {string}
 */
export function finalStageLockReason({ parentCount, completeStageName }) {
  if (parentCount > 0) {
    return `Its output is committed to its ${countOf(parentCount, "parent job")}, so it is not sold on its own.`;
  }
  return `Opens once the job is marked ready for sale on ${completeStageName ?? "the previous stage"}.`;
}

/**
 * The open job's stages, which of them can be moved to, and why the final one is shut when it is.
 */
function useJobStages() {
  const actions = useJobActions();
  const { jobStatuses } = useJobStatuses();
  const jobStatus = useJobDraft((job) => job.jobStatus) ?? 0;
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const isReadyToSell = useJobDraft((job) => job.isReadyToSell);
  const parentCount = useParentJobIDs().length;

  const openJob = { jobStatus, includedInGroup, isReadyToSell };
  const lastStepIndex = getLastStepIndex(jobStatuses.length);
  const finalLocked = isFinalStepLockedForJob(openJob);
  const rules = { lastStepIndex, lockFinalStep: finalLocked };

  return {
    run: actions.run,
    jobStatuses,
    jobStatus,
    lockedStep:
      finalLocked && jobStatus !== lastStepIndex ? lastStepIndex : null,
    lockReason: finalLocked
      ? finalStageLockReason({
          parentCount,
          completeStageName: jobStatuses[lastStepIndex - 1]?.name,
        })
      : "",
    canGoTo: (step) => canJumpToJobStep(openJob, step, rules),
    goTo: (step) => {
      if (canJumpToJobStep(openJob, step, rules)) {
        actions.run(setJobStatus(step));
      }
    },
  };
}

/** One tab per stage, labelled with the stage's own name, the shut final stage saying why. */
export function JobStageTabs() {
  const { jobStatuses, jobStatus, lockedStep, lockReason, goTo } =
    useJobStages();
  const lockReasonID = useId();

  return (
    <Tabs
      value={jobStatus}
      onChange={(_event, step) => goTo(step)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      aria-label="Job stages"
    >
      {jobStatuses.map((status) =>
        status.id === lockedStep ? (
          <Tab
            key={status.id}
            value={status.id}
            aria-disabled="true"
            aria-describedby={lockReasonID}
            sx={{ color: "text.disabled" }}
            label={
              <ExplainerTooltip title={lockReason} describeChild>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {status.name}
                  <LockIcon sx={{ fontSize: 14 }} titleAccess="Locked" />
                  <Box component="span" id={lockReasonID} hidden>
                    {lockReason}
                  </Box>
                </Box>
              </ExplainerTooltip>
            }
          />
        ) : (
          <Tab key={status.id} value={status.id} label={status.name} />
        ),
      )}
    </Tabs>
  );
}

/** Moves to the stage before or after this one, each control naming where it goes. */
export function JobStageSteps() {
  const { jobStatuses, jobStatus, lockReason, canGoTo, run } = useJobStages();
  const previous = jobStatuses[jobStatus - 1];
  const next = jobStatuses[jobStatus + 1];
  const nextShut = Boolean(next) && !canGoTo(next.id);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        pt: 2,
        mt: 2,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      {previous ? (
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => run(stepBackward())}
        >
          Back to {previous.name}
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <ExplainerTooltip title={nextShut ? lockReason : ""}>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            disabled={nextShut}
            onClick={() => run(stepForward())}
          >
            Continue to {next.name}
          </Button>
        </ExplainerTooltip>
      ) : null}
    </Box>
  );
}

import { setupCount } from "./Edit Job Hooks/jobSelectors";
import { useMemo } from "react";
import { Box, Button, Stack, Tooltip, Typography } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import {
  useJobActions,
  useJobDraft,
  useParentLinkIntents,
} from "./Edit Job Hooks/useJobDraft";

/**
 * The jobs the job being edited can be linked to as a parent, as the body of a
 * dialogue. Mounted only while that dialogue is open, so the pass over the
 * planner's jobs costs nothing while nobody is looking at it.
 *
 * @param {Object} props
 * @param {Function} props.onLinked - Called once a parent has been chosen
 */
export function ParentJobOptions({ onLinked }) {
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  const linkEdits = useParentLinkIntents();
  const itemID = useJobDraft((job) => job.itemID);
  const parentJobs = useJobDraft((job) => job.parentJobs);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const groupID = useJobDraft((job) => job.groupID);
  const actions = useJobActions();
  const jobLockReadOnly = useActiveJobReadOnly();

  const matches = useMemo(() => {
    const usesActiveOutputAsMaterial = (job) =>
      job.build?.materials?.[String(itemID)] !== undefined;

    return jobArray.filter((job) => {
      if (linkEdits.remove.includes(job.jobID)) {
        return true;
      }
      if (!usesActiveOutputAsMaterial(job)) {
        return false;
      }
      if (parentJobs.includes(job.jobID)) {
        return false;
      }
      if (linkEdits.add.includes(job.jobID)) {
        return false;
      }
      if (includedInGroup && job.groupID !== groupID) {
        return false;
      }
      return true;
    });
  }, [jobArray, linkEdits, itemID, parentJobs, includedInGroup, groupID]);

  if (matches.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No other job needs this item.
      </Typography>
    );
  }

  return (
    <Stack>
      {matches.map((job) => (
        <Box
          key={job.jobID}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            "&:last-of-type": { borderBottom: 0 },
          }}
        >
          <EveImageAvatar type={job.itemID} size={32} variant="square" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">{job.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {setupCount(job)} setup{setupCount(job) === 1 ? "" : "s"} · needs{" "}
              {formatNumberForLocale(
                job.build?.materials?.[String(itemID)]?.quantity ?? 0,
                { max: 0 },
              )}{" "}
              of this
            </Typography>
          </Box>
          <Tooltip
            title={
              jobLockReadOnly
                ? lockReasonText({ action: "linking is disabled" })
                : ""
            }
            arrow
            disableHoverListener={!jobLockReadOnly}
          >
            <span>
              <Button
                size="small"
                disabled={jobLockReadOnly}
                onClick={() => {
                  actions.markParentJobForAddition(job.jobID);
                  showSnackbarSuccess(`${job.name} Linked`);
                  onLinked();
                }}
              >
                Link
              </Button>
            </span>
          </Tooltip>
        </Box>
      ))}
    </Stack>
  );
}

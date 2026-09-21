import { useMemo } from "react";
import { Grid, Typography } from "@mui/material";
import { AvailableChildJobs_Purchasing } from "./availableChildJobs";
import { ExistingChildJobs_Purchasing } from "./existingChildJobs";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useSiblingLinkLock } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { childJobIDsAfterEdits } from "../../../../Edit Job Hooks/jobSelectors";
import {
  useChildLinkIntents,
  useJobDraft,
  useTemporaryChildJob,
} from "../../../../Edit Job Hooks/useJobDraft";

/**
 * The child jobs linked to a material and the ones that could be, as the body of
 * a dialogue. Mounted only while that dialogue is open, so the pass over the
 * planner's jobs costs nothing while nobody is looking at it.
 *
 * @param {Object} props
 * @param {Object} props.material - The material this card is for
 */
export function ChildJobLinks(props) {
  const { material } = props;
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  const linkedChildJobs = useJobDraft(
    (job) => job.build.childJobs[material.typeID],
  );
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const groupID = useJobDraft((job) => job.groupID);
  const markedChildJobs = useChildLinkIntents(material.typeID);
  const temporaryChildJob = useTemporaryChildJob(material.typeID);
  /**
   * Computed once at the dialogue level and broadcast through `{...props}` so the
   * Add/Clear row buttons share the same reactive lock subscription instead of
   * each row re-running the selector chain.
   */
  const siblingLinkLock = useSiblingLinkLock();

  /* Linking waits in the pending changes rather than being written to the job,
   * so both lists have to follow those as well as the job itself. */
  const existingChildJobs = useMemo(
    () =>
      childJobIDsAfterEdits(
        linkedChildJobs,
        markedChildJobs,
        temporaryChildJob,
      ),
    [linkedChildJobs, markedChildJobs, temporaryChildJob],
  );

  const availableChildJobs = useMemo(
    () =>
      jobArray.filter(
        (job) =>
          job.itemID === material.typeID &&
          !existingChildJobs.includes(job.jobID) &&
          (!includedInGroup || job.groupID === groupID),
      ),
    [includedInGroup, groupID, jobArray, material.typeID, existingChildJobs],
  );

  return (
    <>
      <AvailableChildJobs_Purchasing
        {...props}
        availableChildJobs={availableChildJobs}
        siblingLinkLock={siblingLinkLock}
      />
      <Grid sx={{ marginBottom: "10px" }}>
        <Typography variant="h6" color="primary" align="center">
          Linked Child Jobs
        </Typography>
      </Grid>
      <ExistingChildJobs_Purchasing
        {...props}
        existingChildJobs={existingChildJobs}
        siblingLinkLock={siblingLinkLock}
      />
    </>
  );
}

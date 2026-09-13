import { useState } from "react";
import { Button, Chip, Stack } from "@mui/material";
import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";
import { useQueryClient } from "@tanstack/react-query";

import { findMaterialJobInGroup } from "../../../../../../Functions/Groups/findMaterialJobInGroup";
import { finaliseCreatedChildJobs } from "./Helpers/finaliseCreatedChildJobs";
import { resolveMaterialChildJobStatus } from "./Helpers/materialChildJobs";
import {
  useActiveGroupReadOnly,
  useSiblingLinkLock,
} from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import {
  LockGatedTooltip,
  lockReasonText,
} from "../../../../../DocumentLock/LockGatedTooltip";
import { trackNewJobsCreated } from "../../../../../../analytics/trackNewJobsCreated";

/**
 * Whether the row is bought or built, as one decision.
 *
 * Whether confirming creates a job or links the group's existing one is not a
 * question the player asked — the decision they are making is the same either
 * way. So it is one control with two states and a way back, and which of the two
 * mechanisms fires is worked out here.
 *
 * @param {object} props
 * @param {object} props.state - Edit Job state
 * @param {object} props.actions - Edit Job actions
 * @param {object} props.material
 * @param {object|null} [props.rowJob] - The job behind this row: the one costed
 *   for it, or the real one already linked to it
 * @param {() => Promise<object|null>} [props.costRow] - Works out what building
 *   this row would take, for a reader who has not opened its drawer
 * @param {() => void} [props.onBuilt] - Shows the job that was just created
 */
export default function PlanChip({
  state,
  actions,
  material,
  rowJob,
  costRow,
  onBuilt,
}) {
  const [costing, setCosting] = useState(false);
  const queryClient = useQueryClient();
  const groupReadOnly = useActiveGroupReadOnly(state);
  const siblingLock = useSiblingLinkLock(state);

  const { hasLinked, hasTemp, hasPendingAdd, tempJob } =
    resolveMaterialChildJobStatus({
      state,
      materialTypeID: material.typeID,
      childJobsLocation: state.activeJob.build.childJobs[material.typeID] ?? [],
    });

  const groupJob = state.activeJob.includedInGroup
    ? findMaterialJobInGroup(material.typeID, state.activeJob.groupID)
    : null;

  const onBuild = hasLinked || hasTemp || hasPendingAdd;

  // Linking a sibling and creating a new child are gated differently, and which
  // one confirming does depends on whether the group already builds this.
  const promoteLock = groupJob
    ? { readOnly: siblingLock.readOnly, reason: siblingLock.reason }
    : {
        readOnly: groupReadOnly,
        reason: lockReasonText({
          scope: "group",
          action: "new child jobs can't be added",
        }),
      };

  const promote = async () => {
    // A row nobody has opened has nothing costed for it, and deciding to build is
    // not a reason to have read the drawer first — so the cost is worked out
    // here, and the drawer opens afterwards showing what was made.
    let job = groupJob ?? rowJob;
    if (!job && costRow) {
      setCosting(true);
      try {
        job = await costRow();
      } finally {
        setCosting(false);
      }
    }
    if (!job) return;

    await finaliseCreatedChildJobs({
      jobsForMissingDataAndRecalc: groupJob ? [] : job,
      jobsToMarkForAddition: job,
      actions,
      // A job built for this row is sized to what this row needs, which is the
      // figure the panel has been costing it at.
      //
      // A job the group already runs is not: it may already be feeding another
      // job in the group, and sizing it to this row's requirement alone would
      // take that job's supply away without either of them being told.
      requiredQuantity: groupJob ? undefined : material.quantity,
      queryClient,
    });

    if (!groupJob) trackNewJobsCreated(job);

    forgetCosting();
    onBuilt?.();
  };

  const undo = () => {
    // Whatever was committed is what has to come back out: a job marked this
    // session, a linked sibling, or a child linked before this one was opened.
    const job = tempJob ?? groupJob ?? rowJob;
    if (!job) return;
    actions.markChildJobsForRemoval(job);

    forgetCosting();
  };

  /**
   * Drops what the row was costed with, once that job is no longer a guess at
   * what building this material would take — it has either become a real child
   * job or been taken back out.
   *
   * A job left in the costed map outlives the decision: the row would confirm
   * against a job that no longer exists, the bulk costing would count the row as
   * already priced and never quote it again, and opening its drawer would show
   * the stale figure rather than costing it afresh.
   */
  function forgetCosting() {
    actions.forgetSpeculativeChildJobs(material.typeID);
  }

  if (onBuild) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Chip label="Build" size="small" color="primary" />
        {/* Severing a link is the sibling lock's business wherever it happens,
            group or not — the same gate the Purchasing stage's unlink uses. */}
        <LockGatedTooltip
          readOnly={siblingLock.readOnly}
          reason={siblingLock.reason}
        >
          <ExplainerTooltip title="Unlinks the job building this row, so the material is bought instead">
            <Button
              size="small"
              onClick={undo}
              disabled={
                siblingLock.readOnly || !(tempJob ?? groupJob ?? rowJob)
              }
            >
              Buy instead
            </Button>
          </ExplainerTooltip>
        </LockGatedTooltip>
      </Stack>
    );
  }

  const nothingToPromote = !groupJob && !rowJob && !costRow;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Chip label="Buy" size="small" variant="outlined" />
      <LockGatedTooltip
        readOnly={promoteLock.readOnly}
        reason={promoteLock.reason}
      >
        <ExplainerTooltip
          title={
            nothingToPromote
              ? "Cost this row first to see what building it would take"
              : groupJob
                ? "Links the group's existing job, at whatever size it already is"
                : rowJob
                  ? "Adds a child job sized to what this row needs"
                  : "Works out what building this would take, then adds a child job sized to this row"
          }
        >
          <Button
            size="small"
            onClick={promote}
            disabled={promoteLock.readOnly || nothingToPromote || costing}
          >
            {costing
              ? "Costing"
              : groupJob
                ? "Build in this group"
                : "Build it"}
          </Button>
        </ExplainerTooltip>
      </LockGatedTooltip>
    </Stack>
  );
}

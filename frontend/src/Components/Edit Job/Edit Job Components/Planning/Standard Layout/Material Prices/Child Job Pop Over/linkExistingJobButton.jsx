import { Button } from "@mui/material";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import { useSiblingLinkLock } from "../../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { LockGatedTooltip } from "../../../../../../DocumentLock/LockGatedTooltip";

export function LinkExistingGroupJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  const { readOnly, reason } = useSiblingLinkLock(state);

  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobInGroup(
      material.typeID,
      state.activeJob.groupID
    );
    if (!matchedGroupJob) return;
    actions.markChildJobsForAddition(matchedGroupJob);
  }

  return (
    <LockGatedTooltip readOnly={readOnly} reason={reason}>
      <Button size="small" onClick={linkToGroupJob} disabled={readOnly}>
        Link To Existing Group Job
      </Button>
    </LockGatedTooltip>
  );
}

export function UnlinkExistingChildJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  const { readOnly, reason } = useSiblingLinkLock(state);

  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobInGroup(
      material.typeID,
      state.activeJob.groupID
    );
    if (!matchedGroupJob) return;

    actions.markChildJobsForRemoval(matchedGroupJob);
  }

  return (
    <LockGatedTooltip readOnly={readOnly} reason={reason}>
      <Button size="small" onClick={linkToGroupJob} disabled={readOnly}>
        Unlink from Existing Group Job
      </Button>
    </LockGatedTooltip>
  );
}

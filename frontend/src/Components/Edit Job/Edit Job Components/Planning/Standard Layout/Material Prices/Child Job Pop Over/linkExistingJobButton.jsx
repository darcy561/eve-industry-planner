import { Button } from "@mui/material";
import { useManageGroupJobs } from "../../../../../../../Hooks/GroupHooks/useManageGroupJobs";

export function LinkExistingGroupJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  const { findMaterialJobIDInGroup } = useManageGroupJobs();

  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobIDInGroup(
      material.typeID,
      state.activeJob.groupID
    );
    if (!matchedGroupJob) return;
    actions.markChildJobsForAddition(matchedGroupJob);
  }

  return (
    <Button size="small" onClick={linkToGroupJob}>
      Link To Existing Group Job
    </Button>
  );
}

export function UnlinkExistingChildJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  const { findMaterialJobIDInGroup } = useManageGroupJobs();

  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobIDInGroup(
      material.typeID,
      state.activeJob.groupID
    );
    if (!matchedGroupJob) return;

    actions.markChildJobsForRemoval(matchedGroupJob);
  }

  return (
    <Button size="small" onClick={linkToGroupJob}>
      Unlink from Existing Group Job
    </Button>
  );
}

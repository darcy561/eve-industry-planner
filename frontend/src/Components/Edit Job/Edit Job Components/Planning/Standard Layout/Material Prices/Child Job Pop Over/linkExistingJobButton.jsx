import { Button } from "@mui/material";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";

export function LinkExistingGroupJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobInGroup(
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
  function linkToGroupJob() {
    const matchedGroupJob = findMaterialJobInGroup(
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

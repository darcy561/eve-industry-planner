import {
  CancelCreateChildJobButton_ChildJobPopoverFrame,
  CreateChildJobButton_ChildJobPopoverFrame,
} from "./createJobsButton";
import {
  LinkExistingGroupJobButton_ChildJobPopoverFrame,
  UnlinkExistingChildJobButton_ChildJobPopoverFrame,
} from "./linkExistingJobButton";
import { OpenChildJobButon_ChildJobPopoverFrame } from "./openChildJobButton";

export function ButtonSelectionLogic_ChildJobPopoverFrame(props) {
  const { state, childJobsLocation, isExistingJobInGroup, material } = props;

  const openChildJobButton = (
    <OpenChildJobButon_ChildJobPopoverFrame {...props} />
  );
  const createChildJobButton = (
    <CreateChildJobButton_ChildJobPopoverFrame {...props} />
  );
  const cancelCreateChildJobButton = (
    <CancelCreateChildJobButton_ChildJobPopoverFrame {...props} />
  );
  const linkExistingGroupJobButton = (
    <LinkExistingGroupJobButton_ChildJobPopoverFrame {...props} />
  );
  const unlinkExistingGroupJobButton = (
    <UnlinkExistingChildJobButton_ChildJobPopoverFrame {...props} />
  );

  if (state.activeJob.includedInGroup) {
    if (childJobsLocation.length === 0) {
      if (!state.temporaryChildJobs[material.typeID]) {
        if (
          !state.parentChildToEdit.childJobs[material.typeID]?.add ||
          state.parentChildToEdit.childJobs[material.typeID]?.add.length === 0
        ) {
          if (!isExistingJobInGroup.current) {
            return createChildJobButton;
          } else {
            return linkExistingGroupJobButton;
          }
        } else {
          if (!isExistingJobInGroup) {
            return openChildJobButton;
          } else {
            return unlinkExistingGroupJobButton;
          }
        }
      } else {
        return cancelCreateChildJobButton;
      }
    } else {
      return openChildJobButton;
    }
  } else {
    if (childJobsLocation.length === 0) {
      if (!state.temporaryChildJobs[material.typeID]) {
        if (
          !state.parentChildToEdit.childJobs[material.typeID]?.add ||
          state.parentChildToEdit.childJobs[material.typeID]?.add.length === 0
        ) {
          return createChildJobButton;
        } else {
          return openChildJobButton;
        }
      } else {
        return cancelCreateChildJobButton;
      }
    } else {
      return openChildJobButton;
    }
  }
}

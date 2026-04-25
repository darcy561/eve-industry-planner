import {
  CancelCreateChildJobButton_ChildJobPopoverFrame,
  CreateChildJobButton_ChildJobPopoverFrame,
} from "./createJobsButton";
import {
  LinkExistingGroupJobButton_ChildJobPopoverFrame,
  UnlinkExistingChildJobButton_ChildJobPopoverFrame,
} from "./linkExistingJobButton";
import { OpenChildJobButon_ChildJobPopoverFrame } from "./openChildJobButton";
import { resolveMaterialChildJobStatus } from "../Helpers/materialChildJobs";

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

  const { inGroup, hasLinked, hasTemp, hasPendingAdd, hasGroupMatch } =
    resolveMaterialChildJobStatus({
      state,
      materialTypeID: material.typeID,
      childJobsLocation,
      isExistingJobInGroup: isExistingJobInGroup.current,
    });

  if (hasLinked) return openChildJobButton;
  if (hasTemp) return cancelCreateChildJobButton;

  if (!inGroup) {
    return hasPendingAdd ? openChildJobButton : createChildJobButton;
  } else {
    if (hasPendingAdd) {
      return hasGroupMatch ? unlinkExistingGroupJobButton : openChildJobButton;
    }

    return hasGroupMatch ? linkExistingGroupJobButton : createChildJobButton;
  }
}

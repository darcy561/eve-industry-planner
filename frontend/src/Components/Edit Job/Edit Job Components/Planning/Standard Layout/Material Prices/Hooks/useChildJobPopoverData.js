import { useEffect, useRef, useState } from "react";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import { resolveMaterialChildJobStatus } from "../Helpers/materialChildJobs";

export function useChildJobPopoverData({
  state,
  displayPopover,
  material,
  matchedChildJobs,
  childJobsLocation,
  buildSingleChildJobPreview,
}) {
  const [jobImportState, updateJobImportState] = useState(false);
  const [jobDisplay, setJobDisplay] = useState(0);
  const [childJobObjects, updateChildJobObjects] = useState([]);
  const [fetchError, updateFetchError] = useState(false);
  const isExistingJobInGroup = useRef(false);

  useEffect(() => {
    async function fetchData() {
      if (!displayPopover) return;
      const baseChildJobs = [...matchedChildJobs];
      const matchedGroupJob = findMaterialJobInGroup(
        material.typeID,
        state.activeJob.groupID
      );
      let nextChildJobObjects = baseChildJobs;

      const { hasLinked, hasTemp, hasPendingAdd } = resolveMaterialChildJobStatus({
        state,
        materialTypeID: material.typeID,
        childJobsLocation,
        isExistingJobInGroup: isExistingJobInGroup.current,
      });

      if (hasLinked || hasTemp || hasPendingAdd) {
        nextChildJobObjects = baseChildJobs;
      } else if (matchedGroupJob && baseChildJobs.length === 0) {
        nextChildJobObjects = [...baseChildJobs, matchedGroupJob];
        isExistingJobInGroup.current = true;
      } else if (baseChildJobs.length === 0) {
        const newJob = await buildSingleChildJobPreview({ material });
        if (!newJob) {
          updateFetchError(true);
          updateJobImportState(true);
          return;
        }
        nextChildJobObjects = [...baseChildJobs, newJob];
      }

      if (nextChildJobObjects.length > 0) {
        updateChildJobObjects(nextChildJobObjects);
      }
      updateJobImportState(true);
    }
    fetchData();
  }, [
    buildSingleChildJobPreview,
    childJobsLocation,
    displayPopover,
    matchedChildJobs,
    material,
    state,
  ]);

  return {
    jobImportState,
    jobDisplay,
    setJobDisplay,
    childJobObjects,
    fetchError,
    isExistingJobInGroup,
  };
}

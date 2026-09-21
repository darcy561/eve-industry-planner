import { useEffect, useRef, useState } from "react";
import { findMaterialJobInGroup } from "../../../../../../../Functions/Groups/findMaterialJobInGroup.js";
import { resolveMaterialChildJobStatus } from "../Helpers/materialChildJobs";
import {
  useChildLinkIntents,
  useJobDraft,
  useSpeculativeChildJob,
  useTemporaryChildJob,
} from "../../../../../Edit Job Hooks/useJobDraft";

export function useChildJobDrawerData({
  isOpen,
  material,
  matchedChildJobs,
  childJobsLocation,
  buildSingleChildJobPreview,
}) {
  const groupID = useJobDraft((job) => job.groupID);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const markedChildJobs = useChildLinkIntents(material.typeID);
  const temporaryChildJob = useTemporaryChildJob(material.typeID);
  const costedChildJob = useSpeculativeChildJob(material.typeID);
  const [jobImportState, updateJobImportState] = useState(false);
  const [jobDisplay, setJobDisplay] = useState(0);
  const [childJobObjects, updateChildJobObjects] = useState([]);
  const [fetchError, updateFetchError] = useState(false);
  const isExistingJobInGroup = useRef(false);

  useEffect(() => {
    async function fetchData() {
      if (!isOpen) return;
      const baseChildJobs = [...matchedChildJobs];
      const matchedGroupJob = findMaterialJobInGroup(material.typeID, groupID);
      let nextChildJobObjects = baseChildJobs;

      const { hasLinked, hasTemp, hasPendingAdd } =
        resolveMaterialChildJobStatus({
          inGroup: includedInGroup,
          childJobsLocation,
          temporaryChildJob,
          markedChildJobs,
          isExistingJobInGroup: isExistingJobInGroup.current,
        });

      if (hasLinked || hasTemp || hasPendingAdd) {
        nextChildJobObjects = baseChildJobs;
      } else if (matchedGroupJob && baseChildJobs.length === 0) {
        nextChildJobObjects = [...baseChildJobs, matchedGroupJob];
        isExistingJobInGroup.current = true;
      } else if (baseChildJobs.length === 0) {
        // A row costed already — in bulk from the summary strip, or by an
        // earlier open of this drawer — is not costed again. Rebuilding it would
        // also loop: costing now records the job, which is state this effect
        // reads.
        if (costedChildJob) {
          nextChildJobObjects = [...baseChildJobs, costedChildJob];
        } else {
          const newJob = await buildSingleChildJobPreview({ material });
          if (!newJob) {
            updateFetchError(true);
            updateJobImportState(true);
            return;
          }
          nextChildJobObjects = [...baseChildJobs, newJob];
        }
      }

      if (nextChildJobObjects.length > 0) {
        // A fresh array of the same jobs is still a new array, and this effect
        // re-runs whenever the page re-renders — the callback it depends on is
        // rebuilt each time. Writing it back unchanged would render the drawer
        // again for nothing, once per render of everything above it.
        updateChildJobObjects((shown) =>
          sameJobs(shown, nextChildJobObjects) ? shown : nextChildJobObjects,
        );
      }
      updateJobImportState(true);
    }
    fetchData();
  }, [
    buildSingleChildJobPreview,
    childJobsLocation,
    costedChildJob,
    groupID,
    includedInGroup,
    isOpen,
    markedChildJobs,
    matchedChildJobs,
    material,
    temporaryChildJob,
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

/**
 * Whether two lists hold the same jobs in the same order.
 *
 * @param {Array<object>} a
 * @param {Array<object>} b
 * @returns {boolean}
 */
function sameJobs(a, b) {
  return a.length === b.length && a.every((job, i) => job === b[i]);
}

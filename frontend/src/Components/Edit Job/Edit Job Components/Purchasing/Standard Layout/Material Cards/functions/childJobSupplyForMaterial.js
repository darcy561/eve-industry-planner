import { materialRequirementOf } from "../../../../../Edit Job Hooks/jobSelectors";
import { quantityRemaining } from "../../../../../Edit Job Hooks/materialSelectors";
import {
  parentJobIDs,
  totalQuantityProduced,
} from "../../../../../Edit Job Hooks/jobSelectors";
import useUsersStore from "../../../../../../../Zustand/usersStore";

/**
 * What a material's child jobs can be counted on to supply this job.
 *
 * @param {string} activeJobID - The job the card belongs to
 * @param {object} material - That job's own row for this material
 * @param {number} ownNeed - How many of it this job still has to get
 * @param {Array<object>} childJobs - The material's linked child jobs
 * @returns {{
 *   output: number,
 *   supply: number,
 *   claims: number,
 *   ownNeed: number,
 *   min: number,
 *   max: number,
 *   coversEveryClaim: boolean,
 *   sharedWith: number,
 *   claimsKnown: boolean,
 *   }}
 */
export function childJobSupplyForMaterial(
  activeJobID,
  material,
  ownNeed,
  childJobs,
) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  const childIDs = new Set(childJobs.map((childJob) => childJob.jobID));
  const output = childJobs.reduce(
    (total, childJob) => total + totalQuantityProduced(childJob),
    0,
  );

  const parentIDs = new Set([activeJobID]);
  for (const childJob of childJobs) {
    for (const parentID of parentJobIDs(childJob)) {
      parentIDs.add(parentID);
    }
  }

  let imported = 0;
  let otherClaims = 0;
  let sharedWith = 0;
  let claimsKnown = true;

  for (const parentID of parentIDs) {
    let parentMaterial = material;
    let parentJob = null;
    if (parentID !== activeJobID) {
      parentJob = findJobInJobArray(parentID);
      if (!parentJob) {
        claimsKnown = false;
        continue;
      }
      parentMaterial = parentJob.build.materials?.[String(material.typeID)];
    }
    if (!parentMaterial) continue;

    imported += Object.values(parentMaterial.purchasing).reduce(
      (total, row) =>
        childIDs.has(row.childID) ? total + row.itemCount : total,
      0,
    );

    if (parentID === activeJobID) continue;
    otherClaims += quantityRemaining(
      parentMaterial,
      materialRequirementOf(parentJob?.build?.setup, material.typeID),
    );
    sharedWith++;
  }

  const supply = Math.max(0, output - imported);
  const claims = ownNeed + otherClaims;
  const max = Math.min(supply, ownNeed);
  const min = claimsKnown
    ? Math.max(0, Math.min(supply - otherClaims, ownNeed))
    : 0;

  return {
    output,
    supply,
    claims,
    ownNeed,
    min,
    max,
    coversEveryClaim: claimsKnown && supply >= claims,
    sharedWith,
    claimsKnown,
  };
}

export default childJobSupplyForMaterial;

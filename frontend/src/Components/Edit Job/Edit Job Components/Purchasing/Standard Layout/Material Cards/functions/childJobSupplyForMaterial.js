import useUsersStore from "../../../../../../../Zustand/usersStore";

/**
 * What a material's child jobs can be counted on to supply this job.
 *
 * A child's output is not promised to anyone: nothing records which parent it is
 * meant for until a cost is imported, and a child can feed several parents. So
 * what a parent can rely on is a range — at least what is left once every other
 * parent takes what it still needs, at most what this job needs. Only when the
 * children out-produce every claim on them is a parent certainly covered.
 *
 * @param {import("../../../../../../../Classes/job").default} activeJob - The job the card belongs to
 * @param {import("../../../../../../../Classes/jobMaterial").default} material
 * @param {Array<import("../../../../../../../Classes/job").default>} childJobs - The material's linked child jobs
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
 * }}
 */
export function childJobSupplyForMaterial(activeJob, material, childJobs) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  const childIDs = new Set(childJobs.map((childJob) => childJob.jobID));
  const output = childJobs.reduce(
    (total, childJob) => total + childJob.totalQuantityProduced,
    0
  );

  // Every job these children supply, this one included: a job that links a child
  // is a parent of it whether or not the child names it back, and a parent that
  // takes from two of them still only claims once.
  const parentIDs = new Set([activeJob.jobID]);
  for (const childJob of childJobs) {
    for (const parentID of childJob.parentJobIDs) {
      parentIDs.add(parentID);
    }
  }

  const ownNeed = material.quantityRemaining;
  let imported = 0;
  let otherClaims = 0;
  let sharedWith = 0;
  let claimsKnown = true;

  for (const parentID of parentIDs) {
    const parent =
      parentID === activeJob.jobID ? activeJob : findJobInJobArray(parentID);

    if (!parent) {
      claimsKnown = false;
      continue;
    }

    const parentMaterial = parent.build.materials?.find(
      (i) => i.typeID === material.typeID
    );
    if (!parentMaterial) continue;

    imported += parentMaterial.purchasing.reduce(
      (total, row) =>
        childIDs.has(row.childID) ? total + row.itemCount : total,
      0
    );

    if (parentID === activeJob.jobID) continue;
    otherClaims += parentMaterial.quantityRemaining;
    sharedWith++;
  }

  const supply = Math.max(0, output - imported);
  const claims = ownNeed + otherClaims;
  const max = Math.min(supply, ownNeed);
  const min = claimsKnown ? Math.max(0, Math.min(supply - otherClaims, ownNeed)) : 0;

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

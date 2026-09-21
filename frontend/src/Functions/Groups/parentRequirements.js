/**
 * What a job's parents need from it, and what is left over.
 *
 * A job with parents is building to order: its output is committed to the jobs
 * above it and is never listed. Quoting a sale price for that part would invite
 * a player to read a profit that does not exist — so what can honestly be sold
 * is the surplus, and that is what this works out.
 */

/**
 * @typedef {object} ParentRequirements
 * @property {number} parentTotal - How much the parents require in total
 * @property {number} childrenTotal - How much this job's siblings already produce
 * @property {boolean} multipleChildren - Whether siblings share the requirement
 * @property {Array<{jobID: string, produced: number}>} siblings - The other jobs
 *   feeding the same requirement
 */

/**
 * Walks the parents to total what they ask of this job.
 *
 * @param {object} params
 * @param {string[]} params.parentJobIDs - The parents the job will have, as
 *   `useParentJobIDs` reads them
 * @param {(jobID: string) => object|undefined} params.findJobInJobArray
 * @param {number} params.itemID - What this job produces
 * @param {string} params.jobID - This job, so it does not count itself as a sibling
 * @returns {ParentRequirements}
 */
export function resolveParentRequirements({
  parentJobIDs = [],
  findJobInJobArray,
  itemID,
  jobID,
}) {
  const totals = {
    parentTotal: 0,
    childrenTotal: 0,
    multipleChildren: false,
    siblings: [],
  };

  for (const parentID of parentJobIDs) {
    const parent = findJobInJobArray(parentID);
    if (!parent) continue;

    const material = parent.build.materials[String(itemID)];
    if (!material) continue;
    totals.parentTotal += material.quantity;

    const siblings = (parent.build.childJobs[material.typeID] ?? []).filter(
      (i) => i !== jobID,
    );
    for (const siblingID of siblings) {
      const sibling = findJobInJobArray(siblingID);
      if (!sibling) continue;
      totals.multipleChildren = true;
      totals.childrenTotal += sibling.totalQuantityProduced;
      totals.siblings.push({
        jobID: siblingID,
        produced: sibling.totalQuantityProduced ?? 0,
      });
    }
  }

  return totals;
}

/**
 * @typedef {object} ParentCommitment
 * @property {boolean} hasParents
 * @property {number} outstanding - What this job is expected to cover, after
 *   what its siblings already produce
 * @property {number} committed - How much of this job's output is spoken for
 * @property {number} surplus - How much can be sold
 */

/**
 * Splits what a job produces into what it owes and what it may sell.
 *
 * The requirement is shared out across every job feeding it, in job id order,
 * each taking what is left after the ones before it. The order is arbitrary but
 * it is the *same* order whichever child asks, which is what matters: two
 * children each measuring themselves against the other's whole output would both
 * find themselves surplus, and the pair would report twice the spare stock the
 * group actually has.
 *
 * @param {object} params
 * @param {number} params.produced - This job's total output
 * @param {string} params.jobID - This job, so it can find its own share
 * @param {ParentRequirements} params.requirements
 * @param {boolean} params.hasParents
 * @returns {ParentCommitment}
 */
export function parentCommitment({
  produced = 0,
  jobID,
  requirements,
  hasParents,
}) {
  if (!hasParents) {
    return {
      hasParents: false,
      outstanding: 0,
      committed: 0,
      surplus: produced,
    };
  }

  const contributors = [
    ...(requirements?.siblings ?? []),
    { jobID, produced },
  ].sort((a, b) => String(a.jobID).localeCompare(String(b.jobID)));

  let remaining = requirements?.parentTotal ?? 0;
  let outstanding = 0;
  let committed = 0;

  for (const contributor of contributors) {
    if (contributor.jobID === jobID) outstanding = remaining;

    const takes = Math.min(contributor.produced, remaining);
    remaining -= takes;

    if (contributor.jobID === jobID) committed = takes;
  }

  return {
    hasParents: true,
    outstanding,
    committed,
    surplus: Math.max(0, produced - committed),
  };
}

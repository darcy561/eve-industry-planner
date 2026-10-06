import { totalQuantityProduced } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
/**
 * @typedef {object} ParentRequirements
 * @property {number} parentTotal - How much the parents require in total
 * @property {number} childrenTotal - How much this job's siblings already produce
 * @property {boolean} multipleChildren - Whether siblings share the requirement
 * @property {Array<{jobID: string, produced: number}>} siblings - The other jobs
 *   feeding the same requirement
 * @property {Array<{jobID: string, name: string, itemID: number, needs: number}>} parents - Each
 *   parent that asks for this job's item, and how many
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
    parents: [],
  };

  for (const parentID of parentJobIDs) {
    const parent = findJobInJobArray(parentID);
    if (!parent) continue;

    const material = parent.build.materials[String(itemID)];
    totals.parents.push({
      jobID: parent.jobID,
      name: parent.name,
      itemID: parent.itemID,
      needs: material?.quantity ?? 0,
    });
    if (!material) continue;
    totals.parentTotal += material.quantity;

    const siblings = (parent.build.childJobs[material.typeID] ?? []).filter(
      (i) => i !== jobID,
    );
    for (const siblingID of siblings) {
      const sibling = findJobInJobArray(siblingID);
      if (!sibling) continue;
      totals.multipleChildren = true;
      totals.childrenTotal += totalQuantityProduced(sibling);
      totals.siblings.push({
        jobID: siblingID,
        produced: totalQuantityProduced(sibling),
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
 * @property {number} needed - How much the parents ask for in total
 * @property {number} madeByOthers - How much the other jobs feeding them make
 * @property {number} shortfall - How much the parents ask for that no job feeding them makes
 * @property {Array<ParentCoverage>} parents - Largest need first
 */

/**
 * @typedef {object} ParentCoverage
 * @property {string} jobID
 * @property {string} name
 * @property {number} itemID
 * @property {number} needs
 * @property {number} short - What of its need is left uncovered, 0 when covered
 */

/**
 * Splits what a job produces into what it owes and what it may sell, sharing the requirement across
 * every job feeding it in job id order so each child gets the same answer.
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
      needed: 0,
      madeByOthers: 0,
      shortfall: 0,
      parents: [],
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
    needed: requirements?.parentTotal ?? 0,
    madeByOthers: requirements?.childrenTotal ?? 0,
    shortfall: remaining,
    parents: coverParents(requirements?.parents ?? [], remaining),
  };
}

/**
 * Shares a shortfall out across the parents, largest need first, so the smallest asks are the ones
 * left short.
 *
 * @param {ParentRequirements["parents"]} parents
 * @param {number} shortfall
 * @returns {Array<ParentCoverage>}
 */
function coverParents(parents, shortfall) {
  const ordered = [...parents].sort(
    (a, b) =>
      b.needs - a.needs || String(a.jobID).localeCompare(String(b.jobID)),
  );
  let supply =
    ordered.reduce((total, parent) => total + parent.needs, 0) - shortfall;

  return ordered.map((parent) => {
    const covered = Math.min(parent.needs, Math.max(0, supply));
    supply -= covered;
    return { ...parent, short: parent.needs - covered };
  });
}

import { formatNumberForLocale } from "../Helper/numberParser";

/**
 * What to tell someone when closing a job changed it, or the jobs around it.
 *
 * Closing recalculates a job's production against what its parents need, so a
 * quantity someone set by hand can be replaced on the way out. The figures are
 * the ones that were saved, and the job the person was looking at is named
 * first.
 *
 * @param {import("../../Classes/job").default} job - The job being closed
 * @param {Array<{jobID: string, name: string, before: number, after: number}>} adjustments
 *   Jobs the close recalculated, and what they produced before and after
 * @returns {string} Snackbar text
 */
export function closeAdjustmentSummary(job, adjustments = []) {
  const name = job?.name || "Job";
  if (adjustments.length === 0) return `${name} Updated`;

  const own = adjustments.find(({ jobID }) => jobID === job?.jobID);
  const parentIDs = new Set(job?.parentJobIDs ?? []);
  const childIDs = new Set(job?.childJobIDs ?? []);

  let parents = 0;
  let children = 0;
  let others = 0;
  for (const { jobID } of adjustments) {
    if (jobID === job?.jobID) continue;
    if (parentIDs.has(jobID)) parents++;
    else if (childIDs.has(jobID)) children++;
    else others++;
  }

  const parts = [];
  if (own) {
    const produced = formatNumberForLocale(own.after, { max: 0 });
    parts.push(
      parentIDs.size > 0
        ? `now making ${produced} to cover its parent jobs`
        : `now making ${produced}`
    );
  }
  if (parents > 0) parts.push(`${count(parents, "parent job")} adjusted`);
  if (children > 0) parts.push(`${count(children, "child job")} adjusted`);
  if (others > 0) parts.push(`${count(others, "related job")} adjusted`);

  return `${name} updated — ${joinParts(parts)}`;
}

/** @param {number} n @param {string} noun */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** @param {string[]} parts */
function joinParts(parts) {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export default closeAdjustmentSummary;

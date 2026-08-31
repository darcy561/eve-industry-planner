/**
 * Groups list rows into the blocks the table draws.
 *
 * A row carries both a `groupID` and a `relatedSetID`, and they answer different
 * questions: a group is a container the user made, a related set is a dependency
 * graph the build has. Neither implies the other, so the group wins when a row
 * has both — it is the thing the user named and archived as a unit.
 *
 * The rows come back in the order the caller asked the server for, so blocks
 * take the position of their first member rather than being hoisted above the
 * standalone jobs. Reordering here would answer a different question from the
 * one the sort control asked.
 *
 * @param {Array<Object>} jobs
 * @returns {Array<{kind: "group"|"related"|"job", id: string, label: string,
 *                  jobs: Object[]}>}
 */
export function groupArchivedRows(jobs = []) {
  const blocks = new Map();
  const out = [];

  for (const job of jobs) {
    const groupID = job?.groupID;
    const relatedSetID = job?.relatedSetID;

    const key = groupID
      ? `group:${groupID}`
      : relatedSetID
        ? `related:${relatedSetID}`
        : null;

    if (!key) {
      out.push({ kind: "job", id: job.jobID, label: job.name, jobs: [job] });
      continue;
    }

    const existing = blocks.get(key);
    if (existing) {
      existing.jobs.push(job);
      continue;
    }

    const block = {
      kind: groupID ? "group" : "related",
      id: groupID || relatedSetID,
      jobs: [job],
    };
    blocks.set(key, block);
    out.push(block);
  }

  // Labelled once every member is known: a block is named after what it holds.
  for (const block of blocks.values()) {
    block.label = blockLabel(block);
  }

  return out;
}

/**
 * Names a block.
 *
 * A group has no name in the archive — the group document was deleted when it
 * was archived, and is rebuilt from its jobs only on restore — so both kinds are
 * named after what they produce.
 */
function blockLabel(block) {
  const names = block.jobs.map((job) => job?.name).filter(Boolean);
  if (names.length === 0) return "Untitled";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} more`;
}

/**
 * Sums a block's figures.
 *
 * Rows without measures are skipped rather than counted as zero: the statistics
 * rebuild has not folded them yet, which is a different claim from a job that
 * earned nothing. The block reports how many it could not count.
 *
 * @param {Object[]} jobs
 */
export function blockTotals(jobs = []) {
  let jobCostTotal = 0;
  let profitLoss = 0;
  let counted = 0;

  for (const job of jobs) {
    if (!job?.measures) continue;
    jobCostTotal += Number(job.measures.jobCostTotal ?? 0);
    profitLoss += Number(job.measures.profitLoss ?? 0);
    counted += 1;
  }

  return {
    jobCostTotal,
    profitLoss,
    counted,
    uncounted: jobs.length - counted,
  };
}

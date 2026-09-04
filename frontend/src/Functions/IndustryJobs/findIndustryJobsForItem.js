/**
 * The ESI industry runs a job can link.
 *
 * ESI reports a corporation run once for every character holding the role, so
 * the same run arrives several times in one list and is offered once.
 *
 * A run already linked — to this job, or to any other on the account — is not
 * offered again, unless it is on its way out: unlinking is pending until the
 * job saves, so a run being removed is available immediately.
 *
 * @param {Array<Object>} allIndustryJobs - Industry jobs as ESI reported them
 * @param {import("../../Classes/job").default} activeJob - The job being edited
 * @param {Object} [options]
 * @param {Set<number>} [options.linkedAcrossAccount] - Runs any job holds
 * @param {Array<number>|Set<number>} [options.beingRemoved] - Runs queued for unlinking
 * @returns {Array<Object>} The runs to offer, in the order ESI reported them
 */
export default function findIndustryJobsForItem(
  allIndustryJobs,
  activeJob,
  { linkedAcrossAccount = new Set(), beingRemoved = [] } = {}
) {
  if (!allIndustryJobs?.length || !activeJob) return [];

  const removing = new Set(beingRemoved);
  const alreadyOnThisJob = activeJob.esiJobIDs;
  const seen = new Set();

  return allIndustryJobs.filter((run) => {
    if (!run || seen.has(run.job_id)) return false;
    seen.add(run.job_id);

    if (run.product_type_id !== activeJob.itemID) return false;
    if (alreadyOnThisJob.has(run.job_id)) return false;

    const linkedElsewhere = linkedAcrossAccount.has(run.job_id);
    return !linkedElsewhere || removing.has(run.job_id);
  });
}

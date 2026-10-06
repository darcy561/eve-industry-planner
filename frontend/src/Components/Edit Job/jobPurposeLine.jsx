import { Fragment } from "react";
import { Link, Typography } from "@mui/material";
import { useJobCommitment } from "../../Hooks/Planner/useJobCommitment";
import { countOf, formatQuantity } from "../../Functions/Helper/numberParser";
import { useJobDraft, useParentJobIDs } from "./Edit Job Hooks/useJobDraft";
import { useOpenJob } from "./Edit Job Hooks/useOpenJob";

const NAMED_PARENTS = 3;

/**
 * Whether a job's output covers the parents it is owed to, or what it has to sell when it has none.
 *
 * @param {import("../../Functions/Groups/parentRequirements").ParentCommitment} commitment
 * @param {number} parentCount
 * @returns {string}
 */
export function jobCoverage(commitment, parentCount) {
  if (parentCount === 0) return `${formatQuantity(commitment.surplus)} to sell`;
  if (commitment.parents.length < parentCount) {
    return `${countOf(parentCount - commitment.parents.length, "parent")} not loaded here`;
  }
  if (commitment.shortfall > 0) {
    return `${formatQuantity(commitment.shortfall)} short`;
  }
  return commitment.surplus > 0
    ? `covered, ${formatQuantity(commitment.surplus)} spare`
    : "covered exactly";
}

function ParentLinks({ parents, parentCount }) {
  const openJob = useOpenJob();
  const named = parents.slice(0, NAMED_PARENTS);
  const unnamed = parentCount - named.length;

  return (
    <>
      {named.map((parent, index) => (
        <Fragment key={parent.jobID}>
          {index > 0 ? ", " : null}
          <Link
            component="button"
            type="button"
            variant="inherit"
            underline="hover"
            onClick={() => openJob(parent.jobID)}
          >
            {parent.name}
          </Link>
        </Fragment>
      ))}
      {unnamed > 0 ? `${named.length > 0 ? ", " : ""}+${unnamed} more` : null}
    </>
  );
}

/**
 * One line under the job's name: what it owes to how many parents, each named and opening it, and
 * how many setups build it.
 */
export default function JobPurposeLine() {
  const commitment = useJobCommitment();
  const parentCount = useParentJobIDs().length;
  const setupCount = useJobDraft(
    (job) => Object.keys(job.build.setup ?? {}).length,
  );

  return (
    <Typography variant="caption" color="text.secondary">
      {parentCount > 0 ? (
        <>
          {formatQuantity(commitment.committed)} for{" "}
          {countOf(parentCount, "parent")} (
          <ParentLinks parents={commitment.parents} parentCount={parentCount} />
          ) — {jobCoverage(commitment, parentCount)}
        </>
      ) : (
        jobCoverage(commitment, parentCount)
      )}{" "}
      · {countOf(setupCount, "setup")}
    </Typography>
  );
}

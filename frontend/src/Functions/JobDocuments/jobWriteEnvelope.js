/**
 * What one job's write looks like on the wire.
 *
 * The envelope carries the job's id, its group membership and the document
 * itself, because the server reads all three before it decodes anything: the
 * lock gate asks which planner document a write is for, and a partial document
 * carries a field only when the reader changed it, so it can say nothing about
 * the group a job belongs to.
 */
import { writeBody } from "./writeBody.js";

/**
 * The write for a job, carrying the fields it changed where that is known.
 *
 * A write is field-scoped only when both halves of the check are in hand: the
 * log saying what moved, and the revision of the document the log was recorded
 * against. Without either the whole document goes instead, checked against
 * whatever revision its own `_meta` carries — which covers a create, a job an
 * ESI refresh rewrote, and a job a close recalculated.
 *
 * @param {import("../../Classes/job.js").default} job
 * @param {Array<object>|null|undefined} entries - Log entries behind the write
 * @returns {{jobID: string, revision?: number, includedInGroup: boolean, groupID: string, document: object, removed?: Array<Array<string>>}|null}
 *   `null` where the log leaves nothing to write
 */
export function jobWriteEnvelope(job, entries) {
  const document = job.toDocument();
  const envelope = {
    jobID: job.jobID,
    includedInGroup: Boolean(job.includedInGroup),
    groupID: job.groupID ?? "",
  };

  const revision = job?._meta?.revision;
  if (!entries?.length || !(revision > 0)) {
    return { ...envelope, document };
  }

  const { document: partial, removed } = writeBody(document, entries);
  // A log whose changes cancelled out against the job as it now stands leaves
  // nothing to say. Sending it anyway would move the document on by one for no
  // change, refusing another member's write that was built from where it stood.
  if (Object.keys(partial).length === 0 && removed.length === 0) {
    return null;
  }
  return {
    ...envelope,
    revision,
    document: partial,
    ...(removed.length > 0 ? { removed } : {}),
  };
}

/**
 * The writes for jobs changed by something other than the reader editing them
 * — a merge relinking parents, a delete cutting children loose.
 *
 * Nothing records what changed on that path, so each document goes whole,
 * checked against the revision its own `_meta` carries.
 *
 * @param {Array<import("../../Classes/job.js").default>} jobs
 * @returns {Array<object>}
 */
export function wholeJobWrites(jobs) {
  return jobs.map((job) => jobWriteEnvelope(job, null));
}

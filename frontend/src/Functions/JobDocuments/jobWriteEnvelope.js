import { writeBody } from "./writeBody.js";
import { toDocument } from "./jobDocument.js";

/**
 * The write for a job, field-scoped where both the log of what moved and the revision it was
 * recorded against are in hand, and whole otherwise.
 *
 * @param {object} job
 * @param {Array<object>|null|undefined} entries - Log entries behind the write
 * @returns {{jobID: string, revision?: number, document: object, removed?: Array<Array<string>>}|null}
 *     `null` where the log leaves nothing to write
 */
export function jobWriteEnvelope(job, entries) {
  const document = toDocument(job);
  const envelope = { jobID: job.jobID };

  const revision = job?._meta?.revision;
  if (!entries?.length || !(revision > 0)) {
    return { ...envelope, document };
  }

  const { document: partial, removed } = writeBody(document, entries);
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
 * The writes for jobs changed by something other than the reader editing them, each carrying its
 * whole document.
 *
 * @param {Array<object>} jobs
 * @returns {Array<object>}
 */
export function wholeJobWrites(jobs) {
  return jobs.map((job) => jobWriteEnvelope(job, null));
}

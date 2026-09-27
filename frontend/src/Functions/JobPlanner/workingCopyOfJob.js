import { copyOfJob } from "../JobDocuments/jobDocument";

/**
 * A job that can be changed, taken from whatever the edit session holds.
 *
 * @param {object|null|undefined} source - A job document
 * @returns {object|null|undefined} The source unchanged where there is no job
 */
export default function workingCopyOfJob(source) {
  if (!source?.jobID) return source;

  return copyOfJob(source);
}

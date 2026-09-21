import Job from "../../../Classes/job";

/**
 * The open job as an instance of the class, for the few callers that need one.
 *
 * The page reads the job as plain data. What still wants a class is the work at
 * the edges — the archive, which asks the job what its document and its linked
 * rows are, and the cost a finished job passes up to its parents — so those
 * build a lens over the draft at the moment they act rather than the page
 * holding one.
 *
 * It is **frozen**, because the draft under it is. A caller that changes the job
 * in place throws where it does so, rather than appearing to work and losing the
 * change at the next read. The one caller that needs a job it can change is the
 * save, which takes its own copy.
 *
 * @param {object|null|undefined} document
 * @returns {Job|null}
 */
export function jobLens(document) {
  if (!document) return null;

  // The document is frozen, but the instance built around it is a new object:
  // without freezing that too, a field set straight on the job would still be
  // lost quietly rather than saying so.
  return Object.freeze(new Job(document));
}

import Job from "../../Classes/job";

/**
 * A job that can be changed, taken from whatever the edit session holds.
 *
 * What the session holds is frozen, and the planner's own jobs are changed in
 * place all over the app — closing rewrites links, the tree is recalculated,
 * group flags are set. So anything crossing from the session into that world
 * takes a copy here rather than at each call site.
 *
 * @param {object|null|undefined} source - A `Job`, or a job document
 * @returns {Job|null|undefined} The source unchanged where there is no job
 */
export default function workingCopyOfJob(source) {
  if (!source?.jobID) return source;

  return new Job(
    structuredClone(
      typeof source.toDocument === "function" ? source.toDocument() : source,
    ),
  );
}

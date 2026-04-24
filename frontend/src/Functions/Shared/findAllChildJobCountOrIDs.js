/**
 * Builds a deduped child-job set from persisted links, temporary links, and
 * pending parent-child cache edits.
 *
 * @param {Record<string, string[]>} childJobsFromJobObject
 * @param {Record<string, Array<{ jobID: string }>>} temporaryChildJobObject
 * @param {Record<string, { add: string[], remove: string[] }>} parentChildCache
 * @returns {{ childJobIDs: string[], childJobCount: number }}
 */
export default function findAllChildJobCountOrIDs(
  childJobsFromJobObject = {},
  temporaryChildJobObject = {},
  parentChildCache = {}
) {
  const persistedChildIDs = Object.values(childJobsFromJobObject).flat();
  const temporaryChildIDs = Object.values(temporaryChildJobObject).flatMap(
    (entries) => entries.map(({ jobID }) => jobID)
  );

  const parentCacheIDsToAdd = new Set();
  const parentCacheIDsToRemove = new Set();
  for (const materialObject of Object.values(parentChildCache)) {
    for (const id of materialObject?.add ?? []) parentCacheIDsToAdd.add(id);
    for (const id of materialObject?.remove ?? []) parentCacheIDsToRemove.add(id);
  }

  const finalChildIDSet = new Set([
    ...persistedChildIDs,
    ...temporaryChildIDs,
    ...parentCacheIDsToAdd,
  ]);
  for (const id of parentCacheIDsToRemove) {
    finalChildIDSet.delete(id);
  }

  const childJobIDs = [...finalChildIDSet];
  return {
    childJobIDs,
    childJobCount: childJobIDs.length,
  };
}

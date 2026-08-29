/** True when the API returned a real aggregate vs an empty placeholder for “no stats yet”. */
export function hasMeaningfulTotals(data) {
  if (!data) return false;
  if ((data.totalJobs ?? 0) > 0) return true;
  if ((data.itemBuildCount ?? 0) > 0) return true;
  return Array.isArray(data.dataSnapshots) && data.dataSnapshots.length > 0;
}

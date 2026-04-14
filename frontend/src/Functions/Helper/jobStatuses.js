import { jobStatusDefault } from "../../Context/defaultValues";

/**
 * Expands application_settings.jobStatuses (map of id -> { name, ... }) into the full
 * job status array used by the planner (defaults for sort order, expanded, ESI flags).
 * Unknown ids are appended sorted numerically.
 *
 * @param {Record<string, { name?: string }|undefined>|null|undefined} map
 * @returns {Array<object>}
 */
export function expandJobStatusesMapToArray(map) {
  const baseById = new Map(
    jobStatusDefault.map((s) => [String(s.id), { ...s }])
  );

  if (map && typeof map === "object") {
    for (const [key, entry] of Object.entries(map)) {
      if (!entry || typeof entry !== "object") continue;
      const idStr = String(key);
      const name = entry.name;
      if (baseById.has(idStr)) {
        const row = baseById.get(idStr);
        if (name != null && name !== "") {
          row.name = name;
        }
        Object.assign(row, entry);
        row.id = Number(key);
        row.sortOrder = row.sortOrder ?? Number(key);
      } else {
        const idNum = Number(key);
        baseById.set(idStr, {
          id: Number.isFinite(idNum) ? idNum : key,
          name: name != null ? name : "",
          sortOrder: Number.isFinite(idNum) ? idNum : 0,
          expanded: true,
          openAPIJobs: false,
          completeAPIJobs: false,
          ...entry,
        });
      }
    }
  }

  return Array.from(baseById.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, row]) => row);
}

/**
 * Builds a names-only map for persistence (Mongo / Firestore settings.jobStatuses).
 *
 * @param {Array<{ id: number|string, name: string }>} statusArray
 * @returns {Record<string, { name: string }>}
 */
export function jobStatusArrayToNamesMap(statusArray) {
  if (!Array.isArray(statusArray)) return {};
  return Object.fromEntries(
    statusArray
      .filter((s) => s != null && s.id !== undefined)
      .map((s) => [String(s.id), { name: s.name ?? "" }])
  );
}

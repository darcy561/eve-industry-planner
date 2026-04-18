import { JOB_STATUS_CATALOG } from "../../Context/defaultValues";

/** @type {string} */
export const JOB_STATUS_EXPANDED_STORAGE_PREFIX =
  "eveIndustryPlanner.jobStatusExpanded.v1:";

/**
 * @param {string|null|undefined} accountId
 * @returns {string|null}
 */
export function jobStatusExpandedStorageKey(accountId) {
  if (accountId == null || accountId === "") return null;
  return `${JOB_STATUS_EXPANDED_STORAGE_PREFIX}${accountId}`;
}

/**
 * @param {string|null|undefined} accountId
 * @returns {Record<string, boolean>}
 */
export function readJobStatusExpandedMap(accountId) {
  const key = jobStatusExpandedStorageKey(accountId);
  if (!key || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[String(k)] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string|null|undefined} accountId
 * @param {Record<string, boolean>} map
 */
export function writeJobStatusExpandedMap(accountId, map) {
  const key = jobStatusExpandedStorageKey(accountId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Resolved row for planner UI — names from settings map or catalog defaults;
 * expanded from localStorage-backed map (default expanded when unset).
 *
 * @param {Record<string, { name?: string }|undefined>|null|undefined} namesMap
 * @param {Record<string, boolean>|null|undefined} expandedMap
 * @returns {Array<{ id: number, name: string, expanded: boolean, order: number }>}
 */
export function buildJobStatusesDisplayList(namesMap, expandedMap) {
  const nm = namesMap && typeof namesMap === "object" ? namesMap : {};
  const em =
    expandedMap && typeof expandedMap === "object" ? expandedMap : {};

  return JOB_STATUS_CATALOG.slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const key = String(entry.id);
      const raw = nm[key]?.name;
      const name =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim()
          : entry.defaultName;
      const expanded =
        em[key] !== undefined ? Boolean(em[key]) : true;

      return {
        id: entry.id,
        order: entry.order,
        name,
        expanded,
      };
    });
}

/**
 * Names map suitable for API payloads (`jobStatuses` on ApplicationSettings).
 *
 * @param {Record<string, { name?: string }>|null|undefined} map
 * @returns {Record<string, { name: string }>}
 */
export function jobStatusesForPersist(map) {
  if (!map || typeof map !== "object") return {};
  /** @type {Record<string, { name: string }>} */
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (!v || typeof v !== "object") continue;
    const name = typeof v.name === "string" ? v.name : "";
    out[k] = { name };
  }
  return out;
}

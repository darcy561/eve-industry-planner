/**
 * Planners: the working areas an account may use (private API).
 */
import { requestWithPrivateHeaders } from "./applyPrivateHeaders.js";
import { splitOwnerHandle } from "../../Helper/ownerHandle.js";

const PLANNERS_ROOT = "/api/v1/planners";

/**
 * @typedef {object} PlannerSummary
 * @property {string} owner - the owner handle, `kind:id`; the id is the EVE id for
 *   a corporation or alliance
 * @property {string} kind - `account`, `corporation` or `alliance`
 * @property {string} name - what the planner is called, empty until something names it
 * @property {boolean} named - whether a planner document exists yet
 * @property {string} joinMethod - why the account is a member
 */

/**
 * Every planner the account may work in.
 *
 * A planner is listed whether or not anything has named it: membership is what
 * grants access, so an account reaches every corporation it is in before any of
 * them has a document. `named` says which, and an unnamed one carries the owner
 * handle alone — the client shows what it knows about the entity until the
 * planner is opened and the server names it.
 *
 * @returns {Promise<PlannerSummary[]>}
 */
export async function fetchPlannersFromApi() {
  const url = new URL(PLANNERS_ROOT, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "getPlanners" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET ${PLANNERS_ROOT} failed: ${res.status} ${text || res.statusText}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data?.planners) ? data.planners : [];
}

/**
 * Names a planner the account can already reach, so it has a document from then
 * on.
 *
 * Insert-only on the server: one that is already named keeps its name and is
 * returned unchanged, so this is safe to call whenever a listing shows one
 * unnamed. It grants nothing — the account must already hold a membership.
 *
 * @param {string} ownerHandle - `kind:id`, from a {@link PlannerSummary}
 * @returns {Promise<PlannerSummary>}
 */
export async function ensurePlannerViaApi(ownerHandle) {
  if (!ownerHandle) {
    throw new Error("ensurePlannerViaApi: an owner handle is required");
  }
  // The colon separates the halves, so only the id is escaped.
  const { kind, id } = splitOwnerHandle(ownerHandle);
  const path = `${PLANNERS_ROOT}/${kind}:${encodeURIComponent(id)}`;

  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "PUT" },
    { requestName: "ensurePlanner" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PUT ${path} failed: ${res.status} ${text || res.statusText}`,
    );
  }
  return res.json();
}

/**
 * @typedef {object} PlannerSettings
 * @property {object} customStructures
 * @property {number} defaultMaterialEfficiencyValue
 * @property {Object<string, Object<string, number>>} [predefinedSystemIndexes]
 * @property {{id: string, label: string, deleted: boolean, deletedAt: string|null}[]} [extrasCategories]
 * @property {number} defaultCitadelBrokersFee
 * @property {object} reprocessingSettings
 * @property {number[]} [exemptTypeIDs] - an array on the wire; held as a Set
 */

/**
 * @param {string} ownerHandle
 * @returns {string}
 */
function plannerSettingsPath(ownerHandle) {
  // The colon separates the halves, so only the id is escaped.
  const { kind, id } = splitOwnerHandle(ownerHandle);
  return `${PLANNERS_ROOT}/${kind}:${encodeURIComponent(id)}/settings`;
}

/**
 * The collection a planner's settings are stored in, as a change delivery names
 * it. Its documents are keyed by owner key rather than by an id inside a planner,
 * so a delivery's `owner` handle is what identifies one and `docID` is not.
 */
export const PLANNER_SETTINGS_COLLECTION = "planner_settings";

/**
 * @typedef {object} PlannerSettingsResponse
 * @property {string} owner - the owner handle the settings belong to
 * @property {boolean} seeded - whether the planner has settings of its own
 * @property {PlannerSettings} settings
 */

/**
 * The settings a planner's work is done under.
 *
 * A planner with none answers defaults with `seeded: false`, so the caller always
 * has a usable list and can tell a stored value from a fallback.
 *
 * @param {string} ownerHandle - `kind:id`, from a {@link PlannerSummary}
 * @returns {Promise<PlannerSettingsResponse>}
 */
export async function fetchPlannerSettingsFromApi(ownerHandle) {
  if (!ownerHandle) {
    throw new Error("fetchPlannerSettingsFromApi: an owner handle is required");
  }
  const path = plannerSettingsPath(ownerHandle);

  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "getPlannerSettings" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET ${path} failed: ${res.status} ${text || res.statusText}`,
    );
  }
  return res.json();
}

/**
 * Changes part of the settings a planner's work is done under.
 *
 * The body names only what changed, so a member editing one setting does not
 * send back a copy of the rest that another member may have moved on from.
 *
 * @param {string} ownerHandle - `kind:id`, from a {@link PlannerSummary}
 * @param {object} update - the settings to change
 * @returns {Promise<PlannerSettingsResponse>}
 */
export async function savePlannerSettingsToApi(ownerHandle, update) {
  if (!ownerHandle) {
    throw new Error("savePlannerSettingsToApi: an owner handle is required");
  }
  const path = plannerSettingsPath(ownerHandle);

  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
    { requestName: "savePlannerSettings" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PUT ${path} failed: ${res.status} ${text || res.statusText}`,
    );
  }
  return res.json();
}

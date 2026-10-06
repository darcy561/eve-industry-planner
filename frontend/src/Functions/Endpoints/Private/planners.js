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
 * Every planner the account may work in, named or not; an unnamed one carries its owner handle
 * alone until the planner is opened and the server names it.
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
 * Names a planner the account can already reach, so it has a document from then on; one already
 * named keeps its name and is returned unchanged.
 *
 * @param {string} ownerHandle - `kind:id`, from a {@link PlannerSummary}
 * @returns {Promise<PlannerSummary>}
 */
export async function ensurePlannerViaApi(ownerHandle) {
  if (!ownerHandle) {
    throw new Error("ensurePlannerViaApi: an owner handle is required");
  }
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
 * @property {{compressedOre: string, countLeftoversAsSold?: boolean, buyOutright?: boolean,
 *   shipping: {mode: string, amount?: number}, neverChoose: number[]}} reprocessingSettings
 * @property {number[]} [exemptTypeIDs] - an array on the wire; held as a Set
 */

/**
 * @param {string} ownerHandle
 * @returns {string}
 */
function plannerSettingsPath(ownerHandle) {
  const { kind, id } = splitOwnerHandle(ownerHandle);
  return `${PLANNERS_ROOT}/${kind}:${encodeURIComponent(id)}/settings`;
}

/**
 * The collection a planner's settings are stored in, as a change delivery names it; a delivery's
 * `owner` handle identifies the document, not its `docID`.
 */
export const PLANNER_SETTINGS_COLLECTION = "planner_settings";

/**
 * @typedef {object} PlannerSettingsResponse
 * @property {string} owner - the owner handle the settings belong to
 * @property {boolean} seeded - whether the planner has settings of its own
 * @property {PlannerSettings} settings
 */

/**
 * The settings a planner's work is done under; a planner with none answers the defaults with
 * `seeded: false`.
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
 * Changes part of the settings a planner's work is done under, sending only the fields that
 * changed.
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

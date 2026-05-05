/**
 * Account-scoped group templates (`user_group_template_catalog` + payloads).
 */
import {
  requestWithPrivateHeaders,
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * @typedef {object} TemplateCatalogEntry
 * @property {string} templateID
 * @property {string} name
 * @property {string} description
 * @property {number} totalJobs
 * @property {Array<{ templateJobId: string, itemID: number, desiredTotalQuantity: number }>} outputsSummary
 * @property {number[]} rootOutputItemIDs
 * @property {string} payloadDocumentId
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @returns {Promise<TemplateCatalogEntry[]>}
 */
export async function fetchTemplateCatalogSummaries() {
  const url = new URL("/api/v1/group-templates", window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "getGroupTemplateCatalog" }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /api/v1/group-templates failed: ${res.status} ${text || res.statusText}`
    );
  }
  const data = await res.json();
  return Array.isArray(data?.templates) ? data.templates : [];
}

/**
 * @param {string} templateID
 * @returns {Promise<TemplateCatalogEntry>}
 */
export async function getGroupTemplateSummary(templateID) {
  const path = `/api/v1/group-templates/${encodeURIComponent(templateID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(url.toString(), { method: "GET" }, {
    requestName: "getGroupTemplateSummary",
  });
  if (res.status === 404) {
    throw new Error("Template not found");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET group-template summary failed: ${res.status} ${text || res.statusText}`
    );
  }
  return res.json();
}

/**
 * Full payload document (graph + presetSetups).
 *
 * @param {string} templateID
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getGroupTemplateFull(templateID) {
  const path = `/api/v1/group-templates/${encodeURIComponent(templateID)}/full`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(url.toString(), { method: "GET" }, {
    requestName: "getGroupTemplateFull",
  });
  if (res.status === 404) {
    throw new Error("Template not found");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET group-template full failed: ${res.status} ${text || res.statusText}`
    );
  }
  return res.json();
}

/**
 * @param {{ name: string, description?: string, templateID?: string, payload: Record<string, unknown> }} body
 * @returns {Promise<{ templateID: string }>}
 */
export async function postGroupTemplate(body) {
  const url = new URL("/api/v1/group-templates", window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    },
    { requestName: "postGroupTemplate", retry: privateBatchRetryConfig }
  );
  if (res.status === 409) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Template limit reached");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `POST /api/v1/group-templates failed: ${res.status} ${text || res.statusText}`
    );
  }
  return res.json();
}

/**
 * @param {string} templateID
 * @param {{ name?: string, description?: string, payload?: Record<string, unknown> }} patch
 */
export async function patchGroupTemplate(templateID, patch) {
  const path = `/api/v1/group-templates/${encodeURIComponent(templateID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    },
    { requestName: "patchGroupTemplate", retry: privateBatchRetryConfig }
  );
  if (res.status === 404) {
    throw new Error("Template not found");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PATCH group-template failed: ${res.status} ${text || res.statusText}`
    );
  }
}

/**
 * @param {string} templateID
 */
export async function deleteGroupTemplate(templateID) {
  const path = `/api/v1/group-templates/${encodeURIComponent(templateID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "DELETE" },
    { requestName: "deleteGroupTemplate", retry: privateBatchRetryConfig }
  );
  if (res.status === 404) {
    throw new Error("Template not found");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `DELETE group-template failed: ${res.status} ${text || res.statusText}`
    );
  }
}

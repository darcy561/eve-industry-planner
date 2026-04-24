/**
 * POST /api/v1/job-documents (batch by IDs) — HTTP only; no Zustand.
 * Use {@link fetchJobDocumentsByIdsFromApi} when the result should merge into the store.
 */
import Job from "../../../Classes/job.js";
import { requestWithPrivateHeaders } from "./applyPrivateHeaders.js";

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * @param {string[]} jobIDs
 * @returns {Promise<Job[]>}
 */
export async function requestJobDocumentsByIdsFromApi(jobIDs) {
  const ids = [...new Set((jobIDs ?? []).filter(Boolean))];
  if (ids.length === 0) return [];

  const res = await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ jobIDs: ids }),
    },
    { requestName: "getJobDocumentsByIds" }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `POST /api/v1/job-documents failed: ${res.status} ${text || res.statusText}`
    );
  }

  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => new Job(row));
}

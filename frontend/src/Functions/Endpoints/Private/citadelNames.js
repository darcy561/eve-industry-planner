import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const CITADEL_NAMES_URL = "/api/v1/user/citadel-names";
const PUBLIC_CITADEL_NAMES_URL = "/api/v1/citadel-names";

/**
 * One POST body item: ESI `GET /universe/structures/{structure_id}/` fields plus required `id`.
 * Optional keys omitted when absent so the API can preserve stored fields on legacy-only updates.
 *
 * @typedef {{
 *   id: number,
 *   name: string,
 *   solar_system_id?: number,
 *   type_id?: number,
 *   position?: { x: number, y: number, z: number },
 * }} CitadelStructureSubmission
 */

/** @type {CitadelStructureSubmission[]} */
const submissionQueue = [];
let flushTimer = null;

const FLUSH_DELAY_MS = 2500;
/** Must match `maxCitadelNameBatch` in services/api/v1endpoints/user/citadelNames.go */
const MAX_SUBMISSIONS_PER_REQUEST = 200;
/** Flush early so a single request stays small and responsive. */
const MAX_SUBMISSIONS_BEFORE_FLUSH = 80;
/** Cap memory if offline / repeated failures (may span multiple POSTs when flushing). */
const MAX_QUEUED_SUBMISSIONS = 300;

function dedupeQueueLastWins() {
  const byId = new Map();
  for (const row of submissionQueue) {
    byId.set(row.id, row);
  }
  submissionQueue.length = 0;
  for (const v of byId.values()) {
    submissionQueue.push(v);
  }
}

/**
 * Builds the submission payload from ESI JSON ([GetUniverseStructuresStructureId](https://developers.eveonline.com/api-explorer#/operations/GetUniverseStructuresStructureId)).
 * Strips app-only fields (e.g. `resolutionStatus`).
 *
 * @param {number} structureId
 * @param {Record<string, unknown>} esi - Parsed response body from ESI (before or after adding client fields).
 * @returns {CitadelStructureSubmission | null}
 */
export function buildEsiStructureSubmission(structureId, esi) {
  if (structureId == null || structureId <= 0 || !esi || typeof esi !== "object") {
    return null;
  }
  const name =
    typeof esi.name === "string" ? esi.name.trim() : "";
  if (!name) return null;

  /** @type {CitadelStructureSubmission} */
  const row = {
    id: structureId,
    name,
  };

  if (
    "solar_system_id" in esi &&
    esi.solar_system_id != null &&
    Number.isFinite(Number(esi.solar_system_id))
  ) {
    row.solar_system_id = Math.trunc(Number(esi.solar_system_id));
  }
  if (
    "type_id" in esi &&
    esi.type_id != null &&
    Number.isFinite(Number(esi.type_id))
  ) {
    row.type_id = Math.trunc(Number(esi.type_id));
  }

  const pos = /** @type {{ x?: unknown, y?: unknown, z?: unknown }} */ (
    esi.position
  );
  if (pos && typeof pos === "object") {
    const { x, y, z } = pos;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof z === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z)
    ) {
      row.position = { x, y, z };
    }
  }

  return row;
}

/**
 * @param {CitadelStructureSubmission[]} submissions
 * @returns {Promise<boolean>}
 */
async function postCitadelNamesBatch(submissions) {
  if (!submissions?.length) return true;
  try {
    const response = await requestWithPrivateHeaders(
      CITADEL_NAMES_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ submissions }),
      },
      { requestName: "submitCitadelNamesBatch" }
    );
    return response.ok;
  } catch (error) {
    console.error("Citadel names batch submit failed:", error);
    return false;
  }
}

/**
 * Flushes the in-memory queue using one POST per chunk (≤ {@link MAX_SUBMISSIONS_PER_REQUEST}).
 * Safe to call anytime; no-op if empty.
 *
 * @returns {Promise<void>}
 */
export async function flushCitadelNamesSubmissionQueue() {
  if (submissionQueue.length === 0) return;
  dedupeQueueLastWins();
  if (submissionQueue.length > MAX_QUEUED_SUBMISSIONS) {
    submissionQueue.splice(0, submissionQueue.length - MAX_QUEUED_SUBMISSIONS);
  }
  const pending = submissionQueue.splice(0, submissionQueue.length);
  for (let i = 0; i < pending.length; i += MAX_SUBMISSIONS_PER_REQUEST) {
    const chunk = pending.slice(i, i + MAX_SUBMISSIONS_PER_REQUEST);
    const ok = await postCitadelNamesBatch(chunk);
    if (!ok) {
      submissionQueue.unshift(...pending.slice(i));
      return;
    }
  }
}

function scheduleFlush() {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (submissionQueue.length >= MAX_SUBMISSIONS_BEFORE_FLUSH) {
    void flushCitadelNamesSubmissionQueue();
    return;
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushCitadelNamesSubmissionQueue();
  }, FLUSH_DELAY_MS);
}

/**
 * Queues an ESI-shaped structure submission (batch/debounced).
 *
 * @param {CitadelStructureSubmission} submission
 */
export function queueCitadelStructureSubmission(submission) {
  if (!submission || submission.id == null || submission.id <= 0) return;
  const name = typeof submission.name === "string" ? submission.name.trim() : "";
  if (!name) return;

  const idx = submissionQueue.findIndex((e) => e.id === submission.id);
  const row = { ...submission, id: submission.id, name };
  if (idx >= 0) submissionQueue[idx] = row;
  else submissionQueue.push(row);

  scheduleFlush();
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushCitadelNamesSubmissionQueue();
    }
  });
}

export async function resolveCitadelName(id) {
  if (!id) return null;
  try {
    const response = await fetch(`${PUBLIC_CITADEL_NAMES_URL}/${id}`, {
      method: "GET",
      cache: "force-cache",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Error resolving citadel name:", error);
    return null;
  }
}

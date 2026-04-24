/**
 * Module singleton WebSocket client for same-origin `/ws` (JWT subprotocol auth).
 * Does not live in Zustand — connect/disconnect are explicit from auth lifecycle.
 */

import { isAppJwtExpired } from "../Functions/Auth/appJwt.js";
import { fetchPlannerJobDocumentsFromApi } from "../Functions/Endpoints/Pirivate/jobDocuments.js";
import { applyRemoteMessage } from "./applyRemoteMessage.js";
import { syncAccountDocumentsFromServer } from "./resyncRealtimeDocumentsFromServer.js";
import useUsersStore from "../Zustand/usersStore.js";
import {
  clearRealtimeClientID,
  clearRealtimeClientIdentityHard,
  getRealtimeClientID,
  setRealtimeClientID,
} from "./wsClientIdentity.js";

/** @type {WebSocket|null} */
let socket = null;
/** @type {string|null} */
let connectKey = null;
/** @type {{ accessToken: string, accountId: string }|null} */
let lastConnectParams = null;
let reconnectTimer = null;
let pingTimer = null;
let manualClose = false;

const PING_MS = 45_000;

/** Pending `document_lock_status_batch` requests (correlate with `document_lock_status_batch_ack`). */
const LOCK_STATUS_BATCH_WS_TIMEOUT_MS = 12_000;
/** @type {Map<string, { resolve: (value: unknown) => void, reject: (reason?: unknown) => void, timer: ReturnType<typeof setTimeout> }>} */
const documentLockStatusBatchPending = new Map();

function rejectAllDocumentLockStatusBatchPending(message) {
  for (const [, pending] of documentLockStatusBatchPending) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  documentLockStatusBatchPending.clear();
}

/** RFC normal closure — use when intentionally closing so the server does not log 1005 “no status”. */
const WS_CLOSE_NORMAL = 1000;

/**
 * Reconnect backoff: must stay aligned with `services/websocket/server/realtime_timing.go` (wsReconnect* / handoff TTL).
 * @see services/websocket/server/realtime_timing.go
 */
export const WS_RECONNECT_BASE_MS = 750;
/** Cap backoff so a bad stretch of failures does not strand the UI for a long time between retries. */
export const WS_RECONNECT_MAX_MS = 20_000;
/**
 * Server handoff TTL = WS_RECONNECT_MAX_MS + this (ms). Handoff should outlive one max-delay retry.
 * @see services/websocket/server/realtime_timing.go (wsSessionHandoffSlackMS)
 */
export const WS_SESSION_HANDOFF_SLACK_MS = 5_000;
export const WS_SESSION_HANDOFF_MS =
  WS_RECONNECT_MAX_MS + WS_SESSION_HANDOFF_SLACK_MS;

let reconnectAttempt = 0;

/** After JWT `exp`, do not open or backoff-reconnect until the store supplies a fresh token. */
let haltedForExpiredToken = false;
/** Last access token string we successfully opened on (for rotation + resync detection). */
let lastSuccessfulOpenToken = null;

/** One-shot hint for JWT rotation: previous server client_id before intentional disconnect. */
/** @type {{ accountId: string, clientId: string } | null} */
let resumeHint = null;

/** Resolves when `resume_ack` arrives after `session_resume` (JWT handoff). */
/** @type {{ resolve: (v: { skipBaselineSync: boolean, restoredDocIDs?: string[] }) => void } | null} */
let resumeBootstrap = null;

/**
 * Call immediately before `disconnectRealtime()` when the hook will reconnect with a new JWT
 * (same logged-in account). Uses current store + live client id so logout cleanup does not stash.
 */
export function stashRealtimeSessionResumeHint() {
  const { isLoggedIn, accountID } = useUsersStore.getState().account;
  const cid = getRealtimeClientID();
  if (!isLoggedIn || !accountID || !cid) return;
  resumeHint = { accountId: accountID, clientId: cid };
}

function wsUrl() {
  const u = new URL("/ws", window.location.origin);
  return u.toString().replace(/^http/, "ws");
}

/** @param {string} token */
function base64UrlFromJwt(token) {
  const b64 = btoa(token);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function clearTimers() {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer != null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(connectFn) {
  if (manualClose) return;
  const p = lastConnectParams;
  if (!p || isAppJwtExpired(p.accessToken)) {
    haltedForExpiredToken = true;
    return;
  }
  const delay = Math.min(
    WS_RECONNECT_MAX_MS,
    WS_RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt)
  );
  reconnectAttempt += 1;
  clearTimers();
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectFn();
  }, delay);
}

/**
 * Account-scoped realtime: the server fans out all `accountID`-tagged doc updates after JWT upgrade.
 * Optional explicit `subscribe` messages are only for escape-hatch doc ids (see `subscribeDocIDs`).
 */
function sendBaselineSubscriptionsForOpen(_accountId, _attemptedSessionResume, _resumeAck) {
  /* intentionally empty — connection + JWT implies full account stream */
}

/**
 * @param {{ accessToken: string, accountId: string }} params
 */
export function connectRealtime(params) {
  const { accessToken, accountId } = params;
  if (!accessToken || !accountId) return;

  if (isAppJwtExpired(accessToken)) {
    console.warn("[realtime] reconnect blocked: access token expired", {
      accountId,
      reason: "token_expired",
    });
    haltedForExpiredToken = true;
    clearTimers();
    if (socket) {
      try {
        socket.close(WS_CLOSE_NORMAL, "token_expired");
      } catch {
        /* ignore */
      }
      socket = null;
    }
    connectKey = null;
    lastConnectParams = null;
    clearRealtimeClientIdentityHard();
    reconnectAttempt = 0;
    return;
  }

  const forceBaselineResync = haltedForExpiredToken;
  haltedForExpiredToken = false;

  lastConnectParams = params;
  const nextKey = `${accessToken}:${accountId}`;
  if (
    socket &&
    socket.readyState === WebSocket.OPEN &&
    connectKey === nextKey
  ) {
    return;
  }

  manualClose = false;
  connectKey = nextKey;
  clearTimers();

  let sessionResumePreviousId = null;
  if (resumeHint) {
    const h = resumeHint;
    resumeHint = null;
    if (h.accountId === accountId && h.clientId) {
      sessionResumePreviousId = h.clientId;
    }
  }

  if (socket) {
    try {
      socket.close(WS_CLOSE_NORMAL, "replaced");
    } catch {
      /* ignore */
    }
    socket = null;
    clearRealtimeClientID();
  }

  const proto = `auth.${base64UrlFromJwt(accessToken)}`;
  /** Guard listeners so a lagging close from a replaced socket cannot clear the active connection or its timers. */
  let ws;
  try {
    ws = new WebSocket(wsUrl(), [proto]);
    socket = ws;
  } catch (e) {
    console.error("[realtime] WebSocket construct failed", e);
    scheduleReconnect(() => {
      if (lastConnectParams) connectRealtime(lastConnectParams);
    });
    return;
  }

  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    reconnectAttempt = 0;
    const prevOpenToken = lastSuccessfulOpenToken;
    lastSuccessfulOpenToken = accessToken;

    void (async () => {
      const attemptedSessionResume = Boolean(
        sessionResumePreviousId && socket === ws
      );
      /** @type {{ skipBaselineSync?: boolean, restoredDocIDs?: string[] } | null} */
      let resumeAck = null;
      let resumeSkippedBaseline = false;

      if (attemptedSessionResume) {
        try {
          ws.send(
            JSON.stringify({
              type: "session_resume",
              previousClientID: sessionResumePreviousId,
            })
          );
          resumeAck = await Promise.race([
            new Promise((resolve) => {
              resumeBootstrap = { resolve };
            }),
            new Promise((resolve) =>
              setTimeout(() => resolve({ skipBaselineSync: false }), 400)
            ),
          ]);
          resumeSkippedBaseline = !!resumeAck.skipBaselineSync;
        } catch {
          resumeSkippedBaseline = false;
          resumeAck = { skipBaselineSync: false };
        } finally {
          resumeBootstrap = null;
        }
      }

      if (socket !== ws) return;

      /**
       * Baseline GET for `users` + `application_settings` after (re)open.
       * `resume_ack.skipBaselineSync` avoids duplicate GETs on clean JWT handoff, but background tabs
       * can miss WS frames during refresh — always pull singletons when the JWT string changed.
       */
      const tokenChanged =
        prevOpenToken == null || prevOpenToken !== accessToken;
      const shouldSync =
        tokenChanged ||
        (!resumeSkippedBaseline && forceBaselineResync);
      if (shouldSync) {
        void syncAccountDocumentsFromServer();
      }

      /**
       * JWT rotation / reconnect: planner rows still rely on WS fan-out — events during the gap are
       * lost. Re-merge from the API when the socket subprotocol token changes (not first open).
       */
      const shouldRefetchPlannerJobs =
        forceBaselineResync ||
        (prevOpenToken != null && prevOpenToken !== accessToken);
      if (shouldRefetchPlannerJobs) {
        void fetchPlannerJobDocumentsFromApi().catch((e) => {
          console.warn(
            "[realtime] planner job documents refetch after WS token change failed",
            e
          );
        });
      }

      sendBaselineSubscriptionsForOpen(
        accountId,
        attemptedSessionResume,
        resumeAck
      );
      pingTimer = window.setInterval(() => {
        if (socket === ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send("ping");
          } catch {
            /* ignore */
          }
        }
      }, PING_MS);
    })();
  });

  ws.addEventListener("message", (ev) => {
    if (socket !== ws) return;
    if (typeof ev.data !== "string") return;
    const data = ev.data;
    if (data === "pong" || data === "ping") return;
    if (!data.startsWith("{")) return;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        if (parsed.type === "resume_ack") {
          if (resumeBootstrap) {
            resumeBootstrap.resolve({
              skipBaselineSync: !!parsed.skipBaselineSync,
              restoredDocIDs: Array.isArray(parsed.restoredDocIDs)
                ? parsed.restoredDocIDs
                : undefined,
            });
            resumeBootstrap = null;
          }
          return;
        }
        if (parsed.type === "connected") {
          setRealtimeClientID(parsed.clientID);
          return;
        }
      }
      if (parsed.type === "document_lock") {
        window.dispatchEvent(
          new CustomEvent("eip-document-lock", {
            detail: parsed.payload,
          })
        );
        return;
      }
      if (parsed.type === "document_lock_status_batch_ack") {
        const id =
          typeof parsed.requestId === "string" ? parsed.requestId : "";
        const pending = id
          ? documentLockStatusBatchPending.get(id)
          : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          documentLockStatusBatchPending.delete(id);
          if (parsed.ok) {
            pending.resolve(parsed);
          } else {
            const errMsg =
              typeof parsed.error === "string" && parsed.error.trim()
                ? parsed.error
                : "document_lock_status_batch failed";
            pending.reject(new Error(errMsg));
          }
        }
        return;
      }
      void applyRemoteMessage(parsed).catch(() => {});
    } catch {
      /* ignore malformed */
    }
  });

  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    rejectAllDocumentLockStatusBatchPending("websocket closed");
    clearTimers();
    socket = null;
    clearRealtimeClientID();
    if (!manualClose && connectKey === nextKey) {
      const p = lastConnectParams;
      if (!p || isAppJwtExpired(p.accessToken)) {
        console.warn("[realtime] reconnect blocked after socket close: token expired", {
          accountId,
          reason: "token_expired",
        });
        haltedForExpiredToken = true;
        return;
      }
      scheduleReconnect(() => {
        if (lastConnectParams) connectRealtime(lastConnectParams);
      });
    }
  });

  ws.addEventListener("error", () => {
    /* close event handles reconnect */
  });
}

/** @param {{ accessToken: string, accountId: string }} params */
export function reconnectRealtime(params) {
  connectRealtime(params);
}

export function disconnectRealtime() {
  rejectAllDocumentLockStatusBatchPending("realtime disconnected");
  if (resumeBootstrap) {
    resumeBootstrap.resolve({ skipBaselineSync: false });
    resumeBootstrap = null;
  }
  manualClose = true;
  connectKey = null;
  lastConnectParams = null;
  lastSuccessfulOpenToken = null;
  haltedForExpiredToken = false;
  /** New session / token rotation should not inherit exponential backoff from prior failures. */
  reconnectAttempt = 0;
  clearRealtimeClientIdentityHard();
  clearTimers();
  if (socket) {
    try {
      socket.close(WS_CLOSE_NORMAL, "disconnect");
    } catch {
      /* ignore */
    }
    socket = null;
  }
}

/**
 * @param {string} collection
 * @param {string[]} docIds - raw Mongo ids (not collection-prefixed)
 */
export function subscribeDocIDs(collection, docIds) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!collection || !docIds?.length) return;
  const scoped = docIds.map((id) => `${collection}.${id}`);
  socket.send(JSON.stringify({ type: "subscribe", docIDs: scoped }));
}

/**
 * @param {string} collection
 * @param {string[]} docIds
 */
export function unsubscribeDocIDs(collection, docIds) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!collection || !docIds?.length) return;
  const scoped = docIds.map((id) => `${collection}.${id}`);
  socket.send(JSON.stringify({ type: "unsubscribe", docIDs: scoped }));
}

/** True when the singleton `/ws` connection is open (same-origin JWT subprotocol). */
export function isRealtimeSocketOpen() {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

/**
 * Same lock rows as POST `/api/v1/document-locks/status-batch`, over WebSocket.
 * Rejects when offline, on server error payload, or timeout — callers typically fall back to HTTP.
 *
 * @param {{ jobDocIDs?: string[], groupDocIDs?: string[], timeoutMs?: number }} params
 * @returns {Promise<{ jobResults: Record<string, unknown>, groupResults: Record<string, unknown> }>}
 */
export function requestDocumentLockStatusBatchOverRealtime(params = {}) {
  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : LOCK_STATUS_BATCH_WS_TIMEOUT_MS;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("websocket not connected"));
  }
  const jobDocIDs = Array.isArray(params.jobDocIDs) ? params.jobDocIDs : [];
  const groupDocIDs = Array.isArray(params.groupDocIDs)
    ? params.groupDocIDs
    : [];
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (documentLockStatusBatchPending.has(requestId)) {
        documentLockStatusBatchPending.delete(requestId);
        reject(new Error("document_lock_status_batch timeout"));
      }
    }, timeoutMs);
    documentLockStatusBatchPending.set(requestId, {
      resolve: (raw) => {
        const jobResults =
          raw?.jobResults && typeof raw.jobResults === "object"
            ? raw.jobResults
            : {};
        const groupResults =
          raw?.groupResults && typeof raw.groupResults === "object"
            ? raw.groupResults
            : {};
        resolve({ jobResults, groupResults });
      },
      reject,
      timer,
    });
    try {
      socket.send(
        JSON.stringify({
          type: "document_lock_status_batch",
          requestId,
          jobDocIDs,
          groupDocIDs,
        })
      );
    } catch (e) {
      clearTimeout(timer);
      documentLockStatusBatchPending.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

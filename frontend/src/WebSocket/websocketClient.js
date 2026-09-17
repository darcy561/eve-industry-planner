/**
 * Module singleton WebSocket client for same-origin `/ws` (per-tab session query param).
 * Does not live in Zustand — connect/disconnect are explicit from auth lifecycle.
 */

import { getSessionIDFromStore } from "../Functions/Endpoints/Private/applyPrivateHeaders.js";
import { loadPlannerDocuments } from "../Functions/DocumentLoad/loadPlannerDocuments.js";
import { applyRemoteMessage } from "./applyRemoteMessage.js";
import { requestAppConfigRecheck } from "../Events/appConfigEvents.js";
import { loadAccountDocuments } from "../Functions/DocumentLoad/loadAccountDocuments.js";
import useUsersStore from "../Zustand/usersStore.js";
import {
  clearWsClientID,
  clearWsClientIdentityHard,
  getWsClientID,
  setWsClientID,
} from "./wsClientIdentity.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_FRAME_TYPES,
} from "../Functions/DocumentLock/documentLockEvents.js";

/** @type {WebSocket|null} */
let socket = null;
/** @type {string|null} */
let connectKey = null;
/** @type {{ accountId: string }|null} */
let lastConnectParams = null;
let reconnectTimer = null;

let pingTimer = null;
let manualClose = false;
/**
 * True while the stack is in maintenance. Stops the retry schedule; the
 * connection is still wanted, so nothing is torn down.
 */
let parkedForMaintenance = false;

const PING_MS = 45_000;

/**
 * Normalises doc.lock fan-out into the `eip-document-lock` detail shape.
 * The server always emits the flat envelope `{ type: "document_lock", event, …fields }`
 * (see `services/websocket/server/natslogic/locks.go::BuildDocumentLockWire`).
 *
 * @param {Record<string, unknown>} parsed
 * @returns {Record<string, unknown>|null}
 */
export function documentLockWireToDetail(parsed) {
  const ev = parsed.event;
  const name = typeof ev === "string" && ev.trim() !== "" ? ev.trim() : "";
  if (!name) return null;
  const { type: _outer, event: _ev, ...rest } = parsed;
  return { ...rest, event: name, type: name };
}

/** Pending `document_lock_lock_state_batch` requests (correlate with `document_lock_lock_state_batch_ack`). */
const LOCK_LOCK_STATE_BATCH_WS_TIMEOUT_MS = 12_000;
/** @type {Map<string, { resolve: (value: unknown) => void, reject: (reason?: unknown) => void, timer: ReturnType<typeof setTimeout> }>} */
const documentLockLockStateBatchPending = new Map();

function rejectAllDocumentLockLockStateBatchPending(message) {
  for (const [, pending] of documentLockLockStateBatchPending) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  documentLockLockStateBatchPending.clear();
}

/** RFC normal closure — use when intentionally closing so the server does not log 1005 “no status”. */
const WS_CLOSE_NORMAL = 1000;

/**
 * Reconnect backoff: must stay aligned with `services/websocket/server/websocket_timing.go` (wsReconnect* / handoff TTL).
 *
 * @see services/websocket/server/websocket_timing.go
 */
export const WS_RECONNECT_BASE_MS = 750;
/** Cap backoff so a bad stretch of failures does not strand the UI for a long time between retries. */
export const WS_RECONNECT_MAX_MS = 20_000;
/**
 * Server handoff TTL = WS_RECONNECT_MAX_MS + this (ms). Handoff should outlive one max-delay retry.
 *
 * @see services/websocket/server/websocket_timing.go (wsSessionHandoffSlackMS)
 */
export const WS_SESSION_HANDOFF_SLACK_MS = 5_000;
export const WS_SESSION_HANDOFF_MS =
  WS_RECONNECT_MAX_MS + WS_SESSION_HANDOFF_SLACK_MS;

let reconnectAttempt = 0;

/**
 * Last planner `sessionID` from the client store at the last successful `open` (rotation / relog
 * detection — compared to {@link getSessionIDFromStore} on each open).
 */
let lastSuccessfulOpenSessionId = null;

/** One-shot hint for session-identity rotation: previous server client_id before intentional disconnect. */
/** @type {{ accountId: string, clientId: string } | null} */
let resumeHint = null;

/** Resolves when `resume_ack` arrives after `session_resume` handoff. */
/** @type {{ resolve: (v: { skipDocumentLoad: boolean, restoredDocIDs?: string[] }) => void } | null} */
let resumeBootstrap = null;

/**
 * Call immediately before `disconnectWebsocket()` when the hook will reconnect with a new session identity
 * (same logged-in account). Uses current store + live client id so logout cleanup does not stash.
 */
export function stashWebsocketSessionResumeHint() {
  const { isLoggedIn, accountID } = useUsersStore.getState().account;
  const cid = getWsClientID();
  if (!isLoggedIn || !accountID || !cid) return;
  resumeHint = { accountId: accountID, clientId: cid };
}

/** Same-origin `/ws`; per-tab session via `planner_session_id` query param. */
function wsUrl() {
  const u = new URL("/ws", window.location.origin);
  const sid = getSessionIDFromStore();
  if (sid) {
    u.searchParams.set("planner_session_id", sid);
  }
  // Optional bake hint for ops/logs; ws-router prefers newest slots regardless.
  try {
    const baked =
      typeof __APP_VERSION__ !== "undefined" ? String(__APP_VERSION__) : "";
    if (baked) {
      u.searchParams.set("app_version", baked);
    }
  } catch {
    /* ignore */
  }
  if (u.protocol === "https:") {
    u.protocol = "wss:";
  } else if (u.protocol === "http:") {
    u.protocol = "ws:";
  }
  return u.toString();
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
  if (manualClose || parkedForMaintenance) return;
  const p = lastConnectParams;
  if (!p) {
    return;
  }
  const delay = Math.min(
    WS_RECONNECT_MAX_MS,
    WS_RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
  );
  reconnectAttempt += 1;
  clearTimers();
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectFn();
  }, delay);
}

/**
 * Account-scoped websocket: the server fans out all `accountID`-tagged doc updates after session upgrade.
 * Optional explicit `subscribe` messages are only for escape-hatch doc ids (see `subscribeDocIDs`).
 *
 * @param {{ accountId: string }} params
 */
export function connectWebsocket(params) {
  const { accountId } = params;
  if (!accountId) return;

  const sessionIdForWs = getSessionIDFromStore();

  lastConnectParams = params;
  const nextKey = accountId;
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
    clearWsClientID();
  }

  /** Guard listeners so a lagging close from a replaced socket cannot clear the active connection or its timers. */
  let ws;
  let opened = false;
  try {
    ws = new WebSocket(wsUrl());
    socket = ws;
  } catch (e) {
    console.error("[websocket] WebSocket construct failed", e);
    scheduleReconnect(() => {
      if (lastConnectParams) connectWebsocket(lastConnectParams);
    });
    return;
  }

  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    opened = true;
    reconnectAttempt = 0;
    const prevOpenSessionId = lastSuccessfulOpenSessionId;
    lastSuccessfulOpenSessionId = sessionIdForWs;

    void (async () => {
      const attemptedSessionResume = Boolean(
        sessionResumePreviousId && socket === ws,
      );
      let resumeSkippedDocumentLoad = false;

      if (attemptedSessionResume) {
        try {
          ws.send(
            JSON.stringify({
              type: "session_resume",
              previousClientID: sessionResumePreviousId,
            }),
          );
          const resumeAck = await Promise.race([
            new Promise((resolve) => {
              resumeBootstrap = { resolve };
            }),
            new Promise((resolve) =>
              setTimeout(() => resolve({ skipDocumentLoad: false }), 400),
            ),
          ]);
          resumeSkippedDocumentLoad = !!resumeAck.skipDocumentLoad;
        } catch {
          resumeSkippedDocumentLoad = false;
        } finally {
          resumeBootstrap = null;
        }
      }

      if (socket !== ws) return;

      /**
       * Loads `users` + `application_settings` after (re)open when the in-store `sessionID`
       * changed, or when we attempted `session_resume` but did not receive `resume_ack.skipDocumentLoad`
       * (handoff uncertain). Same-session reconnect with a matched handoff skips duplicate GETs.
       */
      const sessionIdentityChanged =
        prevOpenSessionId == null || prevOpenSessionId !== sessionIdForWs;
      const shouldSync =
        sessionIdentityChanged ||
        (attemptedSessionResume && !resumeSkippedDocumentLoad);
      if (shouldSync) {
        void loadAccountDocuments();
      }

      // Events during a reconnect gap are lost, so re-load the planner from the
      // API when the session id changed (not on first open).
      const shouldReloadPlanner =
        prevOpenSessionId != null && prevOpenSessionId !== sessionIdForWs;
      if (shouldReloadPlanner) {
        void loadPlannerDocuments().catch((e) => {
          console.warn(
            "[websocket] planner reload after session identity change failed",
            e,
          );
        });
      }

      // A new connection starts on the session's grants, not the chosen planner.
      restoreActivePlanner();

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
              skipDocumentLoad: !!parsed.skipDocumentLoad,
              restoredDocIDs: Array.isArray(parsed.restoredDocIDs)
                ? parsed.restoredDocIDs
                : undefined,
            });
            resumeBootstrap = null;
          }
          return;
        }
        if (parsed.type === "connected") {
          setWsClientID(parsed.clientID);
          // app_version here is process bake (slot identity) — do NOT feed the
          // advertised-version snackbar path (that would clear "outdated" on OLD).
          // eslint-disable-next-line no-console -- ops/test: which Swarm websocket slot hosts us
          console.info("[websocket] connected", {
            clientID: parsed.clientID,
            slot: parsed.slot,
            app_version: parsed.app_version,
          });
          return;
        }
        if (parsed.type === "please_reconnect") {
          // Drain / evacuate (#8 / #21): console only — makes ops moves easy to follow in DevTools.
          // eslint-disable-next-line no-console -- intentional ops/test visibility for slot moves
          console.info(
            "[websocket] please_reconnect:",
            typeof parsed.message === "string" && parsed.message
              ? parsed.message
              : "(no message)",
            {
              action: parsed.action,
              via: parsed.via,
              slot: parsed.slot,
            },
          );
          return;
        }
      }
      if (parsed.type === DOCUMENT_LOCK_FRAME_TYPES.CHANNEL) {
        const detail = documentLockWireToDetail(
          /** @type {Record<string, unknown>} */ (parsed),
        );
        if (detail) {
          window.dispatchEvent(
            new CustomEvent(DOCUMENT_LOCK_CUSTOM_EVENT, {
              detail,
            }),
          );
        }
        return;
      }
      if (parsed.type === DOCUMENT_LOCK_FRAME_TYPES.LOCK_STATE_BATCH_ACK) {
        const id = typeof parsed.requestId === "string" ? parsed.requestId : "";
        const pending = id
          ? documentLockLockStateBatchPending.get(id)
          : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          documentLockLockStateBatchPending.delete(id);
          if (parsed.ok) {
            pending.resolve(parsed);
          } else {
            const errMsg =
              typeof parsed.error === "string" && parsed.error.trim()
                ? parsed.error
                : "document_lock_lock_state_batch failed";
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
    rejectAllDocumentLockLockStateBatchPending("websocket closed");
    clearTimers();
    socket = null;
    clearWsClientID();
    if (!manualClose && connectKey === nextKey) {
      const p = lastConnectParams;
      if (!p) {
        return;
      }
      // A refused handshake reaches the browser as a close with no status, so
      // app-config is asked why rather than the retry schedule guessing.
      if (!opened) {
        requestAppConfigRecheck();
      }
      scheduleReconnect(() => {
        if (lastConnectParams) connectWebsocket(lastConnectParams);
      });
    }
  });

  ws.addEventListener("error", () => {
    /* close event handles reconnect */
  });
}

/**
 * Parks the websocket layer, stopping the retry schedule. Driven from app-config:
 * a refused upgrade reaches the browser as an opaque close with no status.
 */
export function parkWebsocketForMaintenance() {
  parkedForMaintenance = true;
  clearTimers();
}

/** Lifts the park and reconnects if a connection is still wanted; backoff restarts. */
export function resumeWebsocketAfterMaintenance() {
  if (!parkedForMaintenance) return;
  parkedForMaintenance = false;
  reconnectAttempt = 0;
  if (manualClose || socket || !lastConnectParams) return;
  connectWebsocket(lastConnectParams);
}

/** True while the websocket layer is parked for maintenance (tests / diagnostics). */
export function isWebsocketParkedForMaintenance() {
  return parkedForMaintenance;
}

export function disconnectWebsocket() {
  rejectAllDocumentLockLockStateBatchPending("websocket disconnected");
  if (resumeBootstrap) {
    resumeBootstrap.resolve({ skipDocumentLoad: false });
    resumeBootstrap = null;
  }
  manualClose = true;
  connectKey = null;
  lastConnectParams = null;
  lastSuccessfulOpenSessionId = null;
  // A new sign-in must not inherit the last session's planner.
  useUsersStore.getState().activePlanner.actions.setActivePlannerOwner(null);
  /** New session should not inherit exponential backoff from prior failures. */
  reconnectAttempt = 0;
  parkedForMaintenance = false;
  clearWsClientIdentityHard();
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

/**
 * Tells the server which planner this connection is working in.
 *
 * The server replaces the planner it delivers rather than adding to it. The
 * account's own documents stay live either way.
 *
 * @param {string} ownerHandle - `kind:id`, from the planners listing
 * @returns {boolean} true if the message was queued on the socket
 */
export function sendActivePlanner(ownerHandle) {
  if (!ownerHandle) return false;
  // Held only once the connection has it: a store naming a planner the socket
  // never heard of would scope reads to one planner and receive another.
  if (!writeActivePlanner(ownerHandle)) return false;
  useUsersStore
    .getState()
    .activePlanner.actions.setActivePlannerOwner(ownerHandle);
  return true;
}

/**
 * Re-sends the active planner after a reconnect.
 *
 * A new connection derives its scopes from the session and knows nothing of a
 * planner chosen before the socket dropped, so the client names it again.
 */
export function restoreActivePlanner() {
  const owner = useUsersStore.getState().activePlanner.owner;
  if (!owner) return false;
  return writeActivePlanner(owner);
}

function writeActivePlanner(ownerHandle) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify({ type: "active_planner", owner: ownerHandle }));
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} true if the command was queued on the socket */
export function sendDocumentLockEphemeralCommand(
  messageType,
  collection,
  docID,
) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  if (!messageType || !collection || !docID) {
    return false;
  }
  try {
    socket.send(
      JSON.stringify({
        type: messageType,
        collection,
        docID,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** True when the singleton same-origin `/ws` connection is open (cookie session auth). */
export function isWebsocketOpen() {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

/**
 * Same lock rows as POST `/api/v1/document-locks/lock-state-batch`, over WebSocket.
 * Rejects when offline, on server error payload, or timeout — callers typically fall back to HTTP.
 *
 * @param {{ jobDocIDs?: string[], groupDocIDs?: string[], timeoutMs?: number }} params
 * @returns {Promise<{ jobResults: Record<string, unknown>, groupResults: Record<string, unknown> }>}
 */
export function requestDocumentLockLockStateBatchOverWebsocket(params = {}) {
  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : LOCK_LOCK_STATE_BATCH_WS_TIMEOUT_MS;
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
      if (documentLockLockStateBatchPending.has(requestId)) {
        documentLockLockStateBatchPending.delete(requestId);
        reject(new Error("document_lock_lock_state_batch timeout"));
      }
    }, timeoutMs);
    documentLockLockStateBatchPending.set(requestId, {
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
          type: DOCUMENT_LOCK_FRAME_TYPES.LOCK_STATE_BATCH,
          requestId,
          jobDocIDs,
          groupDocIDs,
        }),
      );
    } catch (e) {
      clearTimeout(timer);
      documentLockLockStateBatchPending.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

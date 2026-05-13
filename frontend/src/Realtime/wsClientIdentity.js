/**
 * In-memory websocket client identity for attaching to private API requests.
 * Set when server emits `{ type: "connected", clientID }`.
 */

/** Same-tab survives refresh — pairs old id → new id for doc-lock {@link ../Hooks/useDocumentLock.js} rebind. */
const SESSION_WS_CLIENT_ID_KEY = "eip_ws_client_id";

/** @type {string|null} */
let wsClientID = null;

/**
 * Last id before `wsClientID` became null due to transient disconnect (socket close /
 * reconnect). Lets us pair Redis doc-lock rebind after session refresh / reconnect: old id → new id even
 * when {@link setRealtimeClientID} runs with `prev === null` because the cookie was cleared first.
 */
let lastWsClientIDBeforeDisconnect = null;

function dispatchClientIdChanged(previousClientID, clientID) {
  window.dispatchEvent(
    new CustomEvent("eip-ws-client-id-changed", {
      detail: { previousClientID, clientID },
    })
  );
}

/**
 * Normal clear while the session may reconnect (temporary socket drop). Preserves id for
 * {@link lastWsClientIDBeforeDisconnect} once so {@link setRealtimeClientID} can emit a
 * `(old,new)` transition for doc-lock rebind.
 *
 * @param {string|null|undefined} value
 */
export function setRealtimeClientID(value) {
  const next = typeof value === "string" ? value.trim() : "";
  const prev = wsClientID;
  const newID = next || null;
  if (prev === newID) return;

  /** Who Redis / UI should treat as “previous” for `(old→new)` rebind transitions. */
  let pairPrev = prev;

  if (prev === null && newID) {
    if (
      lastWsClientIDBeforeDisconnect &&
      lastWsClientIDBeforeDisconnect !== newID
    ) {
      pairPrev = lastWsClientIDBeforeDisconnect;
      lastWsClientIDBeforeDisconnect = null;
    } else if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem(SESSION_WS_CLIENT_ID_KEY);
      if (stored && stored !== newID) {
        pairPrev = stored;
      }
    }
  }

  wsClientID = newID;

  dispatchClientIdChanged(pairPrev, newID);

  if (typeof sessionStorage !== "undefined") {
    if (newID) {
      sessionStorage.setItem(SESSION_WS_CLIENT_ID_KEY, newID);
    } else {
      sessionStorage.removeItem(SESSION_WS_CLIENT_ID_KEY);
    }
  }
}

/** Used on socket close / reconnect path (not logout). Still receives `(prev,null)` events. */
export function clearRealtimeClientID() {
  const prev = wsClientID;
  wsClientID = null;
  if (prev !== null) {
    lastWsClientIDBeforeDisconnect = prev;
    dispatchClientIdChanged(prev, null);
  }
}

/** Logout / intentional teardown: forget cached ids so the next login never rebinds against a stale ws id. */
export function clearRealtimeClientIdentityHard() {
  const prev = wsClientID;
  wsClientID = null;
  lastWsClientIDBeforeDisconnect = null;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_WS_CLIENT_ID_KEY);
  }
  if (prev !== null) {
    dispatchClientIdChanged(prev, null);
  }
}

export function getRealtimeClientID() {
  return wsClientID;
}

/**
 * Document-lock event-type constants.
 *
 * Three layers use these strings and have to agree exactly:
 *  - Backend NATS publishers (`services/api/v1endpoints/documentlocks/*`).
 *  - WebSocket fan-out wrapping each inner payload as `{ type: "document_lock", payload }`.
 *  - This frontend, which dispatches the inner `payload.type` onto the
 *    `eip-document-lock` CustomEvent and branches on it inside `useDocumentLock`.
 *
 * Keep the values in sync with `services/api/v1endpoints/documentlocks/events.go`.
 */

/**
 * Inner-payload `type` strings dispatched onto the `eip-document-lock`
 * CustomEvent.
 */
export const DOCUMENT_LOCK_EVENTS = Object.freeze({
  ACQUIRED: "document_lock_acquired",
  RELEASED: "document_lock_released",
  REQUESTED: "document_lock_requested",
  EXPIRED: "document_lock_expired",
  HANDOFF_PROBE: "document_lock_handoff_probe",
  HANDOFF_COMPLETED: "document_lock_handoff_completed",
  VIEWER_JOINED: "document_lock_viewer_joined",
  VIEWER_LEFT: "document_lock_viewer_left",
});

/**
 * Outer WebSocket envelope `type` strings (used by `realtimeClient.js`).
 */
export const DOCUMENT_LOCK_WS_TYPES = Object.freeze({
  /** Inner-payload-bearing frame (server → client). */
  ENVELOPE: "document_lock",
  /** Frontend → server status batch request (round-trip). */
  STATUS_BATCH: "document_lock_status_batch",
  /** Server → frontend ack for `STATUS_BATCH`. */
  STATUS_BATCH_ACK: "document_lock_status_batch_ack",
});

/**
 * `reason` fields on `document_lock_released` / `document_lock_expired` /
 * `document_lock_handoff_completed` events. Keep matched to backend constants
 * `LockReleaseReason*`, `LockExpiryReason*`, `LockHandoffReason*`.
 */
export const DOCUMENT_LOCK_RELEASE_REASONS = Object.freeze({
  /**
   * Per-job lock force-released by the server because the parent group lock
   * rotated. Receivers must NOT auto-reacquire on this — see the released
   * handler in `useDocumentLock.js`.
   */
  GROUP_HANDOFF_CASCADE: "group_handoff_cascade",
  /** Holder accepted a request snackbar and there was no live waitlist head. */
  HAND_OVER_NO_QUEUE: "hand_over_no_queue",
});

export const DOCUMENT_LOCK_EXPIRY_REASONS = Object.freeze({
  TTL: "ttl",
});

export const DOCUMENT_LOCK_HANDOFF_REASONS = Object.freeze({
  /** Holder pressed "Hand over editing" on the request snackbar. */
  HOLDER_HANDOVER: "holder_handover",
  /** TTL expired and the alive waitlist head was promoted by the subscriber. */
  TTL_PROMOTION: "ttl_promotion",
});

/**
 * Browser CustomEvent name carrying inner document-lock payloads.
 */
export const DOCUMENT_LOCK_CUSTOM_EVENT = "eip-document-lock";

/**
 * Document-lock wire naming (aligned with `shared/core/documentlock`):
 *
 * - **Domain events** — `DOCUMENT_LOCK_DOMAIN_EVENTS` string values. They are
 *   stored under JSON key {@link DOCUMENT_LOCK_DOMAIN_EVENT_KEY} (`"event"`) on
 *   JetStream `doc.lock.*` bodies and on WebSocket fan-out frames, and appear on
 *   `eip-document-lock` CustomEvent `detail` (with `detail.type` set as an alias).
 * - **Frame types** — `DOCUMENT_LOCK_FRAME_TYPES` string values for the WebSocket
 *   JSON **`type`** field only: the doc-lock channel tag (`CHANNEL`), client→server
 *   commands, and server acks. These are not domain events.
 *
 * Keep domain event values in sync with `services/shared/core/documentlock/events.go`.
 */

/**
 * Domain event name strings (`document_lock_*`) for JetStream `event`, WS fan-out
 * `event`, and CustomEvent `detail.event` / `detail.type`.
 */
export const DOCUMENT_LOCK_DOMAIN_EVENTS = Object.freeze({
  ACQUIRED: "document_lock_acquired",
  RELEASED: "document_lock_released",
  REQUESTED: "document_lock_requested",
  EXPIRED: "document_lock_expired",
  HANDOFF_PROBE: "document_lock_handoff_probe",
  HANDOFF_COMPLETED: "document_lock_handoff_completed",
  /**
   * Group → jobs cascade event. Emitted once when a group lock rotates
   * (handoff, TTL promotion, or RequestAccess auto-grant on an orphaned
   * group). `detail.releases` is an array of `{ docID, sessionID }` for
   * every evicted per-job lock, applied in a single store transaction
   * by `useLockScopeSync.js` / `useDocumentLock.js`. Receivers must NOT
   * auto-reacquire.
   */
  GROUP_CASCADE: "document_lock_group_cascade",
  VIEWER_JOINED: "document_lock_viewer_joined",
  VIEWER_LEFT: "document_lock_viewer_left",
});

/** JSON field name for domain events (`event`), matching `documentlock.LockPayloadEventKey`. */
export const DOCUMENT_LOCK_DOMAIN_EVENT_KEY = "event";

/**
 * WebSocket JSON **`type`** field values (frame discriminators, not domain events).
 */
export const DOCUMENT_LOCK_FRAME_TYPES = Object.freeze({
  /** Server → client doc.lock fan-out (`event` + fields); legacy `{ payload }` still accepted. */
  CHANNEL: "document_lock",
  /**
   * @deprecated Same as {@link DOCUMENT_LOCK_FRAME_TYPES.CHANNEL}. Prefer `CHANNEL`.
   */
  ENVELOPE: "document_lock",
  /** Client → server lock-state batch (HTTP backup: POST `/lock-state-batch`). */
  LOCK_STATE_BATCH: "document_lock_lock_state_batch",
  /** Server → client ack for `LOCK_STATE_BATCH`. */
  LOCK_STATE_BATCH_ACK: "document_lock_lock_state_batch_ack",
  /** Client → server waitlist pulse (HTTP backup: POST `/waitlist-pulse`). */
  WAITLIST_PULSE: "document_lock_waitlist_pulse",
  /** Client → server viewer arrived (HTTP backup: POST `/viewer-arrived`). */
  VIEWER_ARRIVED: "document_lock_viewer_arrived",
  /** Client → server viewer departed (HTTP backup: POST `/viewer-departed`). */
  VIEWER_DEPARTED: "document_lock_viewer_departed",
});

/**
 * `reason` fields on `document_lock_released` / `document_lock_expired` /
 * `document_lock_handoff_completed` / `document_lock_group_cascade` events.
 * Keep matched to backend constants `LockReleaseReason*`, `LockExpiryReason*`,
 * `LockHandoffReason*`.
 */
export const DOCUMENT_LOCK_RELEASE_REASONS = Object.freeze({
  /**
   * Reason tag carried on `GROUP_CASCADE` events. The cascade evicts per-job
   * locks held by the previous group holder after the group lock rotates;
   * receivers must NOT auto-reacquire — see `useDocumentLock.js` / `useLockScopeSync.js`.
   */
  GROUP_HANDOFF_CASCADE: "group_handoff_cascade",
  /** Per-job releases when the group lock holder saves new `includedJobIDs` (PUT /v1/groups). */
  GROUP_MEMBERSHIP_ADDED: "group_membership_added",
  /** Holder POST `/release` succeeded — voluntary drop of the edit lock. */
  HOLDER_RELEASE: "holder_release",
  /** Same-account `POST /force-release` cleared another tab's lock. */
  FORCE_RELEASED_SAME_ACCOUNT: "force_released_same_account",
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
 * Browser CustomEvent name carrying document-lock domain payloads.
 */
export const DOCUMENT_LOCK_CUSTOM_EVENT = "eip-document-lock";

/**
 * Client-only: matching scope should flush `POST /extend` immediately
 * (see `useLockExtendLoop`).
 * `detail`: `{ collection: string, docID: string }`.
 */
export const DOCUMENT_LOCK_RENEW_REQUEST_EVENT = "eip-document-lock-renew-request";

/**
 * Private HTTP 409 body `{ error, collection, rejected }` when another session holds the lock.
 * Matches Go `documentlock.ErrCodeLockHeldElsewhere`.
 */
export const DOCUMENT_LOCK_API_ERROR_LOCK_HELD_ELSEWHERE = "lock_held_elsewhere";

/**
 * `Error.code` after a structured 409 is parsed and Zustand scopes are patched
 * (`applyPrivateHeaders` batched path). Compare with `err?.code === …`.
 */
export const DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE =
  "LOCK_HELD_ELSEWHERE";

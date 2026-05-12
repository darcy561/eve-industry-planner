/**
 * Frontend timing constants for the document-lock subsystem. Centralised so
 * reviewers can cross-reference them against the backend lease/TTL values in
 * `services/api/v1endpoints/documentlocks/lock_redis.go`
 * (`DefaultLockTTL`, `WaitlistPulseTTL`, `ViewerPresenceTTL`,
 * `ProbeAckWaitSeconds`).
 */

/**
 * Server lease default. The client extends well before this fires so the
 * holder doesn't accidentally lose the lock during a tab pause.
 *
 * Keep equal to `DefaultLockTTL` (lock_redis.go).
 */
export const LOCK_LEASE_MS = 5 * 60 * 1000;

/**
 * Holder extension interval. Triggered while the tab is visible and we are
 * the lock holder. Comfortably less than `LOCK_LEASE_MS` so a single missed
 * extend (background tab, transient network blip) doesn't expire the lease.
 */
export const LOCK_EXTEND_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Heartbeat status sync for any locked scope (holder or viewer). Self-heals
 * scopes that missed a WebSocket event (e.g. tab was just unbackgrounded).
 */
export const LOCK_STATUS_SYNC_INTERVAL_MS = 45 * 1000;

/**
 * Cadence for the post-expiry resync. When the cached `lockExpiresAtUnix` is
 * already past, fetch the canonical lock state at this rate until it changes.
 */
export const LOCK_EXPIRY_RESYNC_INTERVAL_MS = 15 * 1000;

/**
 * Seconds of slack added to `lockExpiresAtUnix` before considering the cached
 * expiry "definitely past". Absorbs minor clock skew between server and client.
 */
export const LOCK_EXPIRY_SLACK_SECONDS = 2;

/**
 * Pulse interval while sitting in the waitlist. Must stay below backend
 * `WaitlistPulseTTL` (currently 2 minutes) so the server keeps us alive in
 * the queue without garbage-collecting our entry.
 */
export const LOCK_WAITLIST_PULSE_INTERVAL_MS = 35 * 1000;

/**
 * Grace period the UI keeps a scope in `readOnly: true` after the server tells
 * us the lock vanished. Long enough that a follow-up `acquired` /
 * `handoff_completed` lands first (former-holder reacquire, waitlist
 * promotion, viewer self-heal) and confirms the new holder; short enough that
 * the user doesn't feel stuck on a dead lock.
 */
export const LOCK_READONLY_GRACE_MS = 5000;

/**
 * Coalesce rapid job/group list churn (Zustand updates from realtime fan-out)
 * into a single planner lock sync batch.
 */
export const LOCK_SCOPE_SYNC_DEBOUNCE_MS = 200;

/**
 * Planner-page batch chunk size. Stays below backend `MaxStatusBatchDocs`
 * (currently 500), with extra slack so groups + jobs can share a chunk.
 */
export const PLANNER_PAGE_JOB_CHUNK_MAX = 450;

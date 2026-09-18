/**
 * Whether the application can currently use a character's ESI credentials.
 *
 * Kept beside the provider rather than in Zustand, for the same reason the tokens themselves are:
 * a refresh outcome is written on every acquisition, and a store write would re-render every
 * subscriber of `account.characters`. This is read by the surfaces that display it.
 */

/**
 * @enum {string}
 */
export const CREDENTIAL_HEALTH = Object.freeze({
  /** Nothing has been asked of this character's credentials yet. */
  UNKNOWN: "unknown",
  /** The last acquisition returned a token. */
  OK: "ok",
  /** The last acquisition failed for a reason that may pass — a network fault, a server refusal. */
  DEGRADED: "degraded",
  /** The refresh material is spent: only signing in as the character again restores it. */
  REAUTH_REQUIRED: "reauth-required",
});

const UNKNOWN_RECORD = Object.freeze({
  state: CREDENTIAL_HEALTH.UNKNOWN,
  at: 0,
});

/** @type {Map<string, {state: string, at: number}>} */
const records = new Map();
const listeners = new Set();

function publish() {
  for (const listener of listeners) listener();
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeToCredentialHealth(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {string} characterHash
 * @returns {{state: string, at: number}}
 */
export function credentialHealth(characterHash) {
  return records.get(characterHash) ?? UNKNOWN_RECORD;
}

/**
 * Records what an acquisition attempt found.
 *
 * An outcome matching the one already held is dropped rather than re-stamped: the record is read
 * through `useSyncExternalStore`, which compares snapshots by identity, so a new object for an
 * unchanged state re-renders every row on the roster on each background refresh.
 *
 * @param {string} characterHash
 * @param {string} state - one of {@link CREDENTIAL_HEALTH}
 * @param {number} [at] - unix milliseconds
 */
export function recordCredentialHealth(characterHash, state, at = Date.now()) {
  if (!characterHash) return;
  if (records.get(characterHash)?.state === state) return;

  records.set(characterHash, Object.freeze({ state, at }));
  publish();
}

/** @param {string} characterHash */
export function forgetCredentialHealth(characterHash) {
  if (!records.delete(characterHash)) return;
  publish();
}

/** Drops every record — for a session ending, and for tests. */
export function resetCredentialHealth() {
  if (records.size === 0) return;
  records.clear();
  publish();
}

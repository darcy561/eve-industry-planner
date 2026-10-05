import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import useUsersStore from "../../Zustand/usersStore.js";

const PARTICIPANT_DOMAIN = "eip-lock-participant\u0000";

/**
 * How a document lock names a session on the wire: a one-way digest, so another member's tab never
 * sees the session id it would sign in with.
 *
 * @param {string | null | undefined} sessionID
 * @returns {string} Empty for no session
 */
export function lockParticipantID(sessionID) {
  if (!sessionID) return "";
  return bytesToHex(
    sha256(utf8ToBytes(PARTICIPANT_DOMAIN + sessionID)).slice(0, 16),
  );
}

/**
 * This tab's own participant id, for telling its own lock events from another member's.
 *
 * @returns {string}
 */
export function myLockParticipantID() {
  return lockParticipantID(useUsersStore.getState()?.account?.sessionID);
}

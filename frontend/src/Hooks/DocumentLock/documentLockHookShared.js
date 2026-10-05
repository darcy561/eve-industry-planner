import { myLockParticipantID } from "../../Functions/DocumentLock/lockParticipant.js";

export function mergeHandoffFieldsFromExtendPayload(data) {
  const partial = {};
  const me = myLockParticipantID();
  if (typeof data.extendCount === "number")
    partial.extendSegmentCount = data.extendCount;
  if (typeof data.waitlistLen === "number")
    partial.waitlistLen = data.waitlistLen;
  const offered =
    typeof data.probeTargetParticipantID === "string"
      ? data.probeTargetParticipantID
      : null;
  if (offered != null) partial.pendingHandoffOfferParticipantID = offered;
  if (typeof data.probeExpiresAtUnix === "number")
    partial.pendingHandoffExpiresAtUnix = data.probeExpiresAtUnix;
  if (data.handoffPending === true) partial.handoffPendingHolder = true;
  if (data.handoffPending === false) {
    partial.handoffPendingHolder = false;
    partial.pendingHandoffOfferParticipantID = null;
    partial.pendingHandoffExpiresAtUnix = null;
    partial.handoffOfferForMe = false;
  }
  if (data.cycleReset === true) {
    partial.handoffPendingHolder = false;
    partial.pendingHandoffOfferParticipantID = null;
    partial.pendingHandoffExpiresAtUnix = null;
    partial.handoffOfferForMe = false;
  }
  if (me && typeof offered === "string" && offered.length > 0) {
    partial.handoffOfferForMe = offered === me;
  }
  return partial;
}

export function clearedHandoffState() {
  return {
    extendSegmentCount: null,
    waitlistLen: null,
    handoffPendingHolder: false,
    pendingHandoffOfferParticipantID: null,
    pendingHandoffExpiresAtUnix: null,
    handoffOfferForMe: false,
    waitingInHandoffQueue: false,
  };
}

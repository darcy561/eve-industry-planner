import useUsersStore from "../../Zustand/usersStore.js";

export function mergeHandoffFieldsFromExtendPayload(data) {
  const partial = {};
  const mySessionID = useUsersStore.getState()?.account?.sessionID;
  if (typeof data.extendCount === "number") partial.extendSegmentCount = data.extendCount;
  if (typeof data.waitlistLen === "number") partial.waitlistLen = data.waitlistLen;
  const offered =
    typeof data.probeTargetSessionID === "string"
      ? data.probeTargetSessionID
      : typeof data.offeredSessionID === "string"
        ? data.offeredSessionID
        : typeof data.pendingHandoffTargetSessionID === "string"
          ? data.pendingHandoffTargetSessionID
          : null;
  if (offered != null) partial.pendingHandoffOfferClientID = offered;
  if (typeof data.probeExpiresAtUnix === "number")
    partial.pendingHandoffExpiresAtUnix = data.probeExpiresAtUnix;
  else if (typeof data.pendingHandoffExpiresAtUnix === "number")
    partial.pendingHandoffExpiresAtUnix = data.pendingHandoffExpiresAtUnix;
  if (data.handoffPending === true) partial.handoffPendingHolder = true;
  if (data.handoffPending === false) {
    partial.handoffPendingHolder = false;
    partial.pendingHandoffOfferClientID = null;
    partial.pendingHandoffExpiresAtUnix = null;
    partial.handoffOfferForMe = false;
  }
  if (data.cycleReset === true) {
    partial.handoffPendingHolder = false;
    partial.pendingHandoffOfferClientID = null;
    partial.pendingHandoffExpiresAtUnix = null;
    partial.handoffOfferForMe = false;
  }
  if (mySessionID && typeof offered === "string" && offered.length > 0) {
    partial.handoffOfferForMe = offered === mySessionID;
  }
  return partial;
}

export function clearedHandoffState() {
  return {
    extendSegmentCount: null,
    waitlistLen: null,
    handoffPendingHolder: false,
    pendingHandoffOfferClientID: null,
    pendingHandoffExpiresAtUnix: null,
    handoffOfferForMe: false,
    waitingInHandoffQueue: false,
  };
}

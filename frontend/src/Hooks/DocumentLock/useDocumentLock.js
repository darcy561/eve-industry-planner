import { useCallback, useEffect, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  acquireDocumentLock,
  extendDocumentLock,
  getDocumentLockStatus,
  releaseDocumentLock,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import {
  showDocumentLockAccessRequestSnackbar,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents.js";
import { shouldSuppressDocumentLockVacancyNotice } from "../../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";

const DEFAULT_PENDING_ACCESS_SNACKBAR =
  "Another tab requested edit access for this document.";
const EXTEND_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 45 * 1000;
const EXPIRY_RESYNC_MS = 15 * 1000;

function mergeHandoffFieldsFromExtendPayload(data) {
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

function clearedHandoffState() {
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

export function useDocumentLock(collection, docID, enabled, options = {}) {
  const pendingAccessRequestMessage =
    options.pendingAccessRequestMessage ?? DEFAULT_PENDING_ACCESS_SNACKBAR;
  const lockHeld = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).lockHeld
  );
  const readOnly = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).readOnly
  );
  const waitingInHandoffQueue = useUsersStore((s) =>
    selectScopedDocumentLock(s, collection, docID).waitingInHandoffQueue
  );
  const sessionID = useUsersStore((s) => s.account.sessionID);

  const heldRef = useRef(false);
  const keyRef = useRef({ collection: "", docID: "" });
  const prevHolderUiRef = useRef({
    scopeKey: "",
    readOnly: false,
    lockHeld: false,
    waitingInHandoffQueue: false,
  });

  useEffect(() => {
    if (enabled && collection && docID) {
      keyRef.current = { collection, docID };
    } else if (!enabled || !docID) {
      keyRef.current = { collection: "", docID: "" };
    }
  }, [enabled, collection, docID]);

  const patch = useCallback(
    (partial) => {
      if (!collection || !docID) return;
      useUsersStore
        .getState()
        .documentLock.actions.patchDocumentLockForScope(
          collection,
          docID,
          partial
        );
    },
    [collection, docID]
  );

  const resetScope = useCallback(() => {
    if (!collection || !docID) return;
    useUsersStore
      .getState()
      .documentLock.actions.resetDocumentLockForScope(collection, docID);
  }, [collection, docID]);

  useEffect(() => {
    heldRef.current = lockHeld;
  }, [lockHeld]);

  const release = useCallback(async () => {
    const { collection: c, docID: d } = keyRef.current;
    if (!c || !d || !heldRef.current) return;
    heldRef.current = false;
    patch({
      lockHeld: false,
      lockExpiresAtUnix: null,
      lockTtlSeconds: null,
    });
    try {
      await releaseDocumentLock(c, d);
    } catch {
      /* ignore */
    }
  }, [patch]);

  const tryAcquire = useCallback(async () => {
    if (!enabled || !collection || !docID) return;

    keyRef.current = { collection, docID };
    try {
      const res = await acquireDocumentLock(collection, docID);
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        heldRef.current = true;
        patch({
          lockHeld: true,
          readOnly: false,
          lockExpiresAtUnix:
            typeof data.expiresAtUnix === "number" ? data.expiresAtUnix : null,
          lockTtlSeconds:
            typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
          ...clearedHandoffState(),
          extendSegmentCount: 0,
        });
        return;
      }
      if (
        (res.status === 200 &&
          data.held === true &&
          data.acquired !== true) ||
        res.status === 409
      ) {
        heldRef.current = false;
        patch({
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix:
            typeof data.expiresAtUnix === "number" ? data.expiresAtUnix : null,
          lockTtlSeconds:
            typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
        });
        return;
      }
      patch({
        readOnly: false,
        lockExpiresAtUnix: null,
        lockTtlSeconds: null,
      });
    } catch {
      patch({
        readOnly: false,
        lockExpiresAtUnix: null,
        lockTtlSeconds: null,
      });
    }
  }, [collection, docID, enabled, patch]);

  const syncLockFromServer = useCallback(
    async (opts = {}) => {
      if (!enabled || !collection || !docID) return;

      const mySessionID = useUsersStore.getState()?.account?.sessionID;
      try {
        const res = await getDocumentLockStatus(collection, docID);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));

        if (!data.held) {
          const prev = selectScopedDocumentLock(
            useUsersStore.getState(),
            collection,
            docID
          );
          const shouldTryReacquire =
            opts.onlyFormerLeaseHolder === true
              ? prev.lockHeld
              : prev.lockHeld || prev.readOnly;
          patch({
            lockHeld: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
          });
          heldRef.current = false;
          if (shouldTryReacquire) {
            void tryAcquire();
          }
          return;
        }

        const holder = data.holderSessionID;
        const pendingTarget =
          typeof data.probeTargetSessionID === "string"
            ? data.probeTargetSessionID
            : typeof data.pendingHandoffTargetSessionID === "string"
              ? data.pendingHandoffTargetSessionID
              : null;
        if (mySessionID && holder === mySessionID) {
          heldRef.current = true;
          patch({
            lockHeld: true,
            readOnly: false,
            waitingInHandoffQueue: false,
            lockExpiresAtUnix:
              typeof data.expiresAtUnix === "number" ? data.expiresAtUnix : null,
            lockTtlSeconds:
              typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
            extendSegmentCount:
              typeof data.extendCount === "number" ? data.extendCount : null,
            waitlistLen:
              typeof data.waitlistLen === "number" ? data.waitlistLen : null,
            handoffPendingHolder: pendingTarget != null && pendingTarget !== "",
            pendingHandoffOfferClientID: pendingTarget,
            pendingHandoffExpiresAtUnix:
              typeof data.probeExpiresAtUnix === "number"
                ? data.probeExpiresAtUnix
                : typeof data.pendingHandoffExpiresAtUnix === "number"
                  ? data.pendingHandoffExpiresAtUnix
                  : null,
            handoffOfferForMe: false,
          });
          return;
        }

        heldRef.current = false;
        patch({
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix:
            typeof data.expiresAtUnix === "number" ? data.expiresAtUnix : null,
          lockTtlSeconds:
            typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
          extendSegmentCount:
            typeof data.extendCount === "number" ? data.extendCount : null,
          waitlistLen:
            typeof data.waitlistLen === "number" ? data.waitlistLen : null,
          handoffPendingHolder: false,
          pendingHandoffOfferClientID: pendingTarget,
          pendingHandoffExpiresAtUnix:
            typeof data.probeExpiresAtUnix === "number"
              ? data.probeExpiresAtUnix
              : typeof data.pendingHandoffExpiresAtUnix === "number"
                ? data.pendingHandoffExpiresAtUnix
                : null,
          handoffOfferForMe: false,
        });
      } catch {
        /* ignore */
      }
    },
    [collection, docID, enabled, patch, tryAcquire]
  );

  const applyExtendResponse = useCallback(
    async (res, data) => {
      if (!res.ok && res.status !== 409) return;
      if (data.holding === false) {
        heldRef.current = false;
        patch({
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          ...clearedHandoffState(),
        });
        return;
      }
      if (res.status === 409 && typeof data.holding !== "boolean") {
        await syncLockFromServer();
        return;
      }
      if (data.holding === true || (res.ok && typeof data.expiresAtUnix === "number")) {
        patch({
          lockExpiresAtUnix:
            typeof data.expiresAtUnix === "number"
              ? data.expiresAtUnix
              : null,
          lockTtlSeconds:
            typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
          ...mergeHandoffFieldsFromExtendPayload(data),
        });
      }
    },
    [patch, syncLockFromServer]
  );

  const flushExtendLease = useCallback(() => {
    const { collection: c, docID: d } = keyRef.current;
    if (!c || !d) return;
    void extendDocumentLock(c, d).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      await applyExtendResponse(res, data);
    });
  }, [applyExtendResponse]);

  useEffect(() => {
    if (!enabled || !waitingInHandoffQueue) return undefined;
    const pulse = () => {
      if (!collection || !docID) return;
      void useUsersStore
        .getState()
        .documentLock.actions.pulseWaitlist(collection, docID);
    };
    pulse();
    const id = window.setInterval(pulse, 35000);
    return () => clearInterval(id);
  }, [enabled, waitingInHandoffQueue, collection, docID]);

  useEffect(() => {
    if (!enabled || !docID) {
      resetScope();
      heldRef.current = false;
      keyRef.current = { collection: "", docID: "" };
      return;
    }

    let cancelled = false;
    void (async () => {
      if (!cancelled) await tryAcquire();
    })();

    return () => {
      cancelled = true;
      void release();
      resetScope();
      heldRef.current = false;
      keyRef.current = { collection: "", docID: "" };
    };
  }, [enabled, docID, collection, tryAcquire, release, resetScope]);

  useEffect(() => {
    if (!enabled || !lockHeld || readOnly) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      flushExtendLease();
    }, EXTEND_MS);
    return () => clearInterval(id);
  }, [enabled, lockHeld, readOnly, flushExtendLease]);

  useEffect(() => {
    if (!enabled || !docID) return;
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      void syncLockFromServer();
      const scoped = selectScopedDocumentLock(
        useUsersStore.getState(),
        collection,
        docID
      );
      if (scoped.lockHeld && !scoped.readOnly) {
        flushExtendLease();
      }
    }
    function onOnline() {
      void syncLockFromServer();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, docID, collection, syncLockFromServer, flushExtendLease]);

  useEffect(() => {
    if (!enabled || !docID) return;
    const id = window.setInterval(() => {
      void syncLockFromServer();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, docID, syncLockFromServer]);

  useEffect(() => {
    if (!enabled || !docID) return;
    const id = window.setInterval(() => {
      const exp = selectScopedDocumentLock(
        useUsersStore.getState(),
        collection,
        docID
      ).lockExpiresAtUnix;
      if (exp == null || typeof exp !== "number") return;
      const now = Math.floor(Date.now() / 1000);
      if (now <= exp + 2) return;
      void syncLockFromServer();
    }, EXPIRY_RESYNC_MS);
    return () => clearInterval(id);
  }, [enabled, docID, syncLockFromServer, collection]);

  useEffect(() => {
    if (!enabled || !collection || !docID) {
      prevHolderUiRef.current = {
        scopeKey: "",
        readOnly: false,
        lockHeld: false,
        waitingInHandoffQueue: false,
      };
      return;
    }

    const scopeKey = docLockScopeKey(collection, docID);
    const prev = prevHolderUiRef.current;

    if (prev.scopeKey !== scopeKey) {
      prevHolderUiRef.current = {
        scopeKey,
        readOnly,
        lockHeld,
        waitingInHandoffQueue,
      };
      return;
    }

    const becameHolder =
      lockHeld &&
      !readOnly &&
      prev.readOnly &&
      !prev.lockHeld;

    if (
      becameHolder &&
      !shouldSuppressDocumentLockVacancyNotice()
    ) {
      if (prev.waitingInHandoffQueue) {
        showSnackbarSuccess("Your edit access request was fulfilled.", 4);
      } else {
        showSnackbarSuccess(
          "Another editing session ended — you now have edit access.",
          4
        );
      }
    }

    prevHolderUiRef.current = {
      scopeKey,
      readOnly,
      lockHeld,
      waitingInHandoffQueue,
    };
  }, [
    enabled,
    collection,
    docID,
    lockHeld,
    readOnly,
    waitingInHandoffQueue,
  ]);

  useEffect(() => {
    function onLockEvent(ev) {
      const payload = ev?.detail;
      if (!payload || typeof payload !== "object") return;
      if (payload.collection !== collection || payload.docID !== docID) return;

      const t = payload.type;
      if (t === "document_lock_requested") {
        const mySessionID = useUsersStore.getState()?.account?.sessionID;
        if (
          heldRef.current &&
          payload.requesterSessionID &&
          payload.requesterSessionID !== mySessionID
        ) {
          patch({ pendingAccessRequest: true });
          showDocumentLockAccessRequestSnackbar(pendingAccessRequestMessage, {
            collection,
            docID,
          });
        }
        return;
      }

      if (t === "document_lock_expired") {
        void syncLockFromServer({ onlyFormerLeaseHolder: true });
        return;
      }
      if (t === "document_lock_handoff_probe") {
        const mySessionID = useUsersStore.getState()?.account?.sessionID;
        const target =
          typeof payload.probeTargetSessionID === "string"
            ? payload.probeTargetSessionID
            : payload.offeredSessionID;
        if (target && mySessionID && target === mySessionID) {
          void useUsersStore
            .getState()
            .documentLock.actions.claimHandoffProbe(collection, docID);
        }
        return;
      }
      if (t === "document_lock_handoff_completed") {
        void syncLockFromServer();
        return;
      }
      if (
        t === "document_lock_released" ||
        t === "document_lock_acquired"
      ) {
        void syncLockFromServer();
      }
    }
    window.addEventListener("eip-document-lock", onLockEvent);
    return () => window.removeEventListener("eip-document-lock", onLockEvent);
  }, [
    collection,
    docID,
    syncLockFromServer,
    patch,
    pendingAccessRequestMessage,
    sessionID,
  ]);
}

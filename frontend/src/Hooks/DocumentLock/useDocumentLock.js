import { useCallback, useEffect, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  acquireDocumentLock,
  extendDocumentLock,
  getDocumentLockStatus,
  postDocumentLockViewerArrived,
  postDocumentLockViewerDeparted,
  releaseDocumentLock,
  sendDocumentLockViewerDepartedBeacon,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import {
  showDocumentLockAccessRequestSnackbar,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents.js";
import { shouldSuppressDocumentLockVacancyNotice } from "../../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { selectScopedDocumentLock } from "../../Functions/DocumentLock/documentLockSelectors.js";
import { docLockScopeKey } from "../../Functions/DocumentLock/documentLockScope.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_EVENTS,
  DOCUMENT_LOCK_RELEASE_REASONS,
} from "../../Functions/DocumentLock/documentLockEvents.js";
import {
  LOCK_EXPIRY_RESYNC_INTERVAL_MS,
  LOCK_EXPIRY_SLACK_SECONDS,
  LOCK_EXTEND_INTERVAL_MS,
  LOCK_READONLY_GRACE_MS,
  LOCK_STATUS_SYNC_INTERVAL_MS,
  LOCK_WAITLIST_PULSE_INTERVAL_MS,
} from "../../Functions/DocumentLock/documentLockTimings.js";
import { endReadOnlyGraceIfApplicable } from "../../Functions/DocumentLock/readOnlyGrace.js";
import {
  buildGrantedHolderPatch,
  numberOrNull,
} from "../../Functions/DocumentLock/documentLockStatusFields.js";

const DEFAULT_PENDING_ACCESS_SNACKBAR =
  "Another tab requested edit access for this document.";

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
  const readOnlyGraceRef = useRef(null);
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

  const cancelReadOnlyGrace = useCallback(() => {
    if (readOnlyGraceRef.current != null) {
      window.clearTimeout(readOnlyGraceRef.current);
      readOnlyGraceRef.current = null;
    }
  }, []);

  const startReadOnlyGrace = useCallback(() => {
    cancelReadOnlyGrace();
    readOnlyGraceRef.current = window.setTimeout(() => {
      readOnlyGraceRef.current = null;
      /**
       * Predicate + patch live in {@link endReadOnlyGraceIfApplicable} so this
       * hook and the planner-only path in `applyDocumentLockStatusFromPayload`
       * can't drift. We just own the timer storage (per-hook ref) here.
       */
      endReadOnlyGraceIfApplicable(collection, docID);
    }, LOCK_READONLY_GRACE_MS);
  }, [cancelReadOnlyGrace, collection, docID]);

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
        patch(buildGrantedHolderPatch(data, { withClearedHandoff: true }));
        return;
      }
      if (
        (res.status === 200 &&
          data.held === true &&
          data.acquired !== true) ||
        res.status === 409
      ) {
        heldRef.current = false;
        const readOnlyPatch = {
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
        };
        if (typeof data.viewerCount === "number") {
          readOnlyPatch.viewerCount = data.viewerCount;
        }
        patch(readOnlyPatch);
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
    async () => {
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
          /**
           * Lock is gone. Three cases:
           *  - We were the holder: drop our state and auto-reacquire (slow extend
           *    / focus race / network blip). If a waitlist head was waiting the
           *    server-side expiry promotion already installed them, so our
           *    `tryAcquire` here will just 200 with held:true → readOnly:true.
           *  - We were a viewer: keep `readOnly: true` and start the grace
           *    timer. A TTL expiry is typically followed within ~ms by either a
           *    `handoff_completed` (waitlist promotion) or `acquired` (former
           *    holder reacquire); cancelling the grace as soon as one of those
           *    lands keeps the lock icon visible without a flash of editable UI.
           *    If nothing arrives within the grace window the timer drops
           *    `readOnly` so the user isn't permanently stuck on a dead lock.
           *  - We were neutral: nothing to do beyond clearing stale fields.
           */
          // `viewerCount` is authoritative from the server even when the lock
          // is gone (zombie viewer entries are pruned by the server on read),
          // so threading it through all three cases keeps the count fresh.
          const viewerCountPatch =
            typeof data.viewerCount === "number"
              ? { viewerCount: data.viewerCount }
              : {};
          if (prev.lockHeld) {
            patch({
              lockHeld: false,
              readOnly: false,
              pendingAccessRequest: false,
              lockExpiresAtUnix: null,
              lockTtlSeconds: null,
              ...clearedHandoffState(),
              ...viewerCountPatch,
            });
            heldRef.current = false;
            void tryAcquire();
            return;
          }
          if (prev.readOnly) {
            patch({
              lockHeld: false,
              pendingAccessRequest: false,
              lockExpiresAtUnix: null,
              lockTtlSeconds: null,
              ...clearedHandoffState(),
              ...viewerCountPatch,
            });
            heldRef.current = false;
            startReadOnlyGrace();
            return;
          }
          patch({
            lockHeld: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
            ...viewerCountPatch,
          });
          heldRef.current = false;
          return;
        }

        const holder = data.holderSessionID;
        const pendingTarget =
          typeof data.probeTargetSessionID === "string"
            ? data.probeTargetSessionID
            : typeof data.pendingHandoffTargetSessionID === "string"
              ? data.pendingHandoffTargetSessionID
              : null;
        const pendingExpires =
          numberOrNull(data, "probeExpiresAtUnix") ??
          numberOrNull(data, "pendingHandoffExpiresAtUnix");
        if (mySessionID && holder === mySessionID) {
          heldRef.current = true;
          const holderPatch = {
            lockHeld: true,
            readOnly: false,
            waitingInHandoffQueue: false,
            lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
            lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
            extendSegmentCount: numberOrNull(data, "extendCount"),
            waitlistLen: numberOrNull(data, "waitlistLen"),
            handoffPendingHolder: pendingTarget != null && pendingTarget !== "",
            pendingHandoffOfferClientID: pendingTarget,
            pendingHandoffExpiresAtUnix: pendingExpires,
            handoffOfferForMe: false,
          };
          if (typeof data.viewerCount === "number") {
            holderPatch.viewerCount = data.viewerCount;
          }
          patch(holderPatch);
          return;
        }

        heldRef.current = false;
        const viewerPatch = {
          readOnly: true,
          lockHeld: false,
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
          extendSegmentCount: numberOrNull(data, "extendCount"),
          waitlistLen: numberOrNull(data, "waitlistLen"),
          handoffPendingHolder: false,
          pendingHandoffOfferClientID: pendingTarget,
          pendingHandoffExpiresAtUnix: pendingExpires,
          handoffOfferForMe: false,
        };
        if (typeof data.viewerCount === "number") {
          viewerPatch.viewerCount = data.viewerCount;
        }
        patch(viewerPatch);
      } catch {
        /* ignore */
      }
    },
    [collection, docID, enabled, patch, startReadOnlyGrace, tryAcquire]
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
          lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
          lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
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
    const id = window.setInterval(pulse, LOCK_WAITLIST_PULSE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, waitingInHandoffQueue, collection, docID]);

  useEffect(() => {
    if (!enabled || !docID) {
      cancelReadOnlyGrace();
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
      cancelReadOnlyGrace();
      void release();
      resetScope();
      heldRef.current = false;
      keyRef.current = { collection: "", docID: "" };
    };
  }, [
    enabled,
    docID,
    collection,
    tryAcquire,
    release,
    resetScope,
    cancelReadOnlyGrace,
  ]);

  useEffect(() => {
    if (!enabled || !lockHeld || readOnly) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      flushExtendLease();
    }, LOCK_EXTEND_INTERVAL_MS);
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
    }, LOCK_STATUS_SYNC_INTERVAL_MS);
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
      if (now <= exp + LOCK_EXPIRY_SLACK_SECONDS) return;
      void syncLockFromServer();
    }, LOCK_EXPIRY_RESYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, docID, syncLockFromServer, collection]);

  /**
   * Passive-viewer presence. When this scope enters `readOnly: true` we announce
   * our presence to the server — the holder receives `document_lock_viewer_joined`
   * and surfaces their contention affordance. Effect cleanup runs whenever we
   * exit readOnly (became holder / lock released / doc change / unmount) and
   * sends `viewer-departed` so the holder's icon clears promptly. `pagehide`
   * adds a `sendBeacon` fallback for tab close where React cleanup wouldn't get
   * a chance to issue a normal fetch. The server idempotently ZADD/ZREMs, so
   * occasional duplicates (transient readOnly oscillations during a handoff)
   * are harmless.
   */
  useEffect(() => {
    if (!enabled || !collection || !docID || !readOnly) return undefined;
    void postDocumentLockViewerArrived(collection, docID).catch(() => {});
    function onPageHide() {
      sendDocumentLockViewerDepartedBeacon(collection, docID);
    }
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      void postDocumentLockViewerDeparted(collection, docID).catch(() => {});
    };
  }, [enabled, collection, docID, readOnly]);

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
      if (t === DOCUMENT_LOCK_EVENTS.REQUESTED) {
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

      if (t === DOCUMENT_LOCK_EVENTS.EXPIRED) {
        // Grace timer (if started by the resync) is the right state to leave
        // in place — it'll auto-cancel below when an acquired/handoff event
        // confirms the new holder.
        void syncLockFromServer();
        return;
      }
      if (t === DOCUMENT_LOCK_EVENTS.HANDOFF_PROBE) {
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
      if (t === DOCUMENT_LOCK_EVENTS.HANDOFF_COMPLETED) {
        // Definitive new holder — kill any pending readOnly grace; the sync
        // below will install the new holder's expiry on viewer scopes.
        cancelReadOnlyGrace();
        void syncLockFromServer();
        return;
      }
      if (t === DOCUMENT_LOCK_EVENTS.RELEASED) {
        cancelReadOnlyGrace();
        /**
         * Server-side group handoff cascade evicted our per-job lock so the new group
         * holder's cards reflect immediately. Patch directly instead of resyncing —
         * `syncLockFromServer` would see `held: false` and trigger its auto-reacquire
         * path on the former holder, grabbing the lock back and defeating the cascade.
         */
        if (payload.reason === DOCUMENT_LOCK_RELEASE_REASONS.GROUP_HANDOFF_CASCADE) {
          patch({
            lockHeld: false,
            readOnly: false,
            pendingAccessRequest: false,
            lockExpiresAtUnix: null,
            lockTtlSeconds: null,
            ...clearedHandoffState(),
          });
          heldRef.current = false;
          return;
        }
        /**
         * Voluntary release — the previous holder explicitly let go (closed
         * the page, handed over, etc). Drop readOnly immediately instead of
         * going through syncLockFromServer (which would preserve readOnly +
         * start the grace timer, applying TTL-expiry semantics that don't fit
         * here). Anyone can edit.
         */
        patch({
          lockHeld: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          ...clearedHandoffState(),
        });
        heldRef.current = false;
        return;
      }
      if (t === DOCUMENT_LOCK_EVENTS.ACQUIRED) {
        // Confirmed new holder (could be us, could be the former holder
        // reacquiring after a TTL blip). Cancel any pending grace; sync will
        // install lockHeld:true or readOnly:true with a real expiry.
        cancelReadOnlyGrace();
        void syncLockFromServer();
        return;
      }
      if (
        t === DOCUMENT_LOCK_EVENTS.VIEWER_JOINED ||
        t === DOCUMENT_LOCK_EVENTS.VIEWER_LEFT
      ) {
        const mySessionID = useUsersStore.getState()?.account?.sessionID;
        // Our own join/leave already drove the local state via the
        // readOnly-transition effect — ignore the echo so we don't double-count.
        if (payload.sessionID && payload.sessionID === mySessionID) return;
        const cur = selectScopedDocumentLock(
          useUsersStore.getState(),
          collection,
          docID
        );
        const prev = typeof cur.viewerCount === "number" ? cur.viewerCount : 0;
        const next =
          t === DOCUMENT_LOCK_EVENTS.VIEWER_JOINED
            ? prev + 1
            : Math.max(0, prev - 1);
        patch({ viewerCount: next });
      }
    }
    window.addEventListener(DOCUMENT_LOCK_CUSTOM_EVENT, onLockEvent);
    return () =>
      window.removeEventListener(DOCUMENT_LOCK_CUSTOM_EVENT, onLockEvent);
  }, [
    collection,
    docID,
    syncLockFromServer,
    patch,
    cancelReadOnlyGrace,
    pendingAccessRequestMessage,
    sessionID,
  ]);
}

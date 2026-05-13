import { useCallback, useEffect } from "react";
import { extendDocumentLock } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { numberOrNull } from "../../Functions/DocumentLock/documentLockStatusFields.js";
import { LOCK_EXTEND_INTERVAL_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import {
  clearedHandoffState,
  mergeHandoffFieldsFromExtendPayload,
} from "./documentLockHookShared.js";
import { DOCUMENT_LOCK_HELD_ACTIONS } from "./documentLockHeldReducer.js";

/**
 * Holder `/extend` interval while visible + response handling (probe / 409 → sync).
 */
export function useLockExtendLoop({
  enabled,
  lockHeld,
  readOnly,
  patch,
  dispatchHeld,
  keyRef,
  syncLockFromServer,
}) {
  const applyExtendResponse = useCallback(
    async (res, data) => {
      if (!res.ok && res.status !== 409) return;
      if (data.holding === false) {
        dispatchHeld({ type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false });
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
    [patch, syncLockFromServer, dispatchHeld]
  );

  const flushExtendLease = useCallback(() => {
    const { collection: c, docID: d } = keyRef.current;
    if (!c || !d) return;
    void extendDocumentLock(c, d).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      await applyExtendResponse(res, data);
    });
  }, [applyExtendResponse, keyRef]);

  useEffect(() => {
    if (!enabled || !lockHeld || readOnly) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      flushExtendLease();
    }, LOCK_EXTEND_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, lockHeld, readOnly, flushExtendLease]);

  return { flushExtendLease };
}

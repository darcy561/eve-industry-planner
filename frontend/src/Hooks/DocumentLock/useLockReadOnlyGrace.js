import { useCallback } from "react";
import { LOCK_READONLY_GRACE_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import { endReadOnlyGraceIfApplicable } from "../../Functions/DocumentLock/readOnlyGrace.js";

/**
 * Per-scope read-only grace timer storage. Sync + WS paths cancel/start;
 * {@link endReadOnlyGraceIfApplicable} owns the predicate/patch.
 */
export function useLockReadOnlyGrace(readOnlyGraceRef, collection, docID) {
  const cancelReadOnlyGrace = useCallback(() => {
    if (readOnlyGraceRef.current != null) {
      window.clearTimeout(readOnlyGraceRef.current);
      readOnlyGraceRef.current = null;
    }
  }, [readOnlyGraceRef]);

  const startReadOnlyGrace = useCallback(() => {
    cancelReadOnlyGrace();
    readOnlyGraceRef.current = window.setTimeout(() => {
      readOnlyGraceRef.current = null;
      endReadOnlyGraceIfApplicable(collection, docID);
    }, LOCK_READONLY_GRACE_MS);
  }, [cancelReadOnlyGrace, collection, docID, readOnlyGraceRef]);

  return { cancelReadOnlyGrace, startReadOnlyGrace };
}

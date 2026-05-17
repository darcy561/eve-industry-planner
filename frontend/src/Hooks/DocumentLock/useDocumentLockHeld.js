import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  documentLockHeldReducer,
  DOCUMENT_LOCK_HELD_ACTIONS,
} from "./documentLockHeldReducer.js";

/**
 * Coupled “local holder” flag: reducer for auditability + `heldRef` updated
 * synchronously inside the functional `useReducer` updater so `/release` and
 * CustomEvent handlers always read the latest value.
 */
export function useDocumentLockHeld(lockHeld) {
  const heldRef = useRef(false);
  const [, reactDispatch] = useReducer(documentLockHeldReducer, {
    held: false,
  });

  const dispatchHeld = useCallback((action) => {
    reactDispatch((prev) => {
      const next = documentLockHeldReducer(prev, action);
      heldRef.current = next.held;
      return next;
    });
  }, []);

  useEffect(() => {
    dispatchHeld({
      type: DOCUMENT_LOCK_HELD_ACTIONS.SYNC_FROM_STORE,
      lockHeld,
    });
  }, [lockHeld, dispatchHeld]);

  return { heldRef, dispatchHeld };
}

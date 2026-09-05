import { useCallback } from "react";

/**
 * Compose dialogue close behaviour from optional reset callbacks.
 *
 * @param {Object} params
 * @param {Array<() => void>} [params.resetFns=[]]
 * @param {() => void} [params.onClose]
 * @returns {() => void}
 */
export function useDialogueCloseReset({ resetFns = [], onClose } = {}) {
  return useCallback(() => {
    resetFns.forEach((fn) => {
      if (typeof fn === "function") fn();
    });
    if (typeof onClose === "function") onClose();
  }, [resetFns, onClose]);
}

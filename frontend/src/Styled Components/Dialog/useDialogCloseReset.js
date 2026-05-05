import { useCallback } from "react";

/**
 * Compose dialog close behavior from optional reset callbacks.
 *
 * @param {Object} params
 * @param {Array<() => void>} [params.resetFns=[]]
 * @param {() => void} [params.onClose]
 * @returns {() => void}
 */
export function useDialogCloseReset({ resetFns = [], onClose } = {}) {
  return useCallback(() => {
    resetFns.forEach((fn) => {
      if (typeof fn === "function") fn();
    });
    if (typeof onClose === "function") onClose();
  }, [resetFns, onClose]);
}

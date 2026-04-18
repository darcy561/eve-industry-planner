import { useEffect, useRef } from "react";
import { useDialogEventState } from "./useDialogEventState";

/**
 * Subscribes via {@link useDialogEventState} and applies `applyPayload` when the
 * serialized snapshot changes, skipping the first snapshot (no spurious apply on mount).
 *
 * @template T
 * @param {string} eventName
 * @param {() => T} getInitialState
 * @param {(data: T) => string} serialize
 * @param {(data: T) => void} applyPayload
 * @param {{ enabled?: boolean }} [options] - When `enabled` is false, skips sync (ref unchanged), matching assets-dialog guard while logged out.
 * @returns {[T, import("react").Dispatch<import("react").SetStateAction<T>>, () => void]}
 */
export function useSyncedDialogEventState(
  eventName,
  getInitialState,
  serialize,
  applyPayload,
  options = {},
) {
  const { enabled = true } = options;
  const tuple = useDialogEventState(eventName, getInitialState);
  const messageData = tuple[0];
  const lastSerialized = useRef(null);

  const serializeRef = useRef(serialize);
  const applyPayloadRef = useRef(applyPayload);
  serializeRef.current = serialize;
  applyPayloadRef.current = applyPayload;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const serialized = serializeRef.current(messageData);
    if (lastSerialized.current === serialized) {
      return;
    }
    if (lastSerialized.current !== null) {
      applyPayloadRef.current(messageData);
    }
    lastSerialized.current = serialized;
  }, [enabled, messageData]);

  return tuple;
}

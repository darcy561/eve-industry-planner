import { useEffect, useRef } from "react";
import { useDialogueEventState } from "./useDialogueEventState";

/**
 * Subscribes via {@link useDialogueEventState} and applies `applyPayload` when the
 * serialised snapshot changes, skipping the first snapshot (no spurious apply on mount).
 *
 * @template T
 * @param {string} eventName
 * @param {() => T} getInitialState
 * @param {(data: T) => string} serialise
 * @param {(data: T) => void} applyPayload
 * @param {{ enabled?: boolean }} [options] - When `enabled` is false, skips sync (ref unchanged), matching assets-dialogue guard while logged out.
 * @returns {[T, import("react").Dispatch<import("react").SetStateAction<T>>, () => void]}
 */
export function useSyncedDialogueEventState(
  eventName,
  getInitialState,
  serialize,
  applyPayload,
  options = {},
) {
  const { enabled = true } = options;
  const tuple = useDialogueEventState(eventName, getInitialState);
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

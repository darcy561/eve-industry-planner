import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToEvent } from "../../utils/EventSystem";

/**
 * Subscribes to an app event and merges payloads into dialog state (skips `undefined` only;
 * explicit `null` is merged so callers can clear a field).
 * Use with {@link ContentDialog} for the same open/merge pattern as legacy market/history dialogs.
 *
 * @template T
 * @param {string} eventName - Event name passed to {@link subscribeToEvent}
 * @param {() => T} getInitialState - Factory for initial state (also used when {@link reset} runs)
 * @returns {[T, React.Dispatch<React.SetStateAction<T>>, () => void]} state, setState, reset
 */
export function useDialogEventState(eventName, getInitialState) {
  const initialRef = useRef(getInitialState());
  const [state, setState] = useState(() => initialRef.current);

  useEffect(() => {
    return subscribeToEvent(eventName, (data) => {
      setState((prev) => {
        const next = { ...prev };
        if (data && typeof data === "object") {
          Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
              next[key] = value;
            }
          });
        }
        return next;
      });
    });
  }, [eventName]);

  const reset = useCallback(() => {
    setState({ ...initialRef.current });
  }, []);

  return [state, setState, reset];
}

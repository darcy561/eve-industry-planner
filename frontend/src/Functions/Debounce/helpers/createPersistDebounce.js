import useUsersStore from "../../../Zustand/usersStore.js";
import { attachFlushOnHiddenAndUnload } from "./attachFlushOnHiddenAndUnload.js";
import { createTrailingDebounce } from "./createTrailingDebounce.js";

function defaultShouldScheduleLoggedIn() {
  return Boolean(useUsersStore.getState().account.isLoggedIn);
}

/**
 * Trailing debounce for API persist work: optional logged-in gate (default), optional
 * `visibilitychange` / `beforeunload` flush so pending writes are not lost.
 *
 * @param {{
 *   delayMs: number;
 *   onRun: () => void | Promise<void>;
 *   shouldSchedule?: () => boolean;
 *   attachTabLifecycleFlush?: boolean;
 * }} opts
 */
export function createPersistDebounce(opts) {
  const {
    delayMs,
    onRun,
    shouldSchedule = defaultShouldScheduleLoggedIn,
    attachTabLifecycleFlush = false,
  } = opts;

  const debounce = createTrailingDebounce({
    delayMs,
    onRun,
    shouldSchedule,
  });

  if (attachTabLifecycleFlush && typeof window !== "undefined") {
    attachFlushOnHiddenAndUnload(() => void debounce.flushPending());
  }

  return debounce;
}

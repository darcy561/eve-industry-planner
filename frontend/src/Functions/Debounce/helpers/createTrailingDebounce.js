/**
 * Trailing debounce: each `schedule()` resets the timer; `flushPending()` runs immediately
 * (used for coalesced saves that must land before tab hide / unload).
 *
 * @param {{
 *   delayMs: number;
 *   onRun: () => void | Promise<void>;
 *   shouldSchedule?: () => boolean;
 * }} opts
 */
export function createTrailingDebounce(opts) {
  const { delayMs, onRun, shouldSchedule = () => true } = opts;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function cancel() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    if (!shouldSchedule()) return;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      void Promise.resolve(onRun());
    }, delayMs);
  }

  function isPending() {
    return timer != null;
  }

  /**
   * Clears any pending timer and runs `onRun` now, resolving once it has finished —
   * so `onRun` must return its work rather than discarding it, or a caller awaiting
   * a flush before moving on carries on while the write is still in the air.
   */
  function flushPending() {
    cancel();
    if (!shouldSchedule()) return;
    return Promise.resolve(onRun());
  }

  return { schedule, cancel, flushPending, isPending };
}

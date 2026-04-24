/**
 * Coalesced flush: the first `scheduleFlush()` arms a single timer; further calls while
 * pending do **not** extend the delay (good for batching rapid WS/UI updates).
 *
 * @param {{
 *   delayMs: number;
 *   onFlush: () => void;
 *   shouldSchedule?: () => boolean;
 * }} opts
 */
export function createCoalesceFlush(opts) {
  const { delayMs, onFlush, shouldSchedule = () => true } = opts;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function cancel() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleFlush() {
    if (!shouldSchedule()) return;
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      onFlush();
    }, delayMs);
  }

  return { scheduleFlush, cancel };
}

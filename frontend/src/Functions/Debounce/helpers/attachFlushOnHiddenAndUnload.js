/**
 * Flushes pending saves when the tab is hidden or the document unloads (best-effort).
 *
 * @param {() => void | Promise<void>} flushFn
 * @returns {() => void} teardown (optional; usually keep for app lifetime)
 */
export function attachFlushOnHiddenAndUnload(flushFn) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      void Promise.resolve(flushFn());
    }
  };
  const onUnload = () => {
    void Promise.resolve(flushFn());
  };
  window.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onUnload);
  return () => {
    window.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onUnload);
  };
}

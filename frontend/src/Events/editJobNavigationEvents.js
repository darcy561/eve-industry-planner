/**
 * When the edit job route is mounted, it registers a handler so other UI (link tree dialog,
 * parent chips, child job button) can request navigation to another job with the same
 * save/discard rules as leaving edit normally.
 *
 * @typedef {{ jobID: string|number, search?: Record<string, string|undefined> }} EditJobNavigationPayload
 */

/** @type {null | ((payload: EditJobNavigationPayload) => Promise<'navigated' | 'cancelled' | 'not-handled'>)} */
let navigateHandler = null;

/**
 * @param {(payload: EditJobNavigationPayload) => Promise<'navigated' | 'cancelled' | 'not-handled'>} fn
 */
export function registerEditJobNavigateHandler(fn) {
  navigateHandler = fn;
}

export function unregisterEditJobNavigateHandler() {
  navigateHandler = null;
}

/**
 * @param {EditJobNavigationPayload} payload
 * @returns {Promise<'navigated' | 'cancelled' | 'not-handled'>}
 */
export function requestEditJobNavigation(payload) {
  if (!navigateHandler) {
    return Promise.resolve("not-handled");
  }
  return navigateHandler(payload);
}

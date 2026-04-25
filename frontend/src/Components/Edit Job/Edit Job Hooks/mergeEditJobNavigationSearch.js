/**
 * Merge caller-provided edit-job search with the current route search so switching jobs
 * keeps `activeGroup` / `pageView` when editing inside a group session.
 *
 * @param {Record<string, unknown>|undefined|null} payloadSearch
 * @param {{ activeGroup?: string, pageView?: string }} routeSearch
 * @returns {Record<string, string|undefined>}
 */
export function mergeEditJobNavigationSearch(payloadSearch, routeSearch) {
  const p =
    payloadSearch && typeof payloadSearch === "object" ? { ...payloadSearch } : {};
  const ag = routeSearch?.activeGroup;
  const pv = routeSearch?.pageView;
  if (
    (p.activeGroup === undefined || p.activeGroup === "") &&
    ag != null &&
    String(ag) !== ""
  ) {
    p.activeGroup = ag;
  }
  if (
    (p.pageView === undefined || p.pageView === "") &&
    pv != null &&
    String(pv) !== ""
  ) {
    p.pageView = pv;
  }
  return p;
}

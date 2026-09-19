/**
 * Passed as router history state by whatever offers signing out. A URL cannot
 * carry it, which is what stops a link from another site ending a session.
 */
export const SIGNOUT_INTENT = Object.freeze({ signOut: true });

/**
 * @param {Record<string, unknown>|undefined} state - `ParsedLocation.state`.
 * @returns {boolean}
 */
export function isDeliberateSignout(state) {
  return state?.signOut === true;
}

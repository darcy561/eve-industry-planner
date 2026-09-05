import useUsersStore from "../../../Zustand/usersStore";

const STATISTICS_ROOT = "/api/v1/statistics";

/**
 * Whose statistics a request is for, as the API names an owner: `kind:id`.
 *
 * Sent rather than left implicit because the path is what a second kind varies —
 * a corporation or a shared planner is a different owner, not a filter.
 *
 * @returns {string} an owner handle, or "" when nobody is signed in
 */
export function currentOwnerHandle() {
  const accountID = useUsersStore.getState().account.accountID;
  // The colon separates the halves, so only the id is escaped.
  return accountID ? `account:${encodeURIComponent(accountID)}` : "";
}

/**
 * @param {"timeline"|"timeline/items"|"totals"} view
 * @returns {string|null} null when there is no owner to ask about
 */
export function statisticsPath(view) {
  const owner = currentOwnerHandle();
  if (!owner) return null;
  return `${STATISTICS_ROOT}/${owner}/${view}`;
}

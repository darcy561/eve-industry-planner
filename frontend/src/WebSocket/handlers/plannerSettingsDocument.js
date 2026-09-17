/**
 * Change-stream handlers for `planner_settings` — one document per planner.
 */

import useUsersStore from "../../Zustand/usersStore.js";

/**
 * A planner's settings changed by somebody else.
 *
 * Keyed by the delivery's owner handle rather than by `docID`: these documents
 * are stored under the owner key, which spells a corporation as the ref the
 * client never sees, so the two are not the same string for every owner kind.
 *
 * Applied for any planner the connection carries, not just the active one. The
 * store holds settings per owner, so there is nothing for another planner's to
 * merge into by mistake.
 *
 * @param {{
 *   owner: string|null;
 *   docKey: string;
 *   document: Record<string, unknown>;
 *   position: number|null;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 * @returns {boolean}
 */
export function handlePlannerSettingsUpsert(ctx) {
  const { owner, docKey, document, rs, position } = ctx;
  if (!owner) return false;

  const actions = useUsersStore.getState().plannerSettings.actions;
  // An edit still on its way to the server is ahead of this delivery, so
  // applying it would discard the edit and then save the result over it. The
  // read path drops a stale answer for the same reason.
  if (!actions.hasUnsavedPlannerSettings(owner)) {
    // The stored document is the settings, so it is what the merge takes; the
    // API answers the same fields under a `settings` key.
    actions.setPlannerSettings(owner, document, true);
  }
  rs.setPosition(docKey, position);
  return true;
}

/**
 * A planner's settings document was removed, so it works on the defaults again.
 *
 * @param {{
 *   owner: string|null;
 *   docKey: string;
 *   position: number|null;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 * @returns {boolean}
 */
export function handlePlannerSettingsDelete(ctx) {
  const { owner, docKey, rs, position } = ctx;
  if (!owner) return false;

  useUsersStore.getState().plannerSettings.actions.clearPlannerSettings(owner);
  rs.setPosition(docKey, position);
  return true;
}

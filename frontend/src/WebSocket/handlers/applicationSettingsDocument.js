/**
 * Change-stream handlers for `application_settings` collection (account singleton doc).
 */

import useUsersStore from "../../Zustand/usersStore.js";
import { mergeApplicationSettingsState } from "../../Zustand/applicationSettings/core.js";
import {
  enqueueReconcile,
  reconcileAfterRemoteApplicationSettings,
} from "./accountReconcile.js";

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 * @returns {boolean}
 */
export function handleApplicationSettingsDocumentDelete(ctx) {
  const { accountId, docID, docKey, rs, position } = ctx;
  if (docID !== accountId) return false;

  rs.setPosition(docKey, position);
  useUsersStore
    .getState()
    .applicationSettings.actions.resetApplicationSettingsStore();
  return true;
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   document: Record<string, unknown>;
 *   previousDocument?: Record<string, unknown>;
 *   rs: { setPosition: (k: string, position: number|null) => void };
 * }} ctx
 * @returns {boolean}
 */
export function handleApplicationSettingsDocumentUpsert(ctx) {
  const { accountId, docID, docKey, document, rs, position } = ctx;
  if (docID !== accountId) return false;

  const prevCloudAccounts =
    !!useUsersStore.getState().applicationSettings.userCloudAccounts;

  const mainHash =
    useUsersStore.getState().account.mainCharacterHash ?? undefined;
  useUsersStore.setState(
    (state) => ({
      applicationSettings: mergeApplicationSettingsState(
        state.applicationSettings,
        document,
        mainHash,
        { authoritativeFullDocument: true },
      ),
    }),
    false,
    "websocket/applyApplicationSettings",
  );
  rs.setPosition(docKey, position);

  enqueueReconcile(async () => {
    await reconcileAfterRemoteApplicationSettings(prevCloudAccounts);
  });

  return true;
}

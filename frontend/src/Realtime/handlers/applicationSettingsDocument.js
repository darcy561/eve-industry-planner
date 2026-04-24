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
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 * }} ctx
 * @returns {boolean}
 */
export function handleApplicationSettingsDocumentDelete(ctx) {
  const { accountId, docID, docKey, rs } = ctx;
  if (docID !== accountId) return false;

  rs.setCursorMs(docKey, Date.now());
  useUsersStore.getState().applicationSettings.actions.resetApplicationSettingsStore();
  return true;
}

/**
 * @param {Record<string, unknown>|undefined} doc
 * @returns {boolean|undefined}
 */
function userCloudAccountsFromRemoteDoc(doc) {
  if (!doc || typeof doc !== "object") return undefined;
  if ("userCloudAccounts" in doc) return !!doc.userCloudAccounts;
  const account = doc.account;
  if (account && typeof account === "object" && "cloudAccounts" in account) {
    return !!(/** @type {Record<string, unknown>} */ (account).cloudAccounts);
  }
  return undefined;
}

/**
 * @param {{
 *   accountId: string;
 *   docKey: string;
 *   docID: string;
 *   document: Record<string, unknown>;
 *   previousDocument?: Record<string, unknown>;
 *   rs: { setCursorMs: (k: string, ms: number) => void };
 *   remoteMs: number;
 * }} ctx
 * @returns {boolean}
 */
export function handleApplicationSettingsDocumentUpsert(ctx) {
  const { accountId, docID, docKey, document, previousDocument, rs, remoteMs } =
    ctx;
  if (docID !== accountId) return false;

  const fromServerPrev = userCloudAccountsFromRemoteDoc(previousDocument);
  const prevCloudAccounts =
    fromServerPrev !== undefined
      ? fromServerPrev
      : !!useUsersStore.getState().applicationSettings.userCloudAccounts;

  const mainHash =
    useUsersStore.getState().account.mainCharacterHash ?? undefined;
  useUsersStore.setState(
    (state) => ({
      ...state,
      applicationSettings: mergeApplicationSettingsState(
        state.applicationSettings,
        document,
        mainHash,
        { authoritativeFullDocument: true }
      ),
    }),
    false,
    "realtime/applyApplicationSettings"
  );
  rs.setCursorMs(docKey, remoteMs);

  enqueueReconcile(async () => {
    await reconcileAfterRemoteApplicationSettings(prevCloudAccounts);
  });

  return true;
}

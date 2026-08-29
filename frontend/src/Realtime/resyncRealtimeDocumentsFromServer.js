/**
 * Pulls latest `users` + `application_settings` from the API and applies reconcile logic.
 * Used after WebSocket (re)connect and visibility wakeups.
 */

import useUsersStore from "../Zustand/usersStore.js";
import { metaLastModifiedMs } from "../Zustand/realtimeSyncSlice.js";
import {
  reconcileAfterRemoteApplicationSettings,
  reconcileAfterRemoteUserDoc,
} from "./handlers/accountReconcile.js";
import {
  getApplicationSettingsDocument,
  getUserAccountDocument,
} from "../Functions/Endpoints/Private/userDocument.js";

/**
 * Fetches both singleton account documents, merges settings before users (cloud flag visible to user reconcile),
 * advances realtime cursors, then runs token / cloud-character / system-index reconcile.
 */
export async function syncAccountDocumentsFromServer() {
  try {
    const accountId = useUsersStore.getState().account.accountID;
    if (!accountId) return;

    const rs = useUsersStore.getState().realtimeSync?.actions;
    if (!rs) return;

    const snap = {
      prevLinkedTokens: [],
      refreshTokensChanged: true,
      linkedCharactersChanged: true,
    };
    const prevCloudAccounts = !!useUsersStore.getState().applicationSettings
      .userCloudAccounts;

    const [userDoc, settingsDoc] = await Promise.all([
      getUserAccountDocument(),
      getApplicationSettingsDocument(),
    ]);

    // In-flight fetches can resolve after sign-out: account id / session was cleared and we must not
    // re-apply (e.g. custom structures) from a response that no longer matches the client session.
    if (useUsersStore.getState().account.accountID !== accountId) {
      return;
    }

    if (settingsDoc && typeof settingsDoc === "object") {
      const mainHash =
        useUsersStore.getState().account.mainCharacterHash ?? undefined;
      useUsersStore
        .getState()
        .applicationSettings.actions.mergeApplicationSettingsFromServer(
          settingsDoc,
          mainHash
        );
      const sMs = metaLastModifiedMs(settingsDoc);
      if (sMs != null) rs.setCursorMs(`application_settings.${accountId}`, sMs);
    }

    if (userDoc && typeof userDoc === "object") {
      useUsersStore.getState().account.actions.applyUserDocumentFromRemote(userDoc);
      const uMs = metaLastModifiedMs(userDoc);
      if (uMs != null) rs.setCursorMs(`users.${accountId}`, uMs);
    }

    const userPayload =
      userDoc && typeof userDoc === "object" ? userDoc : {};

    await reconcileAfterRemoteUserDoc(snap, userPayload);
    await reconcileAfterRemoteApplicationSettings(prevCloudAccounts);
  } catch (e) {
    console.error("[realtime] account documents sync failed", e);
  }
}

/**
 * @deprecated Use {@link syncAccountDocumentsFromServer} — kept for callers that still name "resync".
 */
export async function resyncRealtimeDocumentsFromServer() {
  return syncAccountDocumentsFromServer();
}

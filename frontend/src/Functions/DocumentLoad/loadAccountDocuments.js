import useUsersStore from "../../Zustand/usersStore.js";
import {
  reconcileAfterRemoteApplicationSettings,
  reconcileAfterRemoteUserDoc,
} from "../../WebSocket/handlers/accountReconcile.js";
import {
  getApplicationSettingsDocument,
  getUserAccountDocument,
} from "../Endpoints/Private/userDocument.js";

/**
 * Pulls the account's singleton documents from the API and reconciles from them.
 *
 * Settings merge before users: the cloud-accounts flag has to be current before
 * the user reconcile reads it.
 */
export async function loadAccountDocuments() {
  try {
    const accountId = useUsersStore.getState().account.accountID;
    if (!accountId) return;

    const rs = useUsersStore.getState().websocketSync?.actions;
    if (!rs) return;

    const snap = {
      prevLinkedTokens: [],
      refreshTokensChanged: true,
      linkedCharactersChanged: true,
    };
    const prevCloudAccounts =
      !!useUsersStore.getState().applicationSettings.userCloudAccounts;

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
          mainHash,
        );
      rs.forgetCollection("account_settings");
    }

    if (userDoc && typeof userDoc === "object") {
      useUsersStore
        .getState()
        .account.actions.applyUserDocumentFromRemote(userDoc);
      rs.forgetCollection("accounts");
    }

    const userPayload = userDoc && typeof userDoc === "object" ? userDoc : {};

    await reconcileAfterRemoteUserDoc(snap, userPayload);
    await reconcileAfterRemoteApplicationSettings(prevCloudAccounts);
  } catch (e) {
    console.error("[websocket] account documents sync failed", e);
  }
}

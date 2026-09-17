/**
 * Zustand actions for the planner session: applying a login response, and rotating the session when
 * a caller needs it. ESI access tokens are not here — they belong to the credential provider.
 */

import {
  establishPlannerSession,
  rotatePlannerSession,
} from "../../Functions/Auth/sessionClient.js";
import {
  getTabPlannerRefreshToken,
  persistTabPlannerSession,
  persistTabPlannerSessionFromAuthResponse,
} from "../../Functions/Auth/tabSessionStorage.js";
import { enforceReauthDemand } from "../../Functions/Auth/plannerSessionRedirect.js";
import { shouldDeferAuthRefreshDueToTranquilityOffline } from "../../Functions/Auth/authRefreshTranquilityGate.js";
import {
  getEsiAccessToken,
  heldEsiAccessToken,
} from "../../Functions/Auth/esiCredentials/provider.js";
import GLOBAL_CONFIG from "../../global-config-app.js";
import { dedupeLinkedCharacterHashStrings } from "../../Functions/Auth/characterHashCanonical.js";
import { mergeApplicationSettingsState } from "../applicationSettings/core.js";
import { metaLastModifiedMs } from "../websocketSyncSlice.js";
import { asNumberIDSet } from "../../Functions/Helper/ids";

/**
 * Concurrent private API calls can all reach the rotate path at once, and each parallel rotate
 * would spend this tab's refresh row in Redis.
 *
 * @type {Promise<void>|null}
 */
let inflightEnsurePlannerSessionPromise = null;

/**
 * Only success updates `account.lastPlannerSessionValidatedAt`, so a failed rotate leaves the
 * cooldown permanently elapsed and every private request retries it against the same failing
 * credential. This records the failure so they do not.
 *
 * @type {number|null}
 */
let lastFailedPlannerSessionRotateAt = null;

const PLANNER_SESSION_ROTATE_FAILURE_BACKOFF_MS = 30 * 1000;

function clearPlannerSessionRotateFailure() {
  lastFailedPlannerSessionRotateAt = null;
}

/**
 * Clock skew (seconds) required of the main character's ESI access token before it is sent to
 * `/api/v1/auth/sessions/rotate` as `eve_token`.
 */
const ESI_ACCESS_TOKEN_REFRESH_SKEW_SEC = 60;

/** Matches {@link GLOBAL_CONFIG.PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES} (~EVE access token cadence). */
const PLANNER_SESSION_ROTATE_COOLDOWN_MS =
  Math.max(
    1,
    Number(GLOBAL_CONFIG.PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES) || 20,
  ) *
  60 *
  1000;

/**
 * Maps login `user_document` linked* arrays into account `Set`s (camelCase + snake_case keys).
 *
 * @param {object|null|undefined} userDoc
 * @returns {{ linkedOrders: Set<number>, linkedJobs: Set<number>, linkedTrans: Set<number> }}
 */
function linkedSetsFromUserDocument(userDoc) {
  if (userDoc && typeof userDoc === "object" && !Array.isArray(userDoc)) {
    return {
      linkedOrders: asNumberIDSet(
        userDoc.linkedOrders ?? userDoc.linked_orders,
      ),
      linkedJobs: asNumberIDSet(userDoc.linkedJobs ?? userDoc.linked_jobs),
      linkedTrans: asNumberIDSet(userDoc.linkedTrans ?? userDoc.linked_trans),
    };
  }
  return {
    linkedOrders: new Set(),
    linkedJobs: new Set(),
    linkedTrans: new Set(),
  };
}

/**
 * @param {object|null|undefined} userDoc
 * @returns {boolean|undefined}
 */
function userCloudAccountsFromUserDocument(userDoc) {
  if (!userDoc || typeof userDoc !== "object" || Array.isArray(userDoc)) {
    return undefined;
  }
  if (userDoc.userCloudAccounts !== undefined) {
    return !!userDoc.userCloudAccounts;
  }
  if (userDoc.user_cloud_accounts !== undefined) {
    return !!userDoc.user_cloud_accounts;
  }
  return undefined;
}

/**
 * Mongo `users.hasCompletedFirstLoginFlow` from login / websocket `user_document`.
 *
 * @param {object|null|undefined} userDoc
 * @returns {boolean|undefined}
 */
function hasCompletedFirstLoginFlowFromUserDocument(userDoc) {
  if (!userDoc || typeof userDoc !== "object" || Array.isArray(userDoc)) {
    return undefined;
  }
  if ("hasCompletedFirstLoginFlow" in userDoc) {
    return Boolean(userDoc.hasCompletedFirstLoginFlow);
  }
  if ("has_completed_first_login_flow" in userDoc) {
    return Boolean(userDoc.has_completed_first_login_flow);
  }
  return undefined;
}

/**
 * Mongo `users.shareCitadelNames` from login / websocket `user_document`.
 *
 * @param {object|null|undefined} userDoc
 * @returns {boolean|undefined}
 */
function shareCitadelNamesFromUserDocument(userDoc) {
  if (!userDoc || typeof userDoc !== "object" || Array.isArray(userDoc)) {
    return undefined;
  }
  if ("shareCitadelNames" in userDoc) {
    return Boolean(userDoc.shareCitadelNames);
  }
  if ("share_citadel_names" in userDoc) {
    return Boolean(userDoc.share_citadel_names);
  }
  return undefined;
}

/** @param {Function} set @param {Function} get */
export const plannerSessionActions = (set, get) => ({
  /**
   * Sets session-level first-login requirement flag.
   *
   * @param {boolean} value
   */
  setIsFirstTimeLogin: (value) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          isFirstTimeLogin: Boolean(value),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setIsFirstTimeLogin",
    );
  },

  /**
   * One Zustand update for POST /api/v1/auth/sessions: session fields, optional
   * `user_document` linked* → root `linkedOrders` / `linkedJobs` / `linkedTrans`, `shareCitadelNames` on the account
   * slice, and optional `application_settings` for other prefs.
   * The full `user_document` is not persisted on the account slice — pass it to `runPostLoginAccountSync` if needed.
   *
   * @param {object} response - Parsed JSON from auth/login
   * @param {string} [mainCharacterHash] - SSO character hash (`CharacterHash` on the main `Character`); omitted leaves existing value
   */
  applyLoginAuthResponse: (response, mainCharacterHash) => {
    if (!response) return;

    const isFirstTimeLogin = Boolean(response.first_login ?? false);

    const sessionID =
      typeof response.session_id === "string" && response.session_id.trim()
        ? response.session_id.trim()
        : null;

    set(
      (state) => {
        const linkedPatch = linkedSetsFromUserDocument(response.user_document);

        const ud = response.user_document;
        let nextHasCompletedFirstLogin;
        let nextShareCitadelNames;
        if (ud && typeof ud === "object" && !Array.isArray(ud)) {
          nextHasCompletedFirstLogin =
            hasCompletedFirstLoginFlowFromUserDocument(ud) ?? false;
          nextShareCitadelNames = shareCitadelNamesFromUserDocument(ud) ?? true;
        }

        const mainCharacterHashForMerge =
          mainCharacterHash !== undefined
            ? mainCharacterHash || undefined
            : (state.account.mainCharacterHash ?? undefined);

        let nextApplicationSettings = state.applicationSettings;
        if (
          response.application_settings &&
          typeof response.application_settings === "object"
        ) {
          nextApplicationSettings = mergeApplicationSettingsState(
            state.applicationSettings,
            response.application_settings,
            mainCharacterHashForMerge,
          );
        }
        let userCloudAccounts = userCloudAccountsFromUserDocument(
          response.user_document,
        );
        if (
          response.esi_oauth_storage === "server" ||
          response.esi_oauth_storage === "client"
        ) {
          userCloudAccounts = response.esi_oauth_storage === "server";
        }
        if (userCloudAccounts !== undefined) {
          nextApplicationSettings = {
            ...nextApplicationSettings,
            userCloudAccounts,
            actions: nextApplicationSettings.actions,
          };
        }

        const cloudResolved =
          userCloudAccounts !== undefined
            ? !!userCloudAccounts
            : !!state.applicationSettings.userCloudAccounts;

        const bootstrapLinkedHashes =
          cloudResolved && Array.isArray(response.linked_characters)
            ? dedupeLinkedCharacterHashStrings(response.linked_characters)
            : null;

        return {
          ...state,
          account: {
            ...state.account,
            accountID: response.account_id,
            ...(mainCharacterHash !== undefined && {
              mainCharacterHash: mainCharacterHash || null,
            }),
            sessionID,
            lastPlannerSessionValidatedAt: sessionID ? Date.now() : null,
            plannerPrivateAuthReady: sessionID
              ? false
              : state.account.plannerPrivateAuthReady,
            refreshToken: response.refresh_token ?? null,
            isFirstTimeLogin,
            ...linkedPatch,
            ...(nextHasCompletedFirstLogin !== undefined && {
              hasCompletedFirstLoginFlow: nextHasCompletedFirstLogin,
            }),
            ...(nextShareCitadelNames !== undefined && {
              shareCitadelNames: nextShareCitadelNames,
            }),
            linkedCharacterHashesFromBootstrapSession: bootstrapLinkedHashes,
            linkedBootstrapHydrationPending:
              cloudResolved &&
              Array.isArray(response.linked_characters) &&
              response.linked_characters.length > 0,
            actions: state.account.actions,
          },
          applicationSettings: nextApplicationSettings,
        };
      },
      false,
      "account/applyLoginAuthResponse",
    );

    clearPlannerSessionRotateFailure();
    persistTabPlannerSessionFromAuthResponse(response);

    const aid = response.account_id;
    if (aid) {
      const rs = get().websocketSync?.actions;
      if (rs) {
        const u = metaLastModifiedMs(response.user_document);
        if (u != null) rs.setCursorMs(`users.${aid}`, u);
        const ap = metaLastModifiedMs(response.application_settings);
        if (ap != null) rs.setCursorMs(`application_settings.${aid}`, ap);
      }
    }
  },

  /**
   * End of cloud linked-character hydration from login/bootstrap (`runPostLoginAccountSync`).
   */
  setPlannerPrivateAuthReady: (ready) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          plannerPrivateAuthReady: Boolean(ready),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setPlannerPrivateAuthReady",
    );
  },

  clearLinkedBootstrapHydrationPending: () => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedBootstrapHydrationPending: false,
          actions: state.account.actions,
        },
      }),
      false,
      "account/clearLinkedBootstrapHydrationPending",
    );
  },

  /**
   * Merge remote `users` collection document (WebSocket) into linked ESI sets; guarded by caller cursors.
   *
   * @param {object} doc
   */
  applyUserDocumentFromRemote: (doc) => {
    if (!doc || typeof doc !== "object") return;
    const linkedPatch = linkedSetsFromUserDocument(doc);
    const userCloudAccounts = userCloudAccountsFromUserDocument(doc);
    const completedFirstLogin = hasCompletedFirstLoginFlowFromUserDocument(doc);
    const shareCitadelNames = shareCitadelNamesFromUserDocument(doc);
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          ...linkedPatch,
          ...(completedFirstLogin !== undefined && {
            hasCompletedFirstLoginFlow: completedFirstLogin,
          }),
          ...(shareCitadelNames !== undefined && {
            shareCitadelNames,
          }),
          actions: state.account.actions,
        },
        ...(userCloudAccounts !== undefined && {
          applicationSettings: {
            ...state.applicationSettings,
            userCloudAccounts,
            actions: state.applicationSettings.actions,
          },
        }),
      }),
      false,
      "account/applyUserDocumentFromRemote",
    );
  },

  /**
   * Update server session fields (e.g. after `POST /api/v1/auth/sessions/rotate`).
   *
   * @param {object} partial
   * @param {string} [partial.refreshToken]
   */
  setSessionTokens: (partial) => {
    if (!partial) return;
    const nextSessionID =
      typeof partial.sessionID === "string" && partial.sessionID.trim()
        ? partial.sessionID.trim()
        : undefined;
    persistTabPlannerSession({
      ...(nextSessionID !== undefined && { sessionID: nextSessionID }),
      ...(partial.refreshToken !== undefined && {
        refreshToken: partial.refreshToken,
      }),
    });
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          ...(nextSessionID !== undefined && {
            sessionID: nextSessionID,
          }),
          ...(partial.refreshToken !== undefined && {
            refreshToken: partial.refreshToken,
          }),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setSessionTokens",
    );
  },

  /**
   * Rotates the planner app session (`POST .../rotate`) if it is due, and no-ops otherwise — a
   * recently validated session, a rotate that just failed, or Tranquility being down all skip the
   * HTTP call, so callers may await this before every private request.
   *
   * Planner refresh material is per-tab (`sessionStorage` + body on rotate).
   *
   * @param {object} [options]
   * @param {boolean} [options.force] - Skip the validated-recently cooldown (not the failure backoff).
   */
  ensurePlannerSession: async (options = {}) => {
    const force = Boolean(options?.force);
    if (shouldDeferAuthRefreshDueToTranquilityOffline(get)) {
      return;
    }
    if (inflightEnsurePlannerSessionPromise) {
      return inflightEnsurePlannerSessionPromise;
    }

    const promise = (async () => {
      const state = get();
      const mainCharacter = state.account.characters?.find(
        (ch) => ch?.isMainCharacter,
      );
      if (!mainCharacter) return;

      if (enforceReauthDemand()) {
        return;
      }

      const sessionID = state.account.sessionID;
      const lastOk = state.account.lastPlannerSessionValidatedAt;
      if (
        !force &&
        typeof sessionID === "string" &&
        sessionID.trim().length > 0 &&
        typeof lastOk === "number" &&
        Date.now() - lastOk < PLANNER_SESSION_ROTATE_COOLDOWN_MS
      ) {
        return;
      }

      // `force` does not bypass this. Forced rotates come from the `session_missing` recovery in
      // the private request path, so letting them through is exactly the burst this prevents.
      if (
        lastFailedPlannerSessionRotateAt !== null &&
        Date.now() - lastFailedPlannerSessionRotateAt <
          PLANNER_SESSION_ROTATE_FAILURE_BACKOFF_MS
      ) {
        return;
      }

      try {
        const cloud = !!state.applicationSettings?.userCloudAccounts;

        // Cloud mode can rotate on the cookie plus Mongo-stored ESI material, so a token that
        // cannot be acquired is not fatal there; local mode has no such fallback and must send one.
        let eveTokenForRefresh = "";
        try {
          const acquired = await getEsiAccessToken(
            mainCharacter.CharacterHash,
            {
              minRemainingSec: ESI_ACCESS_TOKEN_REFRESH_SKEW_SEC,
            },
          );
          eveTokenForRefresh = acquired.accessToken;
        } catch (err) {
          if (!cloud) {
            enforceReauthDemand(err);
            return;
          }
        }

        const tabRefresh =
          getTabPlannerRefreshToken() ?? state.account.refreshToken;
        if (!tabRefresh && !cloud) {
          return;
        }

        const response = await rotatePlannerSession(
          tabRefresh || null,
          eveTokenForRefresh,
        );

        const tokenPatch = {
          sessionID: response.session_id ?? get().account.sessionID,
        };
        if (response.refresh_token) {
          tokenPatch.refreshToken = response.refresh_token;
        }
        get().account.actions.setSessionTokens(tokenPatch);
        set(
          (s) => ({
            ...s,
            account: {
              ...s.account,
              lastPlannerSessionValidatedAt: Date.now(),
              actions: s.account.actions,
            },
          }),
          false,
          "account/plannerSessionRotateOk",
        );
        clearPlannerSessionRotateFailure();
      } catch (err) {
        if (enforceReauthDemand(err)) {
          clearPlannerSessionRotateFailure();
          return;
        }
        const cloud = !!get().applicationSettings?.userCloudAccounts;
        const eveTokenForRecovery = heldEsiAccessToken(
          mainCharacter.CharacterHash,
        );
        if (err?.status === 401 && !cloud && eveTokenForRecovery) {
          try {
            const loginResp =
              await establishPlannerSession(eveTokenForRecovery);
            get().account.actions.applyLoginAuthResponse(
              loginResp,
              mainCharacter.CharacterHash,
            );
            set(
              (s) => ({
                ...s,
                account: {
                  ...s.account,
                  lastPlannerSessionValidatedAt: Date.now(),
                  actions: s.account.actions,
                },
              }),
              false,
              "account/plannerSessionReestablishOk",
            );
            clearPlannerSessionRotateFailure();
            return;
          } catch (reestablishErr) {
            console.error(reestablishErr?.message ?? reestablishErr);
          }
        }
        lastFailedPlannerSessionRotateAt = Date.now();
        console.error(err?.message ?? err);
      }
    })();

    inflightEnsurePlannerSessionPromise = promise;
    try {
      await promise;
    } finally {
      if (inflightEnsurePlannerSessionPromise === promise) {
        inflightEnsurePlannerSessionPromise = null;
      }
    }
  },
});

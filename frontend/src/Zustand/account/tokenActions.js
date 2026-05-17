/**
 * Zustand actions for planner session, login response application, ESI-linked refresh tokens,
 * and scheduled ESI + corporation claims + server session refresh.
 *
 * @fileoverview Token and session credential actions on the account slice
 */

import { refreshServerSession } from "../../Functions/Auth/serverTokens.js";
import { shouldDeferAuthRefreshDueToTranquilityOffline } from "../../Functions/Auth/authRefreshTranquilityGate.js";
import updateCorporationClaims from "../../Functions/Endpoints/Pirivate/corporationClaims.js";
import GLOBAL_CONFIG from "../../global-config-app.js";
import { dedupeLinkedCharacterHashStrings } from "../../Functions/Auth/characterHashCanonical.js";
import { mergeApplicationSettingsState } from "../applicationSettings/core.js";
import { metaLastModifiedMs } from "../realtimeSyncSlice.js";

/**
 * Monotonic counter for {@link runStaggeredEsiTokenStep}; the active slot is
 * `esStaggerIndex % n`. It is **not** reset when the roster changes — new
 * characters (appended to `chain` as main, then alts) fold into the existing
 * rotation; only the modulus changes.
 */
let esStaggerIndex = 0;

/**
 * Single-flight guard for {@link tokenActions.refreshServerToken}. Concurrent
 * private API calls + the staggered ESI step + maintenance can all hit the
 * refresh path at once; each parallel call rotates the planner refresh row in
 * Redis (and the HttpOnly cookie for cloud users), orphaning the losers' tokens.
 * While a refresh is in flight, additional callers await the same promise.
 *
 * @type {Promise<void>|null}
 */
let inflightRefreshServerTokenPromise = null;

/**
 * Clock skew (seconds) used when deciding whether `mainCharacter.esiAccessToken`
 * is safe to send to `/api/v1/auth/sessions/rotate` as `eve_token`.
 */
const ESI_ACCESS_TOKEN_REFRESH_SKEW_SEC = 60;

/** Matches {@link GLOBAL_CONFIG.PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES} (~EVE access token cadence). */
const PLANNER_SESSION_ROTATE_COOLDOWN_MS =
  Math.max(
    1,
    Number(GLOBAL_CONFIG.PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES) || 20
  ) *
  60 *
  1000;

/** @param {unknown} value */
function toLinkedSet(value) {
  if (value == null) return new Set();
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) {
    return new Set(
      value
        .map(normalizeLinkedID)
        .filter((id) => typeof id === "number" && Number.isFinite(id))
    );
  }
  return new Set();
}

function normalizeLinkedID(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
  }

  return null;
}

/**
 * Maps login `user_document` linked* arrays into account `Set`s (camelCase + snake_case keys).
 * @param {object|null|undefined} userDoc
 * @returns {{ linkedOrders: Set<number>, linkedJobs: Set<number>, linkedTrans: Set<number> }}
 */
function linkedSetsFromUserDocument(userDoc) {
  if (userDoc && typeof userDoc === "object" && !Array.isArray(userDoc)) {
    return {
      linkedOrders: toLinkedSet(
        userDoc.linkedOrders ?? userDoc.linked_orders
      ),
      linkedJobs: toLinkedSet(userDoc.linkedJobs ?? userDoc.linked_jobs),
      linkedTrans: toLinkedSet(userDoc.linkedTrans ?? userDoc.linked_trans),
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
 * Mongo `users.hasCompletedFirstLoginFlow` from login / realtime `user_document`.
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
 * Mongo `users.shareCitadelNames` from login / realtime `user_document`.
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
export const tokenActions = (set, get) => ({
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
      "account/setIsFirstTimeLogin"
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
        const linkedPatch = linkedSetsFromUserDocument(
          response.user_document
        );

        const ud = response.user_document;
        let nextHasCompletedFirstLogin;
        let nextShareCitadelNames;
        if (ud && typeof ud === "object" && !Array.isArray(ud)) {
          nextHasCompletedFirstLogin =
            hasCompletedFirstLoginFlowFromUserDocument(ud) ?? false;
          nextShareCitadelNames =
            shareCitadelNamesFromUserDocument(ud) ?? true;
        }

        const mainCharacterHashForMerge =
          mainCharacterHash !== undefined
            ? mainCharacterHash || undefined
            : state.account.mainCharacterHash ?? undefined;

        let nextApplicationSettings = state.applicationSettings;
        if (
          response.application_settings &&
          typeof response.application_settings === "object"
        ) {
          nextApplicationSettings = mergeApplicationSettingsState(
            state.applicationSettings,
            response.application_settings,
            mainCharacterHashForMerge
          );
        }
        let userCloudAccounts = userCloudAccountsFromUserDocument(
          response.user_document
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
            refreshToken: cloudResolved
              ? null
              : response.refresh_token ?? null,
            refreshTokenEXP: cloudResolved
              ? null
              : response.refresh_token_exp ?? response.refresh_token_expires_at,
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
      "account/applyLoginAuthResponse"
    );

    const aid = response.account_id;
    if (aid) {
      const rs = get().realtimeSync?.actions;
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
      "account/clearLinkedBootstrapHydrationPending"
    );
  },

  /**
   * Merge remote `users` collection document (WebSocket) into linked ESI sets; guarded by caller cursors.
   * @param {object} doc
   */
  applyUserDocumentFromRemote: (doc) => {
    if (!doc || typeof doc !== "object") return;
    const linkedPatch = linkedSetsFromUserDocument(doc);
    const userCloudAccounts = userCloudAccountsFromUserDocument(doc);
    const completedFirstLogin =
      hasCompletedFirstLoginFlowFromUserDocument(doc);
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
      "account/applyUserDocumentFromRemote"
    );
  },

  /**
   * Update server session fields (e.g. after `POST /api/v1/auth/sessions/rotate`).
   *
   * @param {object} partial
   * @param {string} [partial.refreshToken]
   * @param {number} [partial.refreshTokenEXP]
   */
  setSessionTokens: (partial) => {
    if (!partial) return;
    const nextSessionID =
      typeof partial.sessionID === "string" && partial.sessionID.trim()
        ? partial.sessionID.trim()
        : undefined;
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
          ...(partial.refreshTokenEXP !== undefined && {
            refreshTokenEXP: partial.refreshTokenEXP,
          }),
          actions: state.account.actions,
        },
      }),
      false,
      "account/setSessionTokens"
    );
  },

  /**
   * Rotates the planner app session (`POST .../rotate`) when credentials warrant it.
   *
   * **Cooldown:** If `sessionID` exists and {@link accountStateDefault.lastPlannerSessionValidatedAt}
   * is within `PLANNER_SESSION_ROTATE_COOLDOWN_MS` (~20m from {@link GLOBAL_CONFIG.PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES}),
   * returns without HTTP — login/bootstrap already validated the session.
   *
   * In **cloud mode**, `eve_token` may be omitted when stale so the server uses the HttpOnly
   * cookie + Mongo ESI (see `refresh.go` empty-`eve_token` branch).
   *
   * Concurrent callers share one in-flight promise via {@link inflightRefreshServerTokenPromise}.
   */
  refreshServerToken: async () => {
    if (shouldDeferAuthRefreshDueToTranquilityOffline(get)) {
      return;
    }
    if (inflightRefreshServerTokenPromise) {
      return inflightRefreshServerTokenPromise;
    }

    const promise = (async () => {
      const state = get();
      const mainCharacter = state.account.characters?.find((ch) => ch?.isMainCharacter);
      if (!mainCharacter) return;

      const sessionID = state.account.sessionID;
      const lastOk = state.account.lastPlannerSessionValidatedAt;
      if (
        typeof sessionID === "string" &&
        sessionID.trim().length > 0 &&
        typeof lastOk === "number" &&
        Date.now() - lastOk < PLANNER_SESSION_ROTATE_COOLDOWN_MS
      ) {
        return;
      }

      try {
        const { refreshToken } = state.account;
        const cloud = !!state.applicationSettings?.userCloudAccounts;
        if (!refreshToken && !cloud) {
          return;
        }
        const currentTimeStamp = Math.floor(Date.now() / 1000);

        // Cloud mode: prefer the Mongo fallback (empty eve_token + cookie) when the
        // in-memory main ESI access token is missing or within the skew window of
        // expiry; otherwise the server would reject the refresh with 401 even though
        // the cookie + stored ESI material would have worked.
        let eveTokenForRefresh = mainCharacter.esiAccessToken || "";
        if (cloud) {
          const esiExp = Number(mainCharacter.esiAccessTokenEXP) || 0;
          if (
            !eveTokenForRefresh ||
            esiExp <= currentTimeStamp + ESI_ACCESS_TOKEN_REFRESH_SKEW_SEC
          ) {
            eveTokenForRefresh = "";
          }
        } else if (
          typeof eveTokenForRefresh !== "string" ||
          eveTokenForRefresh.trim().length === 0
        ) {
          // Local accounts must provide eve_token on refresh; skip until available.
          return;
        }

        const response = await refreshServerSession(
          refreshToken || null,
          eveTokenForRefresh
        );

        const tokenPatch = {
          sessionID: response.session_id ?? get().account.sessionID,
        };
        if (response.refresh_token) {
          tokenPatch.refreshToken = response.refresh_token;
          tokenPatch.refreshTokenEXP =
            response.refresh_token_exp ?? response.refresh_token_expires_at;
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
          "account/plannerSessionRotateOk"
        );
      } catch (err) {
        console.error(err.message);
      }
    })();

    inflightRefreshServerTokenPromise = promise;
    try {
      await promise;
    } finally {
      if (inflightRefreshServerTokenPromise === promise) {
        inflightRefreshServerTokenPromise = null;
      }
    }
  },

  /**
   * Staggered ESI pass: one character per call (round-robin: main first, then alts).
   * `Character#refreshEsiAccessTokenIfNeeded` no-ops when the token is still well inside the 15m
   * buffer, so this is cheap on ticks where nothing is due. Used by
   * `useRefreshESITokens` (stagger from `ESI_STAGGER_TARGET_FULL_CYCLE_MINUTES` / n).
   */
  runStaggeredEsiTokenStep: async () => {
    const state = get();
    if (!state.account.isLoggedIn) return;
    const characters = state.account.characters.filter(
      (c) =>
        c &&
        !c.isPlaceholder &&
        typeof c.refreshEsiAccessTokenIfNeeded === "function"
    );
    if (characters.length === 0) return;

    const main = characters.find((u) => u.isMainCharacter);
    const alts = characters.filter((u) => u && !u.isMainCharacter);
    const chain = main ? [main, ...alts] : alts;
    const n = chain.length;
    if (n === 0) return;

    const character = chain[esStaggerIndex % n];
    esStaggerIndex++;

    if (shouldDeferAuthRefreshDueToTranquilityOffline(get)) {
      return;
    }

    try {
      await character.refreshEsiAccessTokenIfNeeded();
      await character.getPublicCharacterData();
    } catch (err) {
      console.error("Staggered ESI token refresh failed:", err);
    }

    get().account.actions.updateCharacters([...get().account.characters]);
  },

  /**
   * Periodic (see `DEFAULT_CHARACTER_REFRESH_INTERVAL`) corporation-claims and session
   * maintenance; ESI is kept fresh by the staggered rotation, not a bulk
   * refresh. Used by `useRefreshESITokens`.
   */
  runEsiTokenIntervalMaintenance: async () => {
    if (shouldDeferAuthRefreshDueToTranquilityOffline(get)) {
      return;
    }
    if (!get().account.isLoggedIn) return;
    const characters = get().account.characters;
    const esiTokens = characters
      .map((ch) => ch?.esiAccessToken)
      .filter((t) => typeof t === "string" && t.trim().length > 0);
    if (esiTokens.length > 0) {
      await updateCorporationClaims(esiTokens);
    }
    await get().account.actions.refreshServerToken();
    get().account.actions.updateCharacters([...get().account.characters]);
  },

  /**
   * Refresh ESI for **all** characters in one shot (main then alts in parallel),
   * then claims + planner session refresh. Prefer staggered work for the timer; this remains for
   * exceptional cases (e.g. a forced refresh after a bulk import).
   */
  runScheduledTokenRefresh: async () => {
    if (shouldDeferAuthRefreshDueToTranquilityOffline(get)) {
      return;
    }
    const state = get();
    if (!state.account.isLoggedIn) return;
    const characters = state.account.characters.filter((u) => u && !u.isPlaceholder);

    const mainCharacter = characters.find((u) => u?.isMainCharacter);
    const others = characters.filter((u) => u && !u.isMainCharacter);

    if (mainCharacter) {
      if (typeof mainCharacter.refreshEsiAccessTokenIfNeeded === "function") {
        try {
          await mainCharacter.refreshEsiAccessTokenIfNeeded();
          await mainCharacter.getPublicCharacterData();
        } catch (err) {
          console.error("Main character ESI refresh failed:", err);
        }
      } else {
        console.error(
          "Invalid main character object or missing refreshEsiAccessTokenIfNeeded method"
        );
      }
    }

    await Promise.allSettled(
      others.map(async (character) => {
        if (!character || typeof character.refreshEsiAccessTokenIfNeeded !== "function") {
          console.error(
            "Invalid character object or missing refreshEsiAccessTokenIfNeeded method"
          );
          return;
        }
        await character.refreshEsiAccessTokenIfNeeded();
        await character.getPublicCharacterData();
      })
    );

    const esiTokens = get()
      .account.characters.map((ch) => ch?.esiAccessToken)
      .filter((t) => typeof t === "string" && t.trim().length > 0);
    if (esiTokens.length > 0) {
      await updateCorporationClaims(esiTokens);
    }

    await get().account.actions.refreshServerToken();
    get().account.actions.updateCharacters([...get().account.characters]);
  },

});

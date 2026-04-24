/**
 * Zustand actions for app JWT session, login token application, ESI-linked refresh tokens,
 * and scheduled ESI + corporation claims + server JWT refresh.
 *
 * @fileoverview Token and session credential actions on the account slice
 */

import { canonicalCharacterHashKey } from "../../Functions/Auth/characterHashCanonical.js";
import {
  decodeAppJwt,
  getEffectiveAppAccessExpiryUnix,
  getAppJwtSessionID,
  verifyAppAccessTokenWithJwks,
} from "../../Functions/Auth/appJwt.js";
import { refreshServerJWT } from "../../Functions/Auth/serverTokens.js";
import updateCorporationClaims from "../../Functions/Endpoints/Pirivate/corporationClaims.js";
import { mergeApplicationSettingsState } from "../applicationSettings/core.js";
import { metaLastModifiedMs } from "../realtimeSyncSlice.js";

/**
 * Monotonic counter for {@link runStaggeredEsiTokenStep}; the active slot is
 * `esStaggerIndex % n`. It is **not** reset when the roster changes — new
 * characters (appended to `chain` as main, then alts) fold into the existing
 * rotation; only the modulus changes.
 */
let esStaggerIndex = 0;

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

/** @param {Function} set @param {Function} get */
export const tokenActions = (set, get) => ({
  /**
   * Decodes the app JWT (`account.accessToken`) via jose; returns `null` if missing or invalid.
   *
   * @returns {import("jose").JWTPayload|null}
   */
  getDeserialisedSerializedServerToken: () => {
    const token = get().account?.accessToken;
    if (!token) {
      return null;
    }
    const payload = decodeAppJwt(token);
    if (payload == null) {
      console.error("Failed to deserialize app JWT (invalid or malformed)");
    }
    return payload;
  },

  /**
   * Raw app JWT string for `Authorization: Bearer` on private API calls (from `account.accessToken`).
   *
   * @returns {string|null}
   */
  getServerAccessToken: () => {
    return get().account?.accessToken || null;
  },

  /**
   * One Zustand update for POST /api/v1/auth/login: JWT/session fields, optional
   * `user_document` linked* → root `linkedOrders` / `linkedJobs` / `linkedTrans`, and optional `application_settings`.
   * The full `user_document` is not persisted on the account slice — pass it to `runPostLoginAccountSync` if needed.
   *
   * @param {object} response - Parsed JSON from auth/login
   * @param {string} [mainCharacterHash] - SSO character hash (`CharacterHash` on the main `Character`); omitted leaves existing value
   */
  applyLoginAuthResponse: (response, mainCharacterHash) => {
    if (!response) return;

    const isFirstTimeLogin = Boolean(response.first_login ?? false);

    const sessionID = getAppJwtSessionID(response.access_token);

    set(
      (state) => {
        const linkedPatch = linkedSetsFromUserDocument(
          response.user_document
        );

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

        return {
          ...state,
          account: {
            ...state.account,
            accountID: response.account_id,
            ...(mainCharacterHash !== undefined && {
              mainCharacterHash: mainCharacterHash || null,
            }),
            accessToken: response.access_token,
            accessTokenEXP: response.expires_at,
            sessionID,
            refreshToken: response.refresh_token,
            refreshTokenEXP:
              response.refresh_token_exp ?? response.refresh_token_expires_at,
            isFirstTimeLogin,
            ...linkedPatch,
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
   * Merge remote `users` collection document (WebSocket) into linked ESI sets; guarded by caller cursors.
   * @param {object} doc
   */
  applyUserDocumentFromRemote: (doc) => {
    if (!doc || typeof doc !== "object") return;
    const linkedPatch = linkedSetsFromUserDocument(doc);
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          ...linkedPatch,
          actions: state.account.actions,
        },
      }),
      false,
      "account/applyUserDocumentFromRemote"
    );
  },

  /**
   * Update server JWT session fields (e.g. after /auth/refresh).
   *
   * @param {object} partial
   * @param {string} [partial.accessToken]
   * @param {number} [partial.accessTokenEXP]
   * @param {string} [partial.refreshToken]
   * @param {number} [partial.refreshTokenEXP]
   */
  setSessionTokens: (partial) => {
    if (!partial) return;
    const nextSessionID =
      partial.sessionID !== undefined
        ? partial.sessionID
        : partial.accessToken !== undefined
          ? getAppJwtSessionID(partial.accessToken)
          : undefined;
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          ...(partial.accessToken !== undefined && {
            accessToken: partial.accessToken,
          }),
          ...(partial.accessTokenEXP !== undefined && {
            accessTokenEXP: partial.accessTokenEXP,
          }),
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
   * Refreshes the app JWT when access is within 15 minutes of expiry.
   * Uses the main character's ESI access token with the server refresh token.
   */
  refreshServerToken: async () => {
    const state = get();
    const mainCharacter = state.account.characters?.find((ch) => ch?.isMainCharacter);
    if (!mainCharacter) return;

    try {
      const { refreshToken, accessToken, accessTokenEXP } = state.account;
      if (!refreshToken) {
        return;
      }
      const exp = getEffectiveAppAccessExpiryUnix(accessToken, accessTokenEXP);
      if (exp == null || exp <= 0) {
        return;
      }
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      const bufferTime = 900; // 15 minutes in seconds
      if (exp >= currentTimeStamp + bufferTime) return;

      const response = await refreshServerJWT(refreshToken, mainCharacter.esiAccessToken);

      await verifyAppAccessTokenWithJwks(response.access_token);

      get().account.actions.setSessionTokens({
        accessToken: response.access_token,
        accessTokenEXP: response.expires_at,
        refreshToken: response.refresh_token,
        refreshTokenEXP:
          response.refresh_token_exp ?? response.refresh_token_expires_at,
      });
    } catch (err) {
      console.error(err.message);
    }
  },

  /**
   * Staggered ESI pass: one character per call (round-robin: main first, then alts).
   * `Character#refreshESIToken` no-ops when the token is still well inside the 15m
   * buffer, so this is cheap on ticks where nothing is due. Used by
   * `useRefreshESITokens` (stagger from `ESI_STAGGER_TARGET_FULL_CYCLE_MINUTES` / n).
   */
  runStaggeredEsiTokenStep: async () => {
    const state = get();
    if (!state.account.isLoggedIn) return;
    const characters = state.account.characters.filter(
      (c) => c && typeof c.refreshESIToken === "function"
    );
    if (characters.length === 0) return;

    const main = characters.find((u) => u.isMainCharacter);
    const alts = characters.filter((u) => u && !u.isMainCharacter);
    const chain = main ? [main, ...alts] : alts;
    const n = chain.length;
    if (n === 0) return;

    const character = chain[esStaggerIndex % n];
    esStaggerIndex++;

    try {
      await character.refreshESIToken();
      await character.getPublicCharacterData();
    } catch (err) {
      console.error("Staggered ESI token refresh failed:", err);
    }

    get().account.actions.updateCharacters([...get().account.characters]);
  },

  /**
   * Periodic (see `DEFAULT_CHARACTER_REFRESH_INTERVAL`) corporation-claims and app
   * JWT maintenance; ESI is kept fresh by the staggered rotation, not a bulk
   * refresh. Used by `useRefreshESITokens`.
   */
  runEsiTokenIntervalMaintenance: async () => {
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
   * then claims + app JWT. Prefer staggered work for the timer; this remains for
   * exceptional cases (e.g. a forced refresh after a bulk import).
   */
  runScheduledTokenRefresh: async () => {
    const state = get();
    if (!state.account.isLoggedIn) return;
    const characters = state.account.characters;

    const mainCharacter = characters.find((u) => u?.isMainCharacter);
    const others = characters.filter((u) => u && !u.isMainCharacter);

    if (mainCharacter) {
      if (typeof mainCharacter.refreshESIToken === "function") {
        try {
          await mainCharacter.refreshESIToken();
          await mainCharacter.getPublicCharacterData();
        } catch (err) {
          console.error("Main character ESI refresh failed:", err);
        }
      } else {
        console.error(
          "Invalid main character object or missing refreshESIToken method"
        );
      }
    }

    await Promise.allSettled(
      others.map(async (character) => {
        if (!character || typeof character.refreshESIToken !== "function") {
          console.error(
            "Invalid character object or missing refreshESIToken method"
          );
          return;
        }
        await character.refreshESIToken();
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

  /**
   * Replaces the cloud-linked ESI refresh token list (Mongo / migration).
   */
  updateLinkedCharacterRefreshTokens: (array) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedCharacterRefreshTokens: array,
          actions: state.account.actions,
        },
      }),
      false,
      "account/updateLinkedCharacterRefreshTokens"
    );
  },

  /**
   * Appends one `{ CharacterHash, rToken }` entry for cloud-linked characters.
   */
  addLinkedCharacterRefreshToken: (token) => {
    set(
      (state) => {
        const row = /** @type {{ CharacterHash?: string, characterHash?: string }} */ (
          token
        );
        const raw =
          typeof row.CharacterHash === "string"
            ? row.CharacterHash
            : typeof row.characterHash === "string"
              ? row.characterHash
              : "";
        const canon = canonicalCharacterHashKey(raw);
        const list = [...state.account.linkedCharacterRefreshTokens];
        const idx = list.findIndex((t) => {
          const tr = /** @type {{ CharacterHash?: string, characterHash?: string }} */ (t);
          const h =
            typeof tr.CharacterHash === "string"
              ? tr.CharacterHash
              : typeof tr.characterHash === "string"
                ? tr.characterHash
                : "";
          return canonicalCharacterHashKey(h) === canon;
        });
        if (idx >= 0) list[idx] = token;
        else list.push(token);
        return {
          ...state,
          account: {
            ...state.account,
            linkedCharacterRefreshTokens: list,
            actions: state.account.actions,
          },
        };
      },
      false,
      "account/addLinkedCharacterRefreshToken"
    );
  },

  /**
   * Sets the full cloud-linked ESI refresh token list.
   */
  setLinkedCharacterRefreshTokens: (array) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedCharacterRefreshTokens: array,
          actions: state.account.actions,
        },
      }),
      false,
      "account/setLinkedCharacterRefreshTokens"
    );
  },

  /**
   * Removes a cloud-linked token by character hash (`CharacterHash` or `characterHash`).
   */
  removeLinkedCharacterRefreshToken: (characterHash) => {
    const drop = canonicalCharacterHashKey(characterHash);
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedCharacterRefreshTokens:
            state.account.linkedCharacterRefreshTokens.filter((token) => {
              const row =
                /** @type {{ CharacterHash?: string, characterHash?: string }} */ (
                  token
                );
              const h =
                typeof row.CharacterHash === "string"
                  ? row.CharacterHash
                  : typeof row.characterHash === "string"
                    ? row.characterHash
                    : "";
              return canonicalCharacterHashKey(h) !== drop;
            }),
          actions: state.account.actions,
        },
      }),
      false,
      "account/removeLinkedCharacterRefreshToken"
    );
  },
});

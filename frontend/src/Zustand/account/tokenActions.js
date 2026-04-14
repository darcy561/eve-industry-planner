/**
 * Zustand actions for app JWT session, login token application, ESI-linked refresh tokens,
 * and scheduled ESI + corporation claims + server JWT refresh.
 *
 * @fileoverview Token and session credential actions on the account slice
 */

import { decodeJwt } from "jose";
import { refreshServerJWT } from "../../Functions/Auth/serverTokens.js";
import updateCorporationClaims from "../../Functions/Endpoints/Pirivate/corporationClaims.js";
import { mergeApplicationSettingsState } from "../applicationSettings/core.js";

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
    try {
      return decodeJwt(token);
    } catch (error) {
      console.error("Failed to deserialize token:", error);
      return null;
    }
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

    const isFirstTimeLogin = Boolean(
      response.firebase_first_login ?? response.first_login ?? false
    );

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
      const { refreshToken, accessTokenEXP } = state.account;
      if (!refreshToken || !accessTokenEXP || accessTokenEXP === 0) {
        return;
      }
      const currentTimeStamp = Math.floor(Date.now() / 1000);
      const bufferTime = 900; // 15 minutes in seconds
      if (accessTokenEXP >= currentTimeStamp + bufferTime) return;

      const response = await refreshServerJWT(refreshToken, mainCharacter.esiAccessToken);

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
   * Interval job: refresh main character ESI first (that access token is used for `refreshServerToken`),
   * then refresh alts in parallel with `Promise.allSettled` (failures are isolated),
   * then POST corporation claims (`/api/v1/auth/claims/corporations`), then refresh app JWT, then persist `characters`.
   * Used by `useRefreshESITokens`.
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
    get().account.actions.updateCharacters([...characters]);
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
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedCharacterRefreshTokens: [
            ...state.account.linkedCharacterRefreshTokens,
            token,
          ],
          actions: state.account.actions,
        },
      }),
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
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          linkedCharacterRefreshTokens:
            state.account.linkedCharacterRefreshTokens.filter(
              (token) =>
                token.CharacterHash !== characterHash &&
                token.characterHash !== characterHash
            ),
          actions: state.account.actions,
        },
      }),
      false,
      "account/removeLinkedCharacterRefreshToken"
    );
  },
});

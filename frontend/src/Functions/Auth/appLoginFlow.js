/**
 * EVE OAuth code vs stored EVE refresh token → app JWT, then a single post-login client path.
 * @fileoverview
 */
import {
  fetchServerJWT,
  refreshServerJWTForLogin,
} from "./serverTokens.js";
import { verifyAppAccessTokenWithJwks } from "./appJwt.js";
import getEveOauthToken from "../EveESI/Character/getEveSSOToken";
import getCharacterFromRefreshToken from "../../Components/Auth/RefreshToken";
import useUsersStore from "../../Zustand/usersStore";
import { emitUserDataUpdate } from "../../Events/loginEvents";
import { buildCorporationObjectFromUserObject } from "../Corporations/buildCorporationObject";
import { runPostLoginAccountSync } from "../../Components/Auth/runPostLoginAccountSync";
import { bootstrapJobGroupsLoginStep } from "../../Components/Auth/bootstrapJobGroupsLoginStep";
import { bootstrapJobDocumentsLoginStep } from "../../Components/Auth/bootstrapJobDocumentsLoginStep.js";
import { bootstrapWatchlistLoginStep } from "../../Components/Auth/bootstrapWatchlistLoginStep.js";
import { upsertCloudStoredEsiRefreshTokens } from "../Endpoints/Pirivate/cloudStoredEsiRefreshTokens.js";
import { decodeJwt } from "jose";
import Character from "../../Classes/character";
import refreshCloudStoredEsiAccessToken from "../EveESI/Character/refreshCloudStoredEsiAccessToken.js";

/**
 * Stores main character ESI refresh in Mongo (encrypted) for cloud accounts and drops client-held material.
 * @param {import("../../Classes/character").default} character
 * @param {object} tokenResponse
 */
async function persistCloudMainEsiRefreshToken(character, tokenResponse) {
  const ud = tokenResponse?.user_document;
  const cloud =
    ud?.userCloudAccounts ??
    ud?.user_cloud_accounts ??
    useUsersStore.getState().applicationSettings?.userCloudAccounts;
  if (!cloud || !character?.CharacterHash) {
    return;
  }
  if (character.esiRefreshToken) {
    const ok = await upsertCloudStoredEsiRefreshTokens([
      {
        CharacterHash: character.CharacterHash,
        rToken: character.esiRefreshToken,
      },
    ]);
    if (ok) {
      try {
        localStorage.removeItem("Auth");
      } catch {
        /* ignore */
      }
      character.esiRefreshToken = "";
    }
  }
}

/**
 * Fresh SSO redirect: `code` from URL → EVE user + `POST /api/v1/auth/login`.
 *
 * @param {string} authCode
 * @returns {Promise<{ character: object, tokenResponse: object }>}
 */
export async function resolveLoginWithEveOauthCode(authCode) {
  const character = await getEveOauthToken(authCode, true);
  if (!character) {
    throw new Error("Unable to Authenticate SSO Token");
  }
  const tokenResponse = await fetchServerJWT(character.esiAccessToken);
  return { character, tokenResponse };
}

/**
 * Cloud cold reload: HttpOnly app refresh cookie + POST …/login-refresh with empty eve_token.
 * Server validates Redis session and refreshes stored ESI from Mongo; client then loads ESI access via cloud-stored endpoint.
 *
 * @returns {Promise<{ character: object, tokenResponse: object, loginAlreadyApplied: boolean }>}
 */
export async function resolveLoginWithCookieCloudResume() {
  const tokenResponse = await refreshServerJWTForLogin(null, "");
  await verifyAppAccessTokenWithJwks(tokenResponse.access_token);
  const plannerPayload = decodeJwt(tokenResponse.access_token);
  const mainHash =
    plannerPayload.character_hash ?? plannerPayload.characterHash;
  if (!mainHash || typeof mainHash !== "string") {
    throw new Error("App JWT missing character_hash");
  }

  useUsersStore.getState().account.actions.applyLoginAuthResponse(
    tokenResponse,
    mainHash
  );

  let esiAccess = tokenResponse.main_character_esi_access_token;
  let esiBundle = null;
  if (!esiAccess || typeof esiAccess !== "string") {
    esiBundle = await refreshCloudStoredEsiAccessToken(mainHash);
    if (esiBundle instanceof Error) {
      throw esiBundle;
    }
    esiAccess = esiBundle.access_token;
  }

  const esiPayload = decodeJwt(esiAccess);
  const character = new Character({
    jwtPayload: esiPayload,
    tokenResponse: esiBundle ?? {
      access_token: esiAccess,
      refresh_token: "",
    },
    isMainCharacter: true,
  });

  await persistCloudMainEsiRefreshToken(character, tokenResponse);

  return {
    character,
    tokenResponse,
    loginAlreadyApplied: true,
  };
}

/**
 * Returning user: EVE `Auth` localStorage refresh token → character, then app JWT (fetch or login-refresh).
 *
 * @param {string} eveClientRefreshToken
 * @returns {Promise<{ character: object, tokenResponse: object }>}
 */
export async function resolveLoginWithEveClientRefreshToken(
  eveClientRefreshToken
) {
  const character = await getCharacterFromRefreshToken(
    eveClientRefreshToken,
    true
  );
  if (character instanceof Error) {
    throw character;
  }
  const existingServerRefreshToken =
    useUsersStore.getState().account.refreshToken;
  const cloudAccounts =
    !!useUsersStore.getState().applicationSettings?.userCloudAccounts;

  let tokenResponse;
  if (existingServerRefreshToken) {
    tokenResponse = await refreshServerJWTForLogin(
      existingServerRefreshToken,
      character.esiAccessToken
    );
  } else if (cloudAccounts) {
    try {
      tokenResponse = await refreshServerJWTForLogin(
        null,
        character.esiAccessToken
      );
    } catch {
      tokenResponse = await fetchServerJWT(character.esiAccessToken);
    }
  } else {
    tokenResponse = await fetchServerJWT(character.esiAccessToken);
  }
  return { character, tokenResponse };
}

/**
 * Verify app JWT, hydrate Zustand, sync corporations, then async bootstrap (watchlist, groups, job docs).
 *
 * @param {object} input
 * @param {import("@tanstack/react-query").QueryClient} input.queryClient
 * @param {Function} input.prefetchMultipleCharacters
 * @param {Function} input.triggerCharacterDataPrefetch
 * @param {object} input.character
 * @param {object} input.tokenResponse
 * @param {boolean} [input.loginAlreadyApplied] - When true, `applyLoginAuthResponse` was already applied (cookie-cloud resume).
 * @returns {Promise<void>}
 */
export async function applyClientSessionAfterAppTokens(input) {
  const {
    queryClient,
    prefetchMultipleCharacters,
    triggerCharacterDataPrefetch,
    character,
    tokenResponse,
    loginAlreadyApplied = false,
  } = input;

  await verifyAppAccessTokenWithJwks(tokenResponse.access_token);
  if (!loginAlreadyApplied) {
    useUsersStore
      .getState()
      .account.actions.applyLoginAuthResponse(
        tokenResponse,
        character.CharacterHash
      );
    await persistCloudMainEsiRefreshToken(character, tokenResponse);
  }
  useUsersStore.getState().account.actions.setLoggedIn(true);

  await character.getPublicCharacterData();
  await buildCorporationObjectFromUserObject(character);

  useUsersStore.getState().account.actions.updateCharacters([character]);
  triggerCharacterDataPrefetch(queryClient, character.CharacterHash);

  emitUserDataUpdate({
    eveLoginComplete: true,
    userArray: [
      {
        CharacterID: character.CharacterID,
        CharacterName: character.CharacterName,
      },
    ],
  });

  useUsersStore.getState().jobData.actions.clearJobArray();

  await runPostLoginAccountSync({
    queryClient,
    prefetchMultipleCharacters,
    userDocument: tokenResponse.user_document,
    linkedCharacters: tokenResponse.linked_characters,
  });

  bootstrapWatchlistLoginStep();
  bootstrapJobGroupsLoginStep();
  bootstrapJobDocumentsLoginStep();
}

/**
 * @typedef {(
 *   | { type: "oauthCode"; authCode: string }
 *   | { type: "eveClientRefresh"; eveClientRefreshToken: string }
 *   | { type: "cookieCloudResume" }
 * )} AppLoginMode
 *
 * @param {object} p
 * @param {import("@tanstack/react-query").QueryClient} p.queryClient
 * @param {Function} p.prefetchMultipleCharacters
 * @param {Function} p.triggerCharacterDataPrefetch
 * @param {AppLoginMode} p.mode
 * @returns {Promise<void>}
 */
export async function runAppLogin(p) {
  const {
    queryClient,
    prefetchMultipleCharacters,
    triggerCharacterDataPrefetch,
    mode,
  } = p;

  const bundle =
    mode.type === "oauthCode"
      ? await resolveLoginWithEveOauthCode(mode.authCode)
      : mode.type === "cookieCloudResume"
        ? await resolveLoginWithCookieCloudResume()
        : await resolveLoginWithEveClientRefreshToken(mode.eveClientRefreshToken);

  await applyClientSessionAfterAppTokens({
    queryClient,
    prefetchMultipleCharacters,
    triggerCharacterDataPrefetch,
    character: bundle.character,
    tokenResponse: bundle.tokenResponse,
    loginAlreadyApplied: Boolean(bundle.loginAlreadyApplied),
  });
}

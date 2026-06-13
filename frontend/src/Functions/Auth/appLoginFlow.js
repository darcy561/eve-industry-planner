/**
 * EVE OAuth code or stored EVE refresh token -> planner session response, then
 * a single post-login client path.
 * @fileoverview
 */
import {
  fetchServerSession,
  refreshServerSessionForLogin,
} from "./serverTokens.js";
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
import { getTabPlannerRefreshToken } from "./tabSessionStorage.js";

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
  const tokenResponse = await fetchServerSession(character.esiAccessToken);
  return { character, tokenResponse };
}

/**
 * Tab reload resume: per-tab refresh token in sessionStorage + POST …/bootstrap.
 * Cloud accounts may omit eve_token (server refreshes ESI from Mongo).
 *
 * @returns {Promise<{ character: object, tokenResponse: object, loginAlreadyApplied: boolean }>}
 */
export async function resolveLoginWithCookieCloudResume() {
  const tabRefresh = getTabPlannerRefreshToken();
  const tokenResponse = await refreshServerSessionForLogin(tabRefresh, "");
  const mainHash =
    tokenResponse.main_character_hash ??
    tokenResponse?.user_document?.mainCharacterHash;
  if (!mainHash || typeof mainHash !== "string") {
    throw new Error("Session response missing main character hash");
  }

  useUsersStore.getState().account.actions.applyLoginAuthResponse(
    tokenResponse,
    mainHash
  );

  const linkedCharacters = Array.isArray(tokenResponse.linked_characters)
    ? tokenResponse.linked_characters
    : [];
  const mainLinked = linkedCharacters.find(
    (row) =>
      row &&
      typeof row.characterHash === "string" &&
      row.characterHash === mainHash &&
      typeof row.access_token === "string" &&
      row.access_token.trim().length > 0
  );
  if (!mainLinked) {
    throw new Error("Session response missing main character ESI access token");
  }
  const esiAccess = mainLinked.access_token;

  const esiPayload = decodeJwt(esiAccess);
  const character = new Character({
    jwtPayload: esiPayload,
    tokenResponse: {
      access_token: mainLinked.access_token,
      token_type: mainLinked.token_type,
      expires_in: mainLinked.expires_in,
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
 * Returning user: EVE `Auth` localStorage refresh token -> character, then planner session fetch/bootstrap.
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
  const tabRefresh = getTabPlannerRefreshToken();
  let tokenResponse;
  if (tabRefresh) {
    try {
      tokenResponse = await refreshServerSessionForLogin(
        tabRefresh,
        character.esiAccessToken
      );
    } catch {
      tokenResponse = await fetchServerSession(character.esiAccessToken);
    }
  } else {
    tokenResponse = await fetchServerSession(character.esiAccessToken);
  }
  return { character, tokenResponse };
}

/**
 * Apply server session response, hydrate Zustand, then async bootstrap.
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

  try {
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
  } finally {
    useUsersStore.getState().account.actions.setPlannerPrivateAuthReady(true);
  }
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

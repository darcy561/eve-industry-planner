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
 * Returning user: EVE `Auth` localStorage token → character, then refresh or login to app JWT.
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
  const existingServerRefreshToken = useUsersStore.getState().account.refreshToken;
  const tokenResponse = existingServerRefreshToken
    ? await refreshServerJWTForLogin(
        existingServerRefreshToken,
        character.esiAccessToken
      )
    : await fetchServerJWT(character.esiAccessToken);
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
 * @returns {Promise<void>}
 */
export async function applyClientSessionAfterAppTokens(input) {
  const {
    queryClient,
    prefetchMultipleCharacters,
    triggerCharacterDataPrefetch,
    character,
    tokenResponse,
  } = input;

  await verifyAppAccessTokenWithJwks(tokenResponse.access_token);
  useUsersStore
    .getState()
    .account.actions.applyLoginAuthResponse(
      tokenResponse,
      character.CharacterHash
    );
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
      : await resolveLoginWithEveClientRefreshToken(mode.eveClientRefreshToken);

  await applyClientSessionAfterAppTokens({
    queryClient,
    prefetchMultipleCharacters,
    triggerCharacterDataPrefetch,
    character: bundle.character,
    tokenResponse: bundle.tokenResponse,
  });
}

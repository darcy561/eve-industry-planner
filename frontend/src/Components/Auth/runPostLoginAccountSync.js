import useUsersStore from "../../Zustand/usersStore";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import { canonicalCharacterHashKey } from "../../Functions/Auth/characterHashCanonical.js";
import {
  hydrateLinkedCharactersFromAccessSessions,
  buildUsersFromRefreshTokens,
  getSystemIndexDataFromUserStructures,
} from "../../Functions/Auth/buildAccountData";
import { clearQueryTimings } from "../../Functions/Debugging/queryWaterfallLogger";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../../Events/loginEvents";

/**
 * Builds userData shape for `buildUsersFromRefreshTokens` + system indexes from the
 * Mongo user row (from login) and current application settings (after `applyLoginAuthResponse`).
 *
 * @param {object|null|undefined} userDocument - `user_document` from POST /api/v1/auth/login
 */
function buildShimUserDataFromMongo(userDocument) {
  const app = useUsersStore.getState().applicationSettings;
  const cloudFromUserDoc =
    userDocument &&
    typeof userDocument === "object" &&
    "userCloudAccounts" in userDocument
      ? !!userDocument.userCloudAccounts
      : app.userCloudAccounts;
  return {
    userCloudAccounts: cloudFromUserDoc,
    settings: {
      userCloudAccounts: cloudFromUserDoc,
      customStructures: {
        manufacturing: app.customStructures.manufacturing,
        reaction: app.customStructures.reaction,
      },
    },
  };
}

/**
 * Runs post-login async work (characters, system indexes) after `applyLoginAuthResponse`
 * has already applied the login payload to the store.
 *
 * Job stage labels come from merged `application_settings.jobStatuses`; accordion expansion
 * is read from localStorage when the planner mounts.
 *
 * @param {object} options
 * @param {import("@tanstack/react-query").QueryClient} options.queryClient
 * @param {Function} options.prefetchMultipleCharacters
 * @param {object|null|undefined} [options.userDocument] - `user_document` from the same login response (not read from the store)
 * @param {object[]|null|undefined} [options.linkedCharacters] - `linked_characters` from auth/login when cloud mode
 */
export async function runPostLoginAccountSync({
  queryClient,
  prefetchMultipleCharacters,
  userDocument,
  linkedCharacters,
}) {
  if (!userDocument) {
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
    return;
  }

  try {
    const userData = buildShimUserDataFromMongo(userDocument);
    const cloudNow = !!userData.userCloudAccounts;
    // Cloud login bundles every Mongo refresh row (including main). Hydrating the main hash
    // here would upsert over `updateCharacters([main])` with `isMainCharacter: false`, leaving
    // no main row and the header avatar stuck on the skeleton.
    let linkedSessionsForHydrate = linkedCharacters;
    if (
      cloudNow &&
      Array.isArray(linkedCharacters) &&
      linkedCharacters.length > 0
    ) {
      const mainCanon = canonicalCharacterHashKey(
        useUsersStore.getState().account.mainCharacterHash
      );
      if (mainCanon) {
        linkedSessionsForHydrate = linkedCharacters.filter((s) => {
          const h = s?.characterHash ?? s?.CharacterHash;
          return canonicalCharacterHashKey(h) !== mainCanon;
        });
      }
    }
    const newUserArray =
      cloudNow &&
      Array.isArray(linkedCharacters) &&
      linkedCharacters.length > 0
        ? await hydrateLinkedCharactersFromAccessSessions(
            linkedSessionsForHydrate
          )
        : await buildUsersFromRefreshTokens(userData);

    const systemIndexResults = await getSystemIndexDataFromUserStructures(
      userData.settings
    );
    if (Object.keys(systemIndexResults).length > 0) {
      useUsersStore.getState().worldData.actions.addSystemIndex(systemIndexResults);
    }

    useUsersStore.getState().account.actions.addCharacters(newUserArray);

    clearQueryTimings();

    const characterHashes = newUserArray.map(({ CharacterHash }) => CharacterHash);
    prefetchMultipleCharacters(queryClient, characterHashes, true).catch((error) => {
      console.error("Error during character data prefetch:", error);
    });

    await checkUserClaims();

    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
  } catch (err) {
    emitLoginError(LOGIN_STEPS.CHARACTER_DATA, err);
    console.error(err);
  }
}

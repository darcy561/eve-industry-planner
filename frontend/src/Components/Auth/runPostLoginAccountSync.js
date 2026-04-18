import useUsersStore from "../../Zustand/usersStore";
import checkUserClaims from "../../Functions/Auth/checkUserClaims";
import {
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
  return {
    userCloudAccounts: app.userCloudAccounts,
    settings: {
      userCloudAccounts: app.userCloudAccounts,
      customStructures: {
        manufacturing: app.customStructures.manufacturing,
        reaction: app.customStructures.reaction,
      },
    },
    refreshTokens: userDocument?.refreshTokens ?? [],
  };
}

/**
 * Runs post-login async work (characters, indexes) after `applyLoginAuthResponse`
 * has already applied the login payload to the store.
 *
 * Job stage labels come from merged `application_settings.jobStatuses`; accordion expansion
 * is read from localStorage when the planner mounts.
 *
 * @param {object} options
 * @param {import("@tanstack/react-query").QueryClient} options.queryClient
 * @param {Function} options.prefetchMultipleCharacters
 * @param {object|null|undefined} [options.userDocument] - `user_document` from the same login response (not read from the store)
 */
export async function runPostLoginAccountSync({
  queryClient,
  prefetchMultipleCharacters,
  userDocument,
}) {
  if (!userDocument) {
    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
    return;
  }

  try {
    const userData = buildShimUserDataFromMongo(userDocument);
    const newUserArray = await buildUsersFromRefreshTokens(userData);

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

    if (userData.userCloudAccounts && newUserArray.length > 0) {
      const normalizedTokens = (userData.refreshTokens || []).map((token) => ({
        CharacterHash: token.CharacterHash || token.characterHash,
        rToken: token.rToken,
      }));
      useUsersStore
        .getState()
        .account.actions.updateLinkedCharacterRefreshTokens(normalizedTokens);
    }

    emitLoginStepComplete(LOGIN_STEPS.CHARACTER_DATA);
  } catch (err) {
    emitLoginError(LOGIN_STEPS.CHARACTER_DATA, err);
    console.error(err);
  }
}

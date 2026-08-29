import useUserStore from "../../Zustand/usersStore";
import updateCorporationClaims from "../Endpoints/Private/corporationClaims";

/**
 * Submits current character ESI access tokens so the backend can refresh
 * account session grants (corporations/alliances).
 *
 * @returns {Promise<void>}
 */
async function checkUserClaims() {
  try {
    const state = useUserStore.getState();
    if (state?.applicationSettings?.userCloudAccounts) {
      // Cloud accounts submit claims-refresh tokens server-side during login/refresh.
      return;
    }

    const esiTokens = useUserStore
      .getState()
      .account.characters.map((character) => character?.esiAccessToken)
      .filter((token) => typeof token === "string" && token.trim().length > 0);
    if (esiTokens.length === 0) return;
    await updateCorporationClaims(esiTokens);
  } catch (error) {
    console.error("Error checking user claims:", error);
  }
}

export default checkUserClaims;

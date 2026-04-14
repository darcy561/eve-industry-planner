import useUserStore from "../../Zustand/usersStore";
import updateCorporationClaims from "../Endpoints/Pirivate/corporationClaims";

/**
 * Checks and updates corporation claims in the server JWT token.
 *
 * Compares corporation IDs from `account.characters` against the current server token
 * claims and triggers a claim update via the API only when the sets differ.
 *
 * Extracts EVE SSO tokens from each character row and submits them to the server, which
 * queries ESI for corporation information and updates JWT claims.
 *
 * @returns {Promise<void>} Promise that resolves when claims are updated or no update is needed
 *
 * @example
 * await checkUserClaims();
 */
async function checkUserClaims() {
  try {
    const token = await useUserStore
      .getState()
      .account.actions.getDeserialisedSerializedServerToken();

    const characterCorporationIds = new Set(
      useUserStore
        .getState()
        .account.characters.map((character) => character.corporation_id)
        .filter((id) => id != null && id !== 0) // Filter out null/undefined/0
        .map((id) => id)
    );

    const tokenCorpIDs = new Set(
      (token.corporations || []).map((id) => Number(id)) // Ensure they're numbers
    );

    const corpIDsMatch =
      characterCorporationIds.size === tokenCorpIDs.size &&
      [...characterCorporationIds].every((id) => tokenCorpIDs.has(id)) &&
      [...tokenCorpIDs].every((id) => characterCorporationIds.has(id));

    // Only update if there are differences (missing or extra corporations)
    if (!corpIDsMatch) {
      const esiTokens = useUserStore
        .getState()
        .account.characters.map((character) => character.esiAccessToken);
      await updateCorporationClaims(esiTokens);
    } else {
    }
  } catch (error) {
    console.error("Error checking user claims:", error);
  }
}

export default checkUserClaims;

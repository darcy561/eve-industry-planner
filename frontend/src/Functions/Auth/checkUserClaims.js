import useUserStore from "../../Zustand/usersStore";
import updateCorporationClaims from "../Endpoints/Pirivate/corporationClaims";

/**
 * Checks and updates user corporation claims in the server JWT token.
 *
 * Compares the corporation IDs from the user array (retrieved from the store) against the
 * current server token claims and triggers a claim update via the API only if there are
 * differences. The comparison ensures that the sets of corporation IDs are identical -
 * checking both that all user corporation IDs exist in the token AND that all token
 * corporation IDs exist in the user array.
 *
 * The function extracts EVE SSO tokens from user objects in the store and submits them
 * to the server endpoint which will query ESI for corporation information and update
 * the user's JWT claims.
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
      .users.actions.getDeserialisedSerializedServerToken();

    // Extract corporation IDs from user array
    const userCorpIDs = new Set(
      useUserStore
        .getState()
        .users.userArray.map((user) => user.corporation_id)
        .filter((id) => id != null && id !== 0) // Filter out null/undefined/0
        .map((id) => id)
    );

    const tokenCorpIDs = new Set(
      (token.corporations || []).map((id) => Number(id)) // Ensure they're numbers
    );

    const corpIDsMatch =
      userCorpIDs.size === tokenCorpIDs.size &&
      [...userCorpIDs].every((id) => tokenCorpIDs.has(id)) &&
      [...tokenCorpIDs].every((id) => userCorpIDs.has(id));

    // Only update if there are differences (missing or extra corporations)
    if (!corpIDsMatch) {
      const dataArray = useUserStore
        .getState()
        .users.userArray.map((user) => user.aToken);
      await updateCorporationClaims(dataArray);
    } else {
    }
  } catch (error) {
    console.error("Error checking user claims:", error);
  }
}

export default checkUserClaims;

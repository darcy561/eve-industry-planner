import useUsersStore from "../../Zustand/usersStore";
import getCorpPublicInfo from "../EveESI/Corporation/getPublicData";
import getCorpDivisions from "../EveESI/Corporation/getDivisions";
import Corporation from "../../Classes/corporation";

/**
 * Builds a corporation object from a user object, fetching public data and divisions.
 * Checks if a corporation object already exists and either creates a new one or adds the user as a member.
 *
 * Callers bringing a character into an account want its alliance too — reach for
 * `buildCharacterAffiliations` rather than this and the alliance build in sequence.
 *
 * @param {Object} userObject - User object containing corporation_id and CharacterHash
 * @returns {Promise<Object|null>} the corporation the character is in, for the alliance lookup that
 *   follows it; null when it could not be built
 */
export async function buildCorporationObjectFromUserObject(userObject) {
  const { getCorporation, addCorporation } =
    useUsersStore.getState().account.actions;
  try {
    if (!getCorporation(userObject.corporation_id)) {
      const publicData = await getCorpPublicInfo(userObject);
      const corporationDivisions = await getCorpDivisions(userObject);

      const corporation = new Corporation(
        userObject,
        publicData,
        corporationDivisions,
      );
      addCorporation(corporation);
      return corporation;
    }

    const corporation = getCorporation(userObject.corporation_id);
    corporation.addMember(userObject.CharacterHash);
    addCorporation(corporation);
    return corporation;
  } catch (err) {
    console.error(err);
    return null;
  }
}

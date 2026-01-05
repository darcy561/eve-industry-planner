import useUsersStore from "../../Zustand/usersStore";
import getCorpPublicInfo from "../EveESI/Corporation/getPublicData";
import getCorpDivisions from "../EveESI/Corporation/getDivisions";
import Corporation from "../../Classes/corporationConstructor";

/**
 * Builds a corporation object from a user object, fetching public data and divisions.
 * Checks if a corporation object already exists and either creates a new one or adds the user as a member.
 * 
 * @param {Object} userObject - User object containing corporation_id and CharacterHash
 * @returns {Promise<void>} Promise that resolves when corporation object is built and stored
 * 
 * @example
 * const user = {
 *   corporation_id: 123456,
 *   CharacterHash: "user_hash_here"
 * };
 * await buildCorporationObjectFromUserObject(user);
 */
export async function buildCorporationObjectFromUserObject(userObject) {
    const { checkForExistingCorporationObject, addCorporationObject, getCorporationObject } = useUsersStore.getState().users.actions;
    try {
        if (!checkForExistingCorporationObject(userObject.corporation_id)) {

            const publicData = await getCorpPublicInfo(userObject)
            const corporationDivisions = await getCorpDivisions(userObject)

            const corporationObject = new Corporation(userObject, publicData, corporationDivisions)
            addCorporationObject(corporationObject)
        } else {
            const corporationObject = getCorporationObject(userObject.corporation_id)

            corporationObject.addMember(userObject.CharacterHash)
            addCorporationObject(corporationObject)
        }

    } catch (err) {
        console.error(err)
    }

}
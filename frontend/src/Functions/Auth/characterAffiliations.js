import { buildCorporationObjectFromUserObject } from "../Corporations/buildCorporationObject";
import { buildAllianceObjectFromCorporation } from "../Alliances/buildAllianceObject";

/**
 * Resolves who a character is affiliated with, and puts what it finds in the store.
 *
 * The three lookups are one act and have to happen in this order: a character's public data is
 * where its corporation id comes from, and the corporation's public data is where its alliance id
 * comes from. Every surface that brings a character into an account — login, a resumed session, a
 * linked character imported from the Accounts page — needs all three, and each used to write the
 * sequence out for itself, which is how a new step gets added to four of the five.
 *
 * Nothing is fetched twice: a corporation or alliance the account already holds gains this
 * character and is not asked about again.
 *
 * @param {import("../../Classes/character").default} character
 * @returns {Promise<void>}
 */
export async function buildCharacterAffiliations(character) {
  await character.getPublicCharacterData();
  const corporation = await buildCorporationObjectFromUserObject(character);
  if (corporation) {
    await buildAllianceObjectFromCorporation(corporation);
  }
}

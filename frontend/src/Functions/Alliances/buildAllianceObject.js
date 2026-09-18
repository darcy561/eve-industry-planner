import useUsersStore from "../../Zustand/usersStore";
import getAlliancePublicInfo from "../EveESI/Alliance/getPublicData";
import Alliance from "../../Classes/alliance";

/**
 * Ensures the account holds an `Alliance` for a corporation's alliance.
 *
 * Called from the corporation build rather than from login itself: which alliance a character is in
 * is not on the character, it is on the corporation's public data, so there is nothing to ask about
 * until that has arrived.
 *
 * @param {object} corporation - a `Corporation` instance
 * @returns {Promise<void>}
 */
export async function buildAllianceObjectFromCorporation(corporation) {
  const allianceID = corporation?.alliance_id;
  if (!allianceID) return;

  const { getAlliance, addAlliance } = useUsersStore.getState().account.actions;

  try {
    const held = getAlliance(allianceID);
    if (held) {
      held.addCorporation(corporation.corporation_id);
      addAlliance(held);
      return;
    }

    const publicData = await getAlliancePublicInfo(allianceID);
    addAlliance(new Alliance(corporation, publicData));
  } catch (err) {
    console.error(err);
  }
}

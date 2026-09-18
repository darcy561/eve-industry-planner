import useUsersStore from "../../Zustand/usersStore";

/**
 * Whose levels a setup's figures are quoted at.
 *
 * A setup names the character it was planned for, which on a shared planner is
 * another member's — one this account holds no skills for, so reading them
 * yields an empty map and quotes the job as though nobody had trained anything.
 * The reader's own main is the only honest answer to a question that can only
 * be about them.
 *
 * @param {{selectedCharacter?: string}|null} setupObject
 * @returns {string} A character hash
 */
export function quotedCharacterHash(setupObject) {
  const { findCharacterByHash, getMainCharacterHash } =
    useUsersStore.getState().account.actions;
  const selectedCharacter = setupObject?.selectedCharacter;

  if (selectedCharacter && findCharacterByHash(selectedCharacter)) {
    return selectedCharacter;
  }
  return getMainCharacterHash();
}

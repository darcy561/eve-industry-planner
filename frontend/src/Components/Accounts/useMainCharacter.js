import useUsersStore from "../../Zustand/usersStore";

/**
 * The character an account signs in as, and what to call it.
 *
 * The roster is the authority; the stored name is what a session that has not built the roster yet
 * still knows, which is why both surfaces that introduce an account read it the same way.
 *
 * @returns {{character: object|undefined, name: string}}
 */
export function useMainCharacter() {
  const character = useUsersStore((state) =>
    state.account.actions.getMainCharacter(),
  );
  const storedName = useUsersStore((state) =>
    state.account.actions.getMainCharacterName(),
  );

  return { character, name: character?.CharacterName ?? storedName ?? "—" };
}

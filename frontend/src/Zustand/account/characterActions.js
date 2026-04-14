/**
 * Zustand actions for `account.characters` — logged-in EVE character rows (`Character` instances;
 * main row has `isMainCharacter: true`).
 *
 * @fileoverview Character list mutations and lookups on the account slice
 */

/** @param {Function} set @param {Function} get */
export const characterActions = (set, get) => ({

  getMainCharacter: () => {
    return get().account.characters?.find((ch) => ch.isMainCharacter) || null;
  },

  getMainCharacterName: () => {
    return get().account.characters?.find((ch) => ch.isMainCharacter)?.CharacterName || null;
  },

  findCharacterByHash: (characterHash) => {
    const { characters } = get().account;
    return (
      characters?.find((ch) => ch.CharacterHash === characterHash) || null
    );
  },

  findCharacterById: (characterID) => {
    const { characters } = get().account;
    return (
      characters?.find((ch) => ch.CharacterID === characterID) || null
    );
  },

  matchCharacterByIDorCorporationID: (id, isCorporation) => {
    const { characters } = get().account;
    return (
      characters?.find((ch) =>
        isCorporation ? ch.CorporationID === id : ch.CharacterID === id
      ) || null
    );
  },

  addCharacter: (character) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          characters: [...state.account.characters, character],
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/addCharacter"
    );
  },

  removeCharacter: (character) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          characters: state.account.characters.filter(
            (ch) => ch.CharacterHash !== character.CharacterHash
          ),
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/removeCharacter"
    );
  },

  updateCharacters: (characters) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          characters,
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/updateCharacters"
    );
  },

  addCharacters: (characters) => {
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          characters: [...state.account.characters, ...characters],
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/addCharacters"
    );
  },
});

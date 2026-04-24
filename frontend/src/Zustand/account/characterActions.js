/**
 * Zustand actions for `account.characters` — logged-in EVE character rows (`Character` instances;
 * main row has `isMainCharacter: true`).
 *
 * @fileoverview Character list mutations and lookups on the account slice
 */

import { canonicalCharacterHashKey } from "../../Functions/Auth/characterHashCanonical.js";

/**
 * Appends characters, replacing any existing row with the same canonical CharacterHash.
 * Needed when realtime reconcile and post-login both hydrate linked alts from the same tokens.
 *
 * @param {unknown[]} existing
 * @param {unknown[]} incoming
 */
function upsertCharactersByCanonicalHash(existing, incoming) {
  const next = [...existing];
  const indexByCanon = new Map();
  for (let i = 0; i < next.length; i++) {
    const ch = next[i];
    const k =
      ch && typeof ch === "object"
        ? canonicalCharacterHashKey(
            /** @type {{ CharacterHash?: string }} */ (ch).CharacterHash
          )
        : "";
    if (k) indexByCanon.set(k, i);
  }
  for (const row of incoming) {
    const k =
      row && typeof row === "object"
        ? canonicalCharacterHashKey(
            /** @type {{ CharacterHash?: string }} */ (row).CharacterHash
          )
        : "";
    if (!k) continue;
    const idx = indexByCanon.get(k);
    if (idx !== undefined) {
      next[idx] = row;
    } else {
      indexByCanon.set(k, next.length);
      next.push(row);
    }
  }
  return next;
}

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
          characters: upsertCharactersByCanonicalHash(
            state.account.characters,
            [character]
          ),
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/addCharacter"
    );
  },

  removeCharacter: (character) => {
    const drop = canonicalCharacterHashKey(character.CharacterHash);
    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          characters: state.account.characters.filter(
            (ch) => canonicalCharacterHashKey(ch.CharacterHash) !== drop
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
          characters: upsertCharactersByCanonicalHash(
            state.account.characters,
            characters
          ),
          actions: state.account.actions,
        },
      }),
      false,
      "account/characters/addCharacters"
    );
  },
});

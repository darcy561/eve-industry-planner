/**
 * Zustand actions for `account.corporations` — `Corporation` class instances.
 *
 * @fileoverview Corporation list mutations and lookups on the account slice
 */

/** @param {number|string} a @param {number|string} b */
function sameCorporationId(a, b) {
  return Number(a) === Number(b);
}

/** @param {Array} corporations @param {number|string} corporationID */
function findCorporationIndex(corporations, corporationID) {
  return corporations.findIndex((c) =>
    sameCorporationId(c.corporation_id, corporationID)
  );
}

/** @param {Function} set @param {Function} get */
export const corporationsActions = (set, get) => ({
  getCorporation: (corporationID) => {
    const { corporations } = get().account;
    const idx = findCorporationIndex(corporations, corporationID);
    return idx >= 0 ? corporations[idx] : null;
  },

  getMainCorporation: () => {
    const mainCharacter = get().account.actions.getMainCharacter();
    return get().account.actions.getCorporation(mainCharacter?.corporation_id);
  },

  addCorporation: (corporation) => {
    set(
      (state) => {
        const id = corporation.corporation_id;
        const prev = state.account.corporations;
        const idx = findCorporationIndex(prev, id);
        const next =
          idx >= 0
            ? prev.map((c, i) => (i === idx ? corporation : c))
            : [...prev, corporation];
        return {
          ...state,
          account: {
            ...state.account,
            corporations: next,
            actions: state.account.actions,
          },
        };
      },
      false,
      "account/corporations/addCorporation"
    );
  },

  removeCharacterFromCorporations: (characterHash) => {
    const state = get();
    const nextList = [...state.account.corporations];

    for (let i = nextList.length - 1; i >= 0; i--) {
      const corp = nextList[i];
      if (corp.members?.includes(characterHash)) {
        corp.removeMember(characterHash);
      }
      if (corp.members?.length === 0) {
        nextList.splice(i, 1);
      }
    }

    set(
      (state) => ({
        ...state,
        account: {
          ...state.account,
          corporations: nextList,
          actions: state.account.actions,
        },
      }),
      false,
      "account/corporations/removeCharacterFromCorporations"
    );
  },

  setCorporationOffices: (corporationID, assetsArray) => {
    const state = get();
    const idx = findCorporationIndex(state.account.corporations, corporationID);
    if (idx < 0) return;

    const corp = state.account.corporations[idx];
    corp.addOfficeLocations(assetsArray);

    set(
      (s) => ({
        ...s,
        account: {
          ...s.account,
          corporations: s.account.corporations.map((c, i) =>
            i === idx ? corp : c
          ),
          actions: s.account.actions,
        },
      }),
      false,
      "account/corporations/setCorporationOffices"
    );
  },
});

/**
 * Zustand actions for `account.alliances` — `Alliance` class instances.
 *
 * @fileoverview Alliance list mutations and lookups on the account slice
 */

/** @param {number|string} a @param {number|string} b */
function sameAllianceId(a, b) {
  return Number(a) === Number(b);
}

/** @param {Array} alliances @param {number|string} allianceID */
function findAllianceIndex(alliances, allianceID) {
  return alliances.findIndex((a) => sameAllianceId(a.alliance_id, allianceID));
}

/** @param {Function} set @param {Function} get */
export const alliancesActions = (set, get) => ({
  getAlliance: (allianceID) => {
    const { alliances } = get().account;
    const idx = findAllianceIndex(alliances, allianceID);
    return idx >= 0 ? alliances[idx] : null;
  },

  addAlliance: (alliance) => {
    set(
      (state) => {
        const prev = state.account.alliances;
        const idx = findAllianceIndex(prev, alliance.alliance_id);
        const next =
          idx >= 0
            ? prev.map((a, i) => (i === idx ? alliance : a))
            : [...prev, alliance];
        return {
          account: {
            ...state.account,
            alliances: next,
          },
        };
      },
      false,
      "account/alliances/addAlliance",
    );
  },

  /**
   * Drops a corporation from whatever alliance holds it, and the alliance with it once nothing is
   * left in it.
   *
   * An account reaches an alliance only through a corporation it is in, so an alliance whose last
   * corporation has gone is an alliance the account can no longer see.
   *
   * @param {number|string} corporationID
   */
  removeCorporationFromAlliances: (corporationID) => {
    const state = get();
    const next = [];

    for (const alliance of state.account.alliances) {
      alliance.removeCorporation(corporationID);
      if (alliance.corporations.length > 0) next.push(alliance);
    }

    set(
      (s) => ({
        account: {
          ...s.account,
          alliances: next,
        },
      }),
      false,
      "account/alliances/removeCorporationFromAlliances",
    );
  },
});

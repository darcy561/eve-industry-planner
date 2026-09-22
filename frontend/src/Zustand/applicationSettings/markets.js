/**
 * @fileoverview The markets an account has saved for itself.
 *
 * Only its own: a market an organisation shares is stored on that
 * organisation's settings and is written through `plannerSettings`. Both take a
 * transform rather than one action per edit, so what a change does to a lane is
 * decided in one place whoever saved the market — `marketWriter`, which is also
 * what picks the document.
 */

export const marketActions = (set) => ({
  /**
   * Applies a change to the account's own markets.
   *
   * @param {(lane: object[]) => object[]} change - from `marketWriter`
   * @returns {void}
   */
  writeMarketLocations: (change) => {
    if (typeof change !== "function") return;

    set(
      (state) => ({
        applicationSettings: {
          ...state.applicationSettings,
          marketLocations: change(
            state.applicationSettings.marketLocations ?? [],
          ),
        },
      }),
      false,
      "writeMarketLocations",
    );
  },
});

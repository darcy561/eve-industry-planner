import { useMemo } from "react";

import { allMarketSources } from "../../Functions/MarketData/marketSources";

/**
 * Every market a price may be asked for.
 *
 * A hook rather than a bare call so that the day reader-saved sources arrive,
 * a surface offering markets re-renders when the reader adds one — the change
 * lands here and in `allMarketSources`, not in the surfaces.
 *
 * @returns {import("../../Functions/MarketData/marketSources").MarketSource[]}
 */
export function useMarketSources() {
  return useMemo(() => allMarketSources(), []);
}

/**
 * The registry for a caller outside render — a class method, a reducer, a
 * helper a component hands a value to. The same list the hooks read.
 *
 * @returns {import("../../Functions/MarketData/marketSources").MarketSource[]}
 */
export function readMarketSources() {
  return allMarketSources();
}

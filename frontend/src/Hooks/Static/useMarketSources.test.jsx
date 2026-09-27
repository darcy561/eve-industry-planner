import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import GLOBAL_CONFIG from "../../global-config-app";
import { allMarketSources } from "../../Functions/MarketData/registry/marketSources.js";
import { useMarketSources } from "./useMarketSources";

describe("reading the market registry", () => {
  it("answers the registry a caller outside render reads", () => {
    const { result } = renderHook(() => useMarketSources());

    expect(result.current).toEqual(allMarketSources());
    expect(result.current.map((source) => source.id)).toEqual(
      GLOBAL_CONFIG.MARKET_OPTIONS.map((hub) => hub.id),
    );
  });

  // The hook memoises, so a surface reading it does not rebuild its options on
  // every render.
  it("holds the same list across renders", () => {
    const { result, rerender } = renderHook(() => useMarketSources());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

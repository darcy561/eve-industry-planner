import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import GLOBAL_CONFIG from "../../global-config-app";
import { readMarketSources, useMarketSources } from "./useMarketSources";

describe("reading the market registry", () => {
  // The two entry points exist because a class method and a reducer cannot call
  // a hook. They must answer with the same registry, or a figure and the label
  // beside it could disagree about which markets exist.
  it("answers the same whether a caller is rendering or not", () => {
    const { result } = renderHook(() => useMarketSources());

    expect(result.current).toEqual(readMarketSources());
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

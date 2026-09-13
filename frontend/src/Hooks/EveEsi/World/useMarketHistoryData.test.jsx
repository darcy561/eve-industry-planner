import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, historyRows } = vi.hoisted(() => ({
  store: { account: { characters: [] } },
  historyRows: { current: [] },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Functions/EveESI/World/getMarketHistory", () => ({
  default: async () => ({ data: historyRows.current }),
}));

vi.mock("../../App/useESIRateLimiting", () => ({
  default: () => ({ isRateLimited: () => false, getWaitTime: () => 0 }),
}));

vi.mock("../../../Functions/EveESI/World/getUniverseNames", () => ({
  default: async (ids) => ids.map((id) => ({ id, name: `Region ${id}` })),
}));

import { useMarketHistoryData } from "./useMarketHistoryData";
import { testQueryClientCollapsingRetries } from "../../../tests/queryClients.js";

const THE_FORGE = 10000002;

function render(typeID, location) {
  const client = testQueryClientCollapsingRetries();
  return renderHook(() => useMarketHistoryData(typeID, location), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  store.account = {
    characters: [{ CharacterHash: "main" }],
    actions: { getMainCharacter: () => ({ CharacterHash: "main" }) },
  };
  historyRows.current = [];
});

describe("the market history a chart renders", () => {
  // An item that has never traded in a region still has a region, and the chart says which one it
  // found nothing in — it read "Unknown Region" while the name was withheld until rows arrived.
  it("names the region when there is no history at all", async () => {
    const { result } = render(34, { regionID: THE_FORGE });

    await waitFor(() =>
      expect(result.current.worldData[THE_FORGE]?.name).toBe(
        `Region ${THE_FORGE}`,
      ),
    );
    expect(result.current.marketHistory).toEqual([]);
  });

  it("asks for no name when there is no region to name", async () => {
    const { result } = render(34, {});

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldData).toEqual({});
  });
});

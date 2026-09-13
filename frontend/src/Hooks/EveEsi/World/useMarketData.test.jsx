import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, structureAsks, marketRows } = vi.hoisted(() => ({
  store: { account: { characters: [] } },
  structureAsks: [],
  marketRows: { current: [] },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Functions/EveESI/World/getMarketData", () => ({
  default: async () => ({ data: marketRows.current, totalPages: 1 }),
}));

vi.mock("../../App/useESIRateLimiting", () => ({
  default: () => ({ isRateLimited: () => false, getWaitTime: () => 0 }),
}));

vi.mock("../../../Functions/EveESI/World/getUniverseNames", () => ({
  default: async (ids) => ids.map((id) => ({ id, name: `Station ${id}` })),
}));

// The structure answers for one character only — the alt. Asking as the main alone is what used to
// leave it as "No Access To Location".
vi.mock("../../../Functions/EveESI/World/getCitadelData", () => ({
  fetchStructureName: async (id, character) => {
    structureAsks.push(character.CharacterHash);
    if (character.CharacterHash !== "alt") return { refused: true };
    return {
      refused: false,
      name: { id, name: "Alt's Sotiyo", resolutionStatus: "resolved" },
    };
  },
  communityNameOrRefusal: async (id) => ({
    id,
    name: `No Access To Location - ${id}`,
    resolutionStatus: "no_access",
  }),
}));

import { useMarketData } from "./useMarketData";
import { testQueryClientCollapsingRetries } from "../../../tests/queryClients.js";

const THE_FORGE = 10000002;
const JITA = 60003760;
const SOTIYO = 1035466617946;

function render(typeID, location) {
  const client = testQueryClientCollapsingRetries();
  return renderHook(() => useMarketData(typeID, location), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  store.account = {
    characters: [{ CharacterHash: "main" }, { CharacterHash: "alt" }],
    actions: { getMainCharacter: () => ({ CharacterHash: "main" }) },
  };
  structureAsks.length = 0;
  marketRows.current = [];
});

describe("the market data a panel renders", () => {
  // Stage D's bar: this panel resolved names as the main character alone, so a structure only an alt
  // could dock at came back refused — and that refusal was written where every other surface read it.
  it("names a structure only an alt can see", async () => {
    marketRows.current = [
      { order_id: 1, location_id: SOTIYO, system_id: 30000142, price: 10 },
    ];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[SOTIYO]?.name).toBe("Alt's Sotiyo"),
    );
    expect(structureAsks).toEqual(["main", "alt"]);
  });

  it("names the stations and systems its orders sit in", async () => {
    marketRows.current = [
      { order_id: 1, location_id: JITA, system_id: 30000142, price: 10 },
    ];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[JITA]?.name).toBe(`Station ${JITA}`),
    );
    // The region and the system come from the same bulk lookup as the station.
    expect(result.current.worldData[THE_FORGE]?.name).toBe(
      `Station ${THE_FORGE}`,
    );
  });

  // An empty market still has a region, and the panel says which one it found nothing in.
  it("names the region when no orders came back", async () => {
    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[THE_FORGE]?.name).toBe(
        `Station ${THE_FORGE}`,
      ),
    );
    // Nothing was asked of a character: an empty market names no structures.
    expect(structureAsks).toHaveLength(0);
  });
});

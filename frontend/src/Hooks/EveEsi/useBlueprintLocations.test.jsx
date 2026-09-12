import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const {
  store,
  characterRows,
  corporationRows,
  gate,
  failCorporation,
  resolved,
  failing,
} = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
  },
  resolved: { current: {} },
  failing: { current: new Set() },
  characterRows: new Map(),
  corporationRows: new Map(),
  gate: { current: null },
  failCorporation: { current: false },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: (characterHash) => ({
    queryKey: ["characterAssets", characterHash],
    queryFn: async () => characterRows.get(characterHash) ?? [],
    enabled: true,
  }),
}));

vi.mock("../React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: (memberHash) => ({
    queryKey: ["corporationAssets", memberHash],
    queryFn: async () => {
      // The largest collection the app fetches, and the last to arrive.
      if (gate.current) await gate.current;
      if (failCorporation.current) throw new Error("access forbidden");
      return corporationRows.get(memberHash) ?? [];
    },
    enabled: true,
  }),
}));

vi.mock("../../Functions/EveESI/World/nameLoader", () => ({
  // Anything these tests do not seed an answer for is a location ESI has no name for, which is a
  // settled answer rather than a failure to retry. An id in `failing` is that other case: a lookup
  // that did not settle, which throws and is never cached.
  requestName: async (id) => {
    if (failing.current.has(id)) throw new Error(`could not reach ${id}`);
    return resolved.current[id] ?? { id, resolutionStatus: "unnamed" };
  },
}));

import useBlueprintLocations from "./useBlueprintLocations";
import buildBlueprintRows from "../../Functions/Blueprints/buildBlueprintRows";
import {
  JITA_STATION_ID,
  RAITARU_STRUCTURE_ID,
} from "../../tests/assetFixtures";

const CHARACTER_BLUEPRINT = 7001;
const CORPORATION_BLUEPRINT = 7002;

const blueprints = buildBlueprintRows(
  [
    {
      item_id: CHARACTER_BLUEPRINT,
      type_id: 686,
      location_id: JITA_STATION_ID,
      location_flag: "Hangar",
      quantity: -1,
      material_efficiency: 10,
      time_efficiency: 20,
      runs: -1,
    },
    {
      item_id: CORPORATION_BLUEPRINT,
      type_id: 686,
      location_id: 8001,
      location_flag: "CorpSAG1",
      quantity: -1,
      material_efficiency: 10,
      time_efficiency: 20,
      runs: -1,
    },
  ],
  [],
);

function render() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
    },
  });
  return renderHook(() => useBlueprintLocations(blueprints), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  store.account = {
    characters: [{ CharacterHash: "hash-a", corporation_id: 98000001 }],
    corporations: [{ corporation_id: 98000001, members: ["hash-a"] }],
  };
  resolved.current = {
    [JITA_STATION_ID]: { id: JITA_STATION_ID, name: "Jita IV-4" },
    [RAITARU_STRUCTURE_ID]: {
      id: RAITARU_STRUCTURE_ID,
      name: "Abbey Raitaru",
    },
  };
  failing.current = new Set();
  characterRows.clear();
  characterRows.set("hash-a", [
    {
      item_id: CHARACTER_BLUEPRINT,
      type_id: 686,
      quantity: 1,
      location_flag: "Hangar",
      location_id: JITA_STATION_ID,
      location_type: "station",
    },
  ]);
  corporationRows.clear();
  corporationRows.set("hash-a", [
    {
      item_id: 8001,
      type_id: 27,
      quantity: 1,
      location_flag: "OfficeFolder",
      location_id: RAITARU_STRUCTURE_ID,
      location_type: "item",
    },
    {
      item_id: CORPORATION_BLUEPRINT,
      type_id: 686,
      quantity: 1,
      location_flag: "CorpSAG1",
      location_id: 8001,
      location_type: "item",
    },
  ]);
  gate.current = null;
  failCorporation.current = false;
});

describe("what each blueprint's location is called", () => {
  // The library holds its results back on this rather than drawing labels in one at a time, so it
  // must not read as settled while a corporation's assets are still coming.
  it("reports itself loading until every scope's assets are in", async () => {
    let landCorporation;
    gate.current = new Promise((resolve) => {
      landCorporation = resolve;
    });

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.names.size).toBe(0);

    landCorporation();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.names.get(CHARACTER_BLUEPRINT)).toBe("Jita IV-4");
    expect(result.current.names.get(CORPORATION_BLUEPRINT)).toBe(
      "Abbey Raitaru",
    );
  });

  // Without this the page renders as though every blueprint simply had no location.
  it("reports a failure rather than an absence of locations", async () => {
    failCorporation.current = true;

    const { result } = render();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it("settles with nothing to say when the account has no characters", async () => {
    store.account = { characters: [], corporations: [] };

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.names.size).toBe(0);
  });

  // The library's picker is fed from here and the asset dropdowns are fed from `useAssetLocations`.
  // Both reach the same component, so a structure nobody can read has to be offered the same way in
  // The chosen place is held in the URL, so a place missing from this list reads as no choice at all
  // while the library stays narrowed to it.
  it("offers a place whose name could not be resolved, saying so", async () => {
    failing.current.add(RAITARU_STRUCTURE_ID);

    const { result } = render();

    await waitFor(() =>
      expect(
        result.current.places.find(
          ({ locationId }) => locationId === RAITARU_STRUCTURE_ID,
        ),
      ).toMatchObject({ name: "Name unavailable", unresolved: true }),
    );
  });

  // each: named after the readable places, saying it cannot be read.
  it("offers a location nobody can read, last and marked", async () => {
    resolved.current[RAITARU_STRUCTURE_ID] = {
      id: RAITARU_STRUCTURE_ID,
      name: `No Access To Location - ${RAITARU_STRUCTURE_ID}`,
      resolutionStatus: "no_access",
    };

    const { result } = render();

    await waitFor(() => expect(result.current.places.length).toBe(2));
    expect(result.current.places.map(({ locationId }) => locationId)).toEqual([
      JITA_STATION_ID,
      RAITARU_STRUCTURE_ID,
    ]);
    expect(result.current.places[1].unreadable).toBe(true);
  });

  it("says nothing for a blueprint the assets do not cover", async () => {
    characterRows.set("hash-a", []);
    corporationRows.set("hash-a", []);

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.names.size).toBe(0);
  });
});

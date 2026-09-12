import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const {
  store,
  characterRows,
  containerNameCalls,
  nameAsks,
  resolved,
  failing,
} = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
  },
  characterRows: new Map(),
  containerNameCalls: [],
  nameAsks: [],
  resolved: { current: {} },
  failing: { current: new Set() },
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
  corporationAssetsQuery: () => ({
    queryKey: ["corporationAssets"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: () => ({
    queryKey: ["characterBlueprints"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../React Query/Corporation/blueprints", () => ({
  corporationBlueprintsQueryKey: "corporationBlueprints",
  corporationBlueprintsQuery: () => ({
    queryKey: ["corporationBlueprints"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../App/useCachedData", () => ({
  useCachedData: () => ({
    data: { 34: { name: "Tritanium" }, 3465: { name: "Container" } },
    isLoading: false,
  }),
}));

vi.mock("../../Functions/EveESI/World/nameLoader", () => ({
  // Anything these tests do not seed an answer for is a location ESI has no name for, which is a
  // settled answer rather than a failure to retry. An id in `failing` is the other case: a lookup
  // that did not settle, which throws and is never cached.
  requestName: async (id) => {
    nameAsks.push(id);
    if (failing.current.has(id)) throw new Error(`could not reach ${id}`);
    return resolved.current[id] ?? { id, resolutionStatus: "unnamed" };
  },
}));

vi.mock("../../Functions/EveESI/World/getAssetLocationNames", () => ({
  default: async (character, itemIds) => {
    containerNameCalls.push([...itemIds]);
    return new Map([[1002, { item_id: 1002, name: "Ore Crate" }]]);
  },
}));

import useAssetTree from "./useAssetTree";
import { ASSET_SCOPE } from "./useAssetIndex";
import { BLUEPRINT_SCOPE } from "./useBlueprintIndex";
import {
  characterAssetRows,
  JITA_STATION_ID,
  RAITARU_STRUCTURE_ID,
} from "../../tests/assetFixtures";

const CHARACTER = { CharacterHash: "hash-a", CharacterID: 2114000001 };
const ASSETS = { scope: ASSET_SCOPE.CHARACTER, id: "hash-a" };
const BLUEPRINTS = { scope: BLUEPRINT_SCOPE.CHARACTER, id: "hash-a" };
const DELIVERIES = ["Deliveries"];
const OTHER_TABS = ["Deliveries", "AssetSafety"];

function render(request) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
    },
  });
  return renderHook(() => useAssetTree(request), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  store.account = { characters: [CHARACTER], corporations: [] };
  resolved.current = {
    [JITA_STATION_ID]: { id: JITA_STATION_ID, name: "Jita IV-4" },
    [RAITARU_STRUCTURE_ID]: {
      id: RAITARU_STRUCTURE_ID,
      name: "Abbey Raitaru",
    },
  };
  characterRows.clear();
  characterRows.set("hash-a", characterAssetRows);
  containerNameCalls.length = 0;
  nameAsks.length = 0;
  failing.current = new Set();
});

describe("the tree one asset view renders", () => {
  it("orders its locations by name and puts the unnamed last", async () => {
    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      excludeRootFlags: OTHER_TABS,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const names = result.current.locations.map(({ name }) => name);
    expect(names.slice(0, 2)).toEqual(["Abbey Raitaru", "Jita IV-4"]);
    // The ship holding item 1010 is in space and has no name to resolve.
    expect(names.at(-1)).toBe("");
  });

  // A failure is never cached, so the location has no name and never will this session. The assets
  // are still there, so the place is listed saying it could not be named rather than dropped.
  it("keeps a location whose name could not be resolved", async () => {
    failing.current = new Set([RAITARU_STRUCTURE_ID]);

    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      excludeRootFlags: OTHER_TABS,
    });

    await waitFor(() =>
      expect(
        result.current.locations.find(
          ({ locationId }) => locationId === RAITARU_STRUCTURE_ID,
        ),
      ).toMatchObject({ name: "Name unavailable", unresolved: true }),
    );
  });

  it("shows only the compartment it was asked for", async () => {
    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      rootFlags: DELIVERIES,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.locations).toHaveLength(1);
    expect(
      result.current.locations[0].rows.map(({ itemId }) => itemId).sort(),
    ).toEqual([1006, 1007]);
  });

  it("asks for the names of the containers it holds", async () => {
    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      excludeRootFlags: OTHER_TABS,
    });

    await waitFor(() => expect(containerNameCalls).toHaveLength(1));
    expect(containerNameCalls[0]).toEqual([1002, 1004, 1007]);
    await waitFor(() =>
      expect(result.current.containerNames.get(1002)?.name).toBe("Ore Crate"),
    );
  });

  it("shows nothing while it is not enabled", async () => {
    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      excludeRootFlags: OTHER_TABS,
      enabled: false,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.locations).toEqual([]);
    expect(containerNameCalls).toHaveLength(0);
  });

  // A ship in space holds its fittings at its own item id. ESI names that for nobody, so asking is
  // a refusal spent to learn nothing — four of them on an account with four characters.
  it("never asks ESI to name a ship that is in space", async () => {
    const { result } = render({
      assets: ASSETS,
      blueprints: BLUEPRINTS,
      namesCharacter: CHARACTER,
      excludeRootFlags: OTHER_TABS,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(nameAsks).not.toContain(1099999999999);
  });
});

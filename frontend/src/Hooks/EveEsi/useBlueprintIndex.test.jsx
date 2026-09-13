import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const {
  account,
  characterPayloads,
  corporationPayloads,
  corporationFetches,
  searchIndex,
} = vi.hoisted(() => ({
  account: { characters: [], corporations: [] },
  characterPayloads: new Map(),
  corporationPayloads: new Map(),
  corporationFetches: [],
  searchIndex: [{ blueprintID: 686, itemID: 587, jobType: 1 }],
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

vi.mock("../React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: (characterHash) => ({
    queryKey: ["characterBlueprints", characterHash],
    queryFn: async () => ({
      data: characterPayloads.get(characterHash) ?? [],
      characterHash,
    }),
    enabled: true,
  }),
}));

vi.mock("../React Query/Corporation/blueprints", () => ({
  corporationBlueprintsQueryKey: "corporationBlueprints",
  corporationBlueprintsQuery: (corporationId) => ({
    queryKey: ["corporationBlueprints", corporationId],
    queryFn: async () => {
      corporationFetches.push(corporationId);
      return {
        data: corporationPayloads.get(corporationId) ?? [],
        corporation_id: corporationId,
      };
    },
    enabled: true,
  }),
}));

// searchIndex is stable across renders, as the real query's data is — the derived collection is
// cached against the search index's identity as well as the rows'.
vi.mock("../App/useCachedData", () => ({
  useCachedData: () => ({ data: searchIndex, isLoading: false, error: null }),
}));

import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
  getCachedBlueprintIndex,
} from "./useBlueprintIndex";
import { testQueryClientKeepingCache } from "../../tests/queryClients.js";

function blueprint(itemId, overrides = {}) {
  return {
    item_id: itemId,
    type_id: 686,
    material_efficiency: 0,
    time_efficiency: 0,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: "Hangar",
    ...overrides,
  };
}

function render(request) {
  const client = testQueryClientKeepingCache();
  return renderHook(() => useBlueprintIndex(request), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  account.characters = [
    { CharacterHash: "hash-a" },
    { CharacterHash: "hash-b" },
  ];
  account.corporations = [
    { corporation_id: 98000001, members: ["hash-a", "hash-b"] },
  ];
  characterPayloads.clear();
  corporationPayloads.clear();
  corporationFetches.length = 0;
});

describe("useBlueprintIndex", () => {
  it("resolves the product join for the rows it returns", async () => {
    characterPayloads.set("hash-a", [blueprint(1)]);

    const { result } = render({
      scope: BLUEPRINT_SCOPE.CHARACTER,
      id: "hash-a",
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.byItemId.get(1)).toMatchObject({
      productTypeId: 587,
      jobType: 1,
    });
  });

  it("fetches a corporation once however many members it has", async () => {
    corporationPayloads.set(98000001, [
      blueprint(10, { is_corporation: true, corporation_id: 98000001 }),
    ]);

    const { result } = render({
      scope: BLUEPRINT_SCOPE.CORPORATION,
      id: 98000001,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Two members, one fetch — the query is keyed by corporation, not by character.
    expect(corporationFetches).toEqual([98000001]);
    expect(result.current.data.rows.map((row) => row.itemId)).toEqual([10]);
  });

  it("does not repeat a corporation's rows across its members", async () => {
    characterPayloads.set("hash-a", [blueprint(1)]);
    characterPayloads.set("hash-b", [blueprint(2)]);
    corporationPayloads.set(98000001, [
      blueprint(10, { is_corporation: true, corporation_id: 98000001 }),
    ]);

    const { result } = render({ scope: BLUEPRINT_SCOPE.ALL });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      result.current.data.rows.map((row) => row.itemId).sort((a, b) => a - b),
    ).toEqual([1, 2, 10]);
    expect(corporationFetches).toEqual([98000001]);
  });

  it("returns only the requested character for the character scope", async () => {
    characterPayloads.set("hash-a", [blueprint(1)]);
    characterPayloads.set("hash-b", [blueprint(2)]);

    const { result } = render({
      scope: BLUEPRINT_SCOPE.CHARACTER,
      id: "hash-a",
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.rows.map((row) => row.itemId)).toEqual([1]);
  });

  it("gives two consumers of one scope the same collection", async () => {
    characterPayloads.set("hash-a", [blueprint(1)]);

    const client = testQueryClientKeepingCache();
    const wrapper = ({ children }) =>
      createElement(QueryClientProvider, { client }, children);
    const request = { scope: BLUEPRINT_SCOPE.CHARACTER, id: "hash-a" };

    const { result: first } = renderHook(() => useBlueprintIndex(request), {
      wrapper,
    });
    const { result: second } = renderHook(() => useBlueprintIndex(request), {
      wrapper,
    });

    await waitFor(() => expect(first.current.isLoading).toBe(false));
    await waitFor(() => expect(second.current.isLoading).toBe(false));

    expect(second.current.data).toBe(first.current.data);
  });

  // The reader is what the helpers called with a query client use. It has to answer the way the
  // hook does, or the two shapes of one value that defect B1 describes come straight back.
  describe("read from the cache without subscribing", () => {
    function cacheOf(entries) {
      const byKey = new Map(
        entries.map(([key, value]) => [key.join("|"), value]),
      );
      return {
        getQueryState: (key) => byKey.get(key.join("|"))?.state,
        getQueryData: (key) => byKey.get(key.join("|"))?.data,
      };
    }

    it("reads what the cache holds", () => {
      const queryClient = cacheOf([
        [
          ["characterBlueprints", "hash-a"],
          { state: { status: "success" }, data: { data: [blueprint(1)] } },
        ],
      ]);

      const { rows } = getCachedBlueprintIndex(queryClient, {
        scope: BLUEPRINT_SCOPE.CHARACTER,
        id: "hash-a",
      });

      expect(rows.map((row) => row.itemId)).toEqual([1]);
    });

    // A refetch that fails leaves the rows it fetched earlier in the cache. Handing those back as
    // current would report ownership nobody has verified.
    it("reports nothing when a query failed over rows it already held", () => {
      const queryClient = cacheOf([
        [
          ["characterBlueprints", "hash-a"],
          {
            state: { status: "error", error: new Error("esi down") },
            data: { data: [blueprint(1)] },
          },
        ],
      ]);

      const { rows } = getCachedBlueprintIndex(queryClient, {
        scope: BLUEPRINT_SCOPE.CHARACTER,
        id: "hash-a",
      });

      expect(rows).toEqual([]);
    });

    it("reports nothing while a query is still arriving", () => {
      const queryClient = cacheOf([
        [
          ["characterBlueprints", "hash-a"],
          {
            state: { status: "pending", fetchStatus: "fetching" },
            data: undefined,
          },
        ],
      ]);

      const { rows } = getCachedBlueprintIndex(queryClient, {
        scope: BLUEPRINT_SCOPE.CHARACTER,
        id: "hash-a",
      });

      expect(rows).toEqual([]);
    });
  });

  it("returns an empty collection for an unknown scope", async () => {
    const { result } = render({ scope: "nonsense" });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.rows).toEqual([]);
  });
});

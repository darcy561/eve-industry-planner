import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const {
  account,
  characterRows,
  corporationRows,
  fetched,
  slowCharacters,
  slowRelease,
} = vi.hoisted(() => ({
  account: { characters: [], corporations: [] },
  characterRows: new Map(),
  corporationRows: new Map(),
  fetched: [],
  slowCharacters: new Set(),
  slowRelease: { current: null },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

vi.mock("../React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: (characterHash) => ({
    queryKey: ["characterAssets", characterHash],
    queryFn: async () => {
      fetched.push(characterHash);
      if (slowCharacters.has(characterHash)) await slowRelease.current;
      return characterRows.get(characterHash) ?? [];
    },
    enabled: true,
  }),
}));

vi.mock("../React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: (characterHash) => ({
    queryKey: ["corporationAssets", characterHash],
    queryFn: async () => corporationRows.get(characterHash) ?? [],
    enabled: true,
  }),
}));

import useAssetIndex, { ASSET_SCOPE } from "./useAssetIndex";
import { JITA_STATION_ID } from "../../tests/assetFixtures";
import {
  testQueryClient,
  testQueryClientKeepingCache,
} from "../../tests/queryClients.js";

function station(itemId, typeId = 34) {
  return {
    item_id: itemId,
    type_id: typeId,
    quantity: 1,
    location_flag: "Hangar",
    location_id: JITA_STATION_ID,
    location_type: "station",
  };
}

function render(request) {
  const client = testQueryClientKeepingCache();
  return renderHook(() => useAssetIndex(request), {
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
  characterRows.clear();
  corporationRows.clear();
  fetched.length = 0;
  slowCharacters.clear();
  slowRelease.current = null;
});

describe("useAssetIndex", () => {
  it("returns an empty collection for an unknown scope", async () => {
    const { result } = render({ scope: "nonsense" });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.nodes).toEqual([]);
  });

  it("fetches nothing while it is not enabled", async () => {
    characterRows.set("hash-a", [station(1)]);

    const { result } = render({
      scope: ASSET_SCOPE.CHARACTERS,
      enabled: false,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetched).toEqual([]);
    expect(result.current.data.nodes).toEqual([]);
  });

  it("returns only the requested character's rows", async () => {
    characterRows.set("hash-a", [station(1)]);
    characterRows.set("hash-b", [station(2)]);

    const { result } = render({
      scope: ASSET_SCOPE.CHARACTER,
      id: "hash-a",
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.nodes.map((n) => n.itemId)).toEqual([1]);
  });

  it("merges every character for the characters scope", async () => {
    characterRows.set("hash-a", [station(1)]);
    characterRows.set("hash-b", [station(2)]);

    const { result } = render({ scope: ASSET_SCOPE.CHARACTERS });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      result.current.data.nodes.map((n) => n.itemId).sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });

  it("takes every character and every corporation for the all scope", async () => {
    characterRows.set("hash-a", [station(1)]);
    corporationRows.set("hash-a", [station(10)]);
    corporationRows.set("hash-b", [station(11)]);

    const { result } = render({ scope: ASSET_SCOPE.ALL });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      result.current.data.nodes.map((n) => n.itemId).sort((a, b) => a - b),
    ).toEqual([1, 10, 11]);
  });

  it("unions a corporation's members and keeps one node per item", async () => {
    // Both members can see item 10; only hash-b can see item 11.
    corporationRows.set("hash-a", [station(10)]);
    corporationRows.set("hash-b", [station(10), station(11)]);

    const { result } = render({
      scope: ASSET_SCOPE.CORPORATION,
      id: 98000001,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      result.current.data.nodes.map((n) => n.itemId).sort((a, b) => a - b),
    ).toEqual([10, 11]);
  });

  it("gives two consumers of one scope the same collection", async () => {
    characterRows.set("hash-a", [station(1)]);

    const client = testQueryClientKeepingCache();
    const wrapper = ({ children }) =>
      createElement(QueryClientProvider, { client }, children);
    const request = { scope: ASSET_SCOPE.CHARACTER, id: "hash-a" };

    const { result: first } = renderHook(() => useAssetIndex(request), {
      wrapper,
    });
    const { result: second } = renderHook(() => useAssetIndex(request), {
      wrapper,
    });

    await waitFor(() => expect(first.current.isLoading).toBe(false));
    await waitFor(() => expect(second.current.isLoading).toBe(false));

    expect(second.current.data).toBe(first.current.data);
  });

  it("reports an error rather than an empty result", async () => {
    const { result } = renderHook(
      () => useAssetIndex({ scope: ASSET_SCOPE.CHARACTER, id: "hash-a" }),
      {
        wrapper: ({ children }) =>
          createElement(
            QueryClientProvider,
            {
              client: testQueryClient(),
            },
            children,
          ),
      },
    );

    characterRows.set("hash-a", null);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.nodes).toEqual([]);
  });
});

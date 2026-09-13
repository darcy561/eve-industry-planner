import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { account, payloads } = vi.hoisted(() => ({
  account: { characters: [] },
  payloads: new Map(),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

vi.mock("../../React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: (characterHash) => ({
    queryKey: ["characterBlueprints", characterHash],
    queryFn: async () => ({
      data: payloads.get(characterHash) ?? [],
      characterHash,
    }),
    enabled: true,
  }),
}));

import {
  getAllCachedCharacterBlueprints,
  useGetAllCharacterBlueprints,
} from "./useGetAllCharacterBlueprints";
import { testQueryClientKeepingCache } from "../../../tests/queryClients.js";

const row = { item_id: 1, type_id: 686 };

beforeEach(() => {
  account.characters = [{ CharacterHash: "hash-a" }];
  payloads.clear();
});

describe("useGetAllCharacterBlueprints", () => {
  // The hook once handed back the query wrapper while the cache reader handed back the rows, so a
  // consumer moved between the two silently saw nothing. They must not drift apart again.
  it("returns the same shape as the cache reader", async () => {
    payloads.set("hash-a", [row]);

    const client = testQueryClientKeepingCache();
    const { result } = renderHook(() => useGetAllCharacterBlueprints(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const fromCache = getAllCachedCharacterBlueprints(client);

    expect(result.current.data).toEqual(fromCache.data);
    expect(result.current.data["hash-a"]).toEqual([row]);
  });

  it("gives a character with no blueprints an empty array", async () => {
    const client = testQueryClientKeepingCache();
    const { result } = renderHook(() => useGetAllCharacterBlueprints(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data["hash-a"]).toEqual([]);
  });
});

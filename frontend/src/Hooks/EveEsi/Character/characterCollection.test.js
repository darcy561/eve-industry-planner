import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({ account: { characters: [] } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

const useQueries = vi.fn((options) => options);
vi.mock("@tanstack/react-query", () => ({
  useQueries: (options) => useQueries(options),
}));

import { renderHook } from "@testing-library/react";

import {
  keyRowsByCharacter,
  readCharacterCollection,
  rowsOf,
  useCharacterCollection,
} from "./characterCollection";

/** The queries the hook would open, for the characters currently on the account. */
function buildQueries(options, queryFactory) {
  const { result } = renderHook(() =>
    useCharacterCollection(queryFactory, options),
  );
  return result.current.queries;
}

/**
 * What the hook makes of the results React Query hands back.
 *
 * `useQueries` is stubbed to return what it was given, so the combine it would
 * have been called with is reachable here. It is the half of the module every
 * `use…` hook runs in production, where `readCharacterCollection` is the half
 * the imperative readers run.
 */
function combineResults(results, options = {}) {
  const { result } = renderHook(() =>
    useCharacterCollection(() => ({ queryKey: ["charThing"] }), options),
  );
  return result.current.combine(results);
}

const settled = (data) => ({ data, isLoading: false, error: null });

function cacheOf(entries) {
  const byKey = new Map(entries.map(([key, value]) => [key.join("|"), value]));
  return {
    getQueryState: (key) =>
      byKey.has(key.join("|")) ? { status: "success" } : undefined,
    getQueryData: (key) => byKey.get(key.join("|")),
  };
}

beforeEach(() => {
  account.characters = [
    { CharacterHash: "hash-a" },
    { CharacterHash: "hash-b" },
  ];
});

describe("rowsOf", () => {
  it("takes rows that arrived as themselves", () => {
    expect(rowsOf([{ id: 1 }])).toEqual([{ id: 1 }]);
  });

  it("takes rows that arrived beside the character they belong to", () => {
    expect(rowsOf({ characterHash: "hash-a", data: [{ id: 1 }] })).toEqual([
      { id: 1 },
    ]);
  });

  // A character that has not answered yet holds nothing, and an empty array is
  // what a consumer can still read through.
  it("reads anything else as no rows", () => {
    expect(rowsOf(undefined)).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
    expect(rowsOf({})).toEqual([]);
    expect(rowsOf(7)).toEqual([]);
  });
});

describe("keyRowsByCharacter", () => {
  it("keys each character's rows by that character", () => {
    const keyed = keyRowsByCharacter(account.characters, [
      [{ id: 1 }],
      [{ id: 2 }],
    ]);

    expect(keyed).toEqual({ "hash-a": [{ id: 1 }], "hash-b": [{ id: 2 }] });
  });

  // The queries and these keys are both built by mapping the same list, so the
  // pairing is positional — a payload landing under the wrong character is the
  // failure this pins.
  it("pairs a payload with the character in the same position", () => {
    const keyed = keyRowsByCharacter(account.characters, [
      undefined,
      [{ id: 2 }],
    ]);

    expect(keyed).toEqual({ "hash-a": [], "hash-b": [{ id: 2 }] });
  });

  it("gives a character with no answer an empty list rather than leaving it out", () => {
    expect(keyRowsByCharacter(account.characters, [])).toEqual({
      "hash-a": [],
      "hash-b": [],
    });
  });

  it("ignores a character with no hash", () => {
    expect(
      keyRowsByCharacter([{}, { CharacterHash: "hash-b" }], [[], []]),
    ).toEqual({ "hash-b": [] });
  });

  it("reads no characters as no rows", () => {
    expect(keyRowsByCharacter(undefined, [])).toEqual({});
  });
});

describe("readCharacterCollection", () => {
  it("reads one entry per character", () => {
    const queryClient = cacheOf([
      [["charThing", "hash-a"], [{ id: 1 }]],
      [["charThing", "hash-b"], [{ id: 2 }]],
    ]);

    const { data, isLoading, isError, error } = readCharacterCollection(
      queryClient,
      "charThing",
    );

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
    expect(error).toBeNull();
    expect(data).toEqual({ "hash-a": [{ id: 1 }], "hash-b": [{ id: 2 }] });
  });

  it("unwraps rows that were cached beside their character", () => {
    const queryClient = cacheOf([
      [["charThing", "hash-a"], { characterHash: "hash-a", data: [{ id: 1 }] }],
      [["charThing", "hash-b"], { characterHash: "hash-b", data: [{ id: 2 }] }],
    ]);

    const { data } = readCharacterCollection(queryClient, "charThing");

    expect(data).toEqual({ "hash-a": [{ id: 1 }], "hash-b": [{ id: 2 }] });
  });

  // One character still fetching means the set is incomplete, and half a set
  // read as the whole is what a consumer would draw.
  it("is loading while any character has not answered", () => {
    const queryClient = cacheOf([[["charThing", "hash-a"], [{ id: 1 }]]]);

    const { isLoading, data } = readCharacterCollection(
      queryClient,
      "charThing",
    );

    expect(isLoading).toBe(true);
    expect(data).toEqual({});
  });

  it("reports an error over partial data", () => {
    const queryClient = {
      getQueryState: () => ({ status: "error", error: new Error("nope") }),
      getQueryData: () => undefined,
    };

    const { isError, error, data } = readCharacterCollection(
      queryClient,
      "charThing",
    );

    expect(isError).toBe(true);
    expect(error.message).toBe("nope");
    expect(data).toEqual({});
  });

  it("reads an account with no characters as an empty set", () => {
    account.characters = [];

    const { data, isLoading, isError } = readCharacterCollection(
      cacheOf([]),
      "charThing",
    );

    expect(data).toEqual({});
    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
  });
});

// Assets are the one collection a reader opts into, so the hook is handed a flag
// rather than the queries being built differently.
describe("holding the queries off", () => {
  it("disables every character's query, and leaves an already-disabled one alone", () => {
    const queries = buildQueries({ enabled: false }, () => ({
      queryKey: ["charThing"],
      enabled: true,
    }));

    expect(queries.map((query) => query.enabled)).toEqual([false, false]);
  });

  it("leaves the query's own answer standing when it is enabled", () => {
    const queries = buildQueries({ enabled: true }, (hash) => ({
      queryKey: ["charThing", hash],
      enabled: hash === "hash-a",
    }));

    expect(queries.map((query) => query.enabled)).toEqual([true, false]);
  });
});

describe("combining what the live queries returned", () => {
  it("keys each character's rows by that character", () => {
    const { data, isLoading, isError, error } = combineResults([
      settled([{ id: 1 }]),
      settled([{ id: 2 }]),
    ]);

    expect(data).toEqual({ "hash-a": [{ id: 1 }], "hash-b": [{ id: 2 }] });
    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
    expect(error).toBeNull();
  });

  it("unwraps rows that arrived beside their character", () => {
    const { data } = combineResults([
      settled({ characterHash: "hash-a", data: [{ id: 1 }] }),
      settled({ characterHash: "hash-b", data: [{ id: 2 }] }),
    ]);

    expect(data).toEqual({ "hash-a": [{ id: 1 }], "hash-b": [{ id: 2 }] });
  });

  it("reads each payload with the rule the collection was given", () => {
    const { data } = combineResults(
      [settled({ 3446: { activeLevel: 5 } }), settled(undefined)],
      { rows: (payload) => payload ?? {} },
    );

    expect(data).toEqual({
      "hash-a": { 3446: { activeLevel: 5 } },
      "hash-b": {},
    });
  });

  // Half a set read as the whole is what a surface would draw.
  it("is loading while any one character still is", () => {
    const { data, isLoading } = combineResults([
      { data: [{ id: 1 }], isLoading: false, error: null },
      { data: undefined, isLoading: true, error: null },
    ]);

    expect(isLoading).toBe(true);
    expect(data).toEqual({});
  });

  it("reports an error over partial data", () => {
    const { isError, error, data } = combineResults([
      settled([{ id: 1 }]),
      { data: undefined, isLoading: false, error: new Error("nope") },
    ]);

    expect(isError).toBe(true);
    expect(error.message).toBe("nope");
    expect(data).toEqual({});
  });

  // Loading is asked before the error is, so a set still arriving does not
  // announce a failure it may yet recover from.
  it("says loading rather than failed while one is still in flight", () => {
    const { isLoading, isError } = combineResults([
      { data: undefined, isLoading: true, error: null },
      { data: undefined, isLoading: false, error: new Error("nope") },
    ]);

    expect(isLoading).toBe(true);
    expect(isError).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const { store, bodies } = vi.hoisted(() => ({
  store: {
    account: { characters: [] },
  },
  bodies: [],
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

// Only ESI is faked. The classifier, the batching loader and the per-id cache are all real.
vi.mock("../../../Functions/EveESI/fetchWithCustomHeaders", () => ({
  default: async (url, options) => {
    if (url.includes("universe/structures")) {
      throw new Error("a structure lookup has no business here");
    }
    const ids = JSON.parse(options.body);
    bodies.push(ids);
    return {
      ok: true,
      status: 200,
      json: async () => ids.map((id) => ({ id, name: `Name ${id}` })),
    };
  },
}));

import { fetchNames } from "./names";

const FACTION = 500001;
const CORPORATION = 98000001;
const CHARACTER = 2117028121;
const ALLIANCE = 99000001;
const JITA = 60003760;

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
}

beforeEach(() => {
  store.account = { characters: [{ CharacterHash: "hash-a" }] };
  bodies.length = 0;
});

// One cache answers for every id `POST /universe/names` resolves, not only for places. The selling
// rates path names a faction and a station's owning corporation through it, and used to keep a
// second, set-keyed cache of its own to do so.
describe("naming something that is not a place", () => {
  it("names a faction, a corporation, a character and an alliance", async () => {
    const names = await fetchNames(client(), [
      FACTION,
      CORPORATION,
      CHARACTER,
      ALLIANCE,
    ]);

    expect(
      Object.keys(names)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(
      [FACTION, CORPORATION, CHARACTER, ALLIANCE].sort((a, b) => a - b),
    );
  });

  it("asks for a faction and a station in the same call", async () => {
    await fetchNames(client(), [FACTION, JITA]);

    expect(bodies).toHaveLength(1);
    expect(bodies[0].sort((a, b) => a - b)).toEqual([FACTION, JITA]);
  });

  // No token is needed to name a faction, and waiting for characters to load would hold it back.
  it("names one without any characters linked", async () => {
    store.account = { characters: [] };

    const names = await fetchNames(client(), [FACTION]);

    expect(names[FACTION]?.name).toBe(`Name ${FACTION}`);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { store, esiCalls, esiAnswers, community } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
  },
  esiCalls: [],
  esiAnswers: { current: {} },
  community: { current: {} },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Functions/Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: async (characterHash) => ({
    accessToken: `header.${btoa(
      JSON.stringify({
        scp: ["esi-universe.read_structures.v1"],
        sub: characterHash,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")}.signature`,
    characterHash,
  }),
}));

vi.mock("../../../Functions/EveESI/World/communityNames", () => ({
  submitStructureName: () => {},
  communityName: async (id) => community.current[id] ?? null,
}));

// The only edge faked. The classifier, loader, per-id cache, hook and resolvers all run for real.
vi.mock("../../../Functions/EveESI/fetchWithCustomHeaders", () => ({
  default: async (url, options) => {
    const structure = url.match(/universe\/structures\/(\d+)/)?.[1];
    const token = options?.headers?.Authorization?.split(" ")[1] ?? "";
    const asker = token
      ? JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ).sub
      : null;
    esiCalls.push({ url, asker });

    if (structure) {
      const answer = esiAnswers.current[structure];
      if (typeof answer === "function") return answer(asker);
      return {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => null,
      };
    }

    const ids = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ids.map((id) => ({ id, name: `Station ${id}` })),
    };
  },
}));

import SelectAssetLocation_ShoppingListDialogue from "./assetLocationsSelection";

const JITA = 60003760;
const ALT_ONLY = 1035466617946;
const CLOSED = 1035466617948;

const MAIN = { CharacterHash: "hash-main", CharacterName: "Main" };
const ALT = { CharacterHash: "hash-alt", CharacterName: "Alt" };

function open(assetLocations) {
  const user = userEvent.setup();
  store.account = { characters: [MAIN, ALT], corporations: [] };
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
        })
      }
    >
      <SelectAssetLocation_ShoppingListDialogue
        state={{
          assetType: "character",
          selectedCharacter: MAIN.CharacterHash,
          selectedAssetLocation: "",
          assetLocations,
        }}
        actions={{
          setSelectedCharacter: () => {},
          setSelectedAssetLocation: () => {},
        }}
        assetLocationsLoading={false}
        assetLocationsError={false}
      />
    </QueryClientProvider>,
  );
  return user;
}

async function locationsOffered(user) {
  await user.click(screen.getAllByRole("combobox")[1]);
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

beforeEach(() => {
  esiCalls.length = 0;
  esiAnswers.current = {};
  community.current = {};
});

// The shopping list's own location picker, resolved for real rather than from seeded names: the
// same ladder the asset views walk, reached through this dialogue's dropdown.
describe("the asset locations a shopping list offers, resolved for real", () => {
  it("names a station from the bulk lookup", async () => {
    const user = open([JITA]);

    expect(await locationsOffered(user)).toEqual([`Station ${JITA}`]);
  });

  it("names a structure only an alt can dock at", async () => {
    esiAnswers.current[ALT_ONLY] = (asker) =>
      asker === ALT.CharacterHash
        ? {
            ok: true,
            status: 200,
            json: async () => ({ name: "Alt's Raitaru" }),
          }
        : {
            ok: false,
            status: 403,
            statusText: "Forbidden",
            json: async () => null,
          };

    const user = open([ALT_ONLY]);

    expect(await locationsOffered(user)).toContain("Alt's Raitaru");
  });

  it("offers a location nobody can read, saying so, after the named ones", async () => {
    const user = open([JITA, CLOSED]);

    expect(await locationsOffered(user)).toEqual([
      `Station ${JITA}`,
      `No Access To Location - ${CLOSED}`,
    ]);
  });

  // A 5xx is not a refusal: nothing has been established about the place, and the lookup is never
  // cached. The selection is held in the reducer, so the place is offered rather than dropped.
  it("offers a location whose lookup did not settle, saying so", async () => {
    const unreachable = { ok: false, status: 502, statusText: "Bad Gateway" };
    esiAnswers.current[CLOSED] = () => unreachable;

    const user = open([JITA, CLOSED]);

    // The lookup is retried before it is reported as failed, so the row arrives a few attempts in.
    await user.click(screen.getAllByRole("combobox")[1]);
    await vi.waitFor(() =>
      expect(
        within(screen.getByRole("listbox"))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([`Station ${JITA}`, "Name unavailable"]),
    );
  });

  it("takes a community name when every character is refused", async () => {
    community.current[CLOSED] = { name: "Someone Else's Sotiyo" };

    const user = open([CLOSED]);

    expect(await locationsOffered(user)).toContain("Someone Else's Sotiyo");
  });

  // Docking access is per character and nothing records which character holds it, so a refusal by
  // one says nothing about the account until every one of them has been asked.
  it("asks every linked character before giving up on a structure", async () => {
    const user = open([CLOSED]);

    await locationsOffered(user);

    const askers = esiCalls
      .filter((call) => call.url.includes(String(CLOSED)))
      .map((call) => call.asker);
    expect(askers.sort()).toEqual(
      [ALT.CharacterHash, MAIN.CharacterHash].sort(),
    );
  });
});

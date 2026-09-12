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

vi.mock("../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

// Every character's token carries the structure scope, so what ESI answers is the only thing
// deciding an outcome. The hash rides in the claims so the fake ESI can tell who is asking.
vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
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

vi.mock("../../Functions/EveESI/World/communityNames", () => ({
  submitStructureName: () => {},
  communityName: async (id) => community.current[id] ?? null,
}));

// The only edge faked. Everything between this and the rendered options is the real classifier,
// loader, per-id cache, hook and resolvers.
vi.mock("../../Functions/EveESI/fetchWithCustomHeaders", () => ({
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

import CorporationOfficesSelect from "./corporationOffices";

const CORPORATION = 98000001;
const JITA = 60003760;
const ALT_ONLY = 1035466617946;
const CLOSED = 1035466617948;

const MAIN = { CharacterHash: "hash-main", CharacterName: "Main" };
const ALT = { CharacterHash: "hash-alt", CharacterName: "Alt" };

function open(offices) {
  const user = userEvent.setup();
  store.account = {
    characters: [MAIN, ALT],
    corporations: [{ corporation_id: CORPORATION, officeLocations: offices }],
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
        })
      }
    >
      <CorporationOfficesSelect
        selectedCorporation={CORPORATION}
        value=""
        onChange={() => {}}
      />
    </QueryClientProvider>,
  );
  return user;
}

async function optionsShown(user) {
  await user.click(screen.getByRole("combobox"));
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

beforeEach(() => {
  esiCalls.length = 0;
  esiAnswers.current = {};
  community.current = {};
});

// The picker end to end: what a reader is offered after a real walk across every linked character,
// rather than after names were seeded.
describe("the offices a corporation picker offers, resolved for real", () => {
  it("names an office only an alt can dock at", async () => {
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

    const user = open([JITA, ALT_ONLY]);

    await screen.findByRole("combobox");
    expect(await optionsShown(user)).toContain("Alt's Raitaru");
  });

  // The standard: an office nobody can read is offered saying so, after the named ones — never
  // dropped, which would read as the corporation not holding it.
  it("offers an office nobody can read, saying so, after the named ones", async () => {
    const user = open([JITA, CLOSED]);

    await screen.findByRole("combobox");
    const offices = await optionsShown(user);
    expect(offices).toEqual([
      "Select an office",
      `Station ${JITA}`,
      `No Access To Location - ${CLOSED}`,
    ]);
  });

  it("takes a community name when every character is refused", async () => {
    community.current[CLOSED] = { name: "Someone Else's Sotiyo" };

    const user = open([CLOSED]);

    await screen.findByRole("combobox");
    expect(await optionsShown(user)).toContain("Someone Else's Sotiyo");
  });

  it("asks every linked character before giving up on an office", async () => {
    const user = open([CLOSED]);

    await screen.findByRole("combobox");
    await optionsShown(user);
    const askers = esiCalls
      .filter((call) => call.url.includes(String(CLOSED)))
      .map((call) => call.asker);
    expect(askers.sort()).toEqual(
      [ALT.CharacterHash, MAIN.CharacterHash].sort(),
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, characterRows, esiCalls, community } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  },
  characterRows: { current: [] },
  esiCalls: [],
  community: { current: {} },
}));

vi.mock("../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

vi.mock("../../Hooks/React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: (characterHash) => ({
    queryKey: ["characterAssets", characterHash],
    queryFn: async () => characterRows.current,
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: () => ({
    queryKey: ["corporationAssets"],
    queryFn: async () => [],
    enabled: false,
  }),
}));

vi.mock("../../Hooks/React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: (characterHash) => ({
    queryKey: ["characterBlueprints", characterHash],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Corporation/blueprints", () => ({
  corporationBlueprintsQueryKey: "corporationBlueprints",
  corporationBlueprintsQuery: () => ({
    queryKey: ["corporationBlueprints"],
    queryFn: async () => [],
    enabled: false,
  }),
}));

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: { 34: { name: "Tritanium", category_id: 4 } },
    loading: false,
    error: false,
  }),
}));

vi.mock("../../Functions/EveESI/World/getAssetLocationNames", () => ({
  default: async () => new Map(),
}));

// Every character's token is valid and carries the structure scope, so what ESI answers is the only
// thing deciding an outcome.
vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: async (characterHash) => ({
    // The hash rides in the claims so the fake ESI below can tell which character is asking, the
    // way a real structure's ACL does.
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

// The one edge that is faked: ESI itself. Everything between this and the rendered rows is the real
// hook, the real per-id cache, the real loader and the real resolvers.
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
    // Measured against live ESI: the bulk lookup is all-or-nothing. An id it cannot resolve refuses
    // the whole call with a 404 and names none of the ids beside it.
    if (ids.some((id) => !publicNames.current[id])) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({
          error: "Ensure all IDs are valid before resolving.",
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () =>
        ids.map((id) => ({ id, name: publicNames.current[id] })),
    };
  },
}));

const { esiAnswers, publicNames } = vi.hoisted(() => ({
  esiAnswers: { current: {} },
  publicNames: { current: {} },
}));

import AssetLibraryView from "./assetLibraryView";
import { stubElementHeights } from "../../tests/elementHeights";

const JITA = 60003760;
const ALT_ONLY_STRUCTURE = 1035466617946;
const COMMUNITY_STRUCTURE = 1035466617947;
const CLOSED_STRUCTURE = 1035466617948;
const SHIP_IN_SPACE = 1099999999999;
const MOON = 40009077;
const DEAD_STATION = 60999999;

const MAIN = { CharacterHash: "hash-main", CharacterName: "Main" };
const ALT = { CharacterHash: "hash-alt", CharacterName: "Alt" };

const theme = createTheme({ palette: { mode: "dark" } });

function named(name) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ name }),
  });
}

const refused = {
  ok: false,
  status: 403,
  statusText: "Forbidden",
  json: async () => null,
};

function stack(itemId, locationId, flag = "Hangar") {
  return {
    item_id: itemId,
    type_id: 34,
    quantity: 10,
    location_flag: flag,
    location_id: locationId,
    location_type: "item",
    is_singleton: false,
  };
}

function newClient() {
  return new QueryClient({
    // `nameQuery` sets its own `retry`, which outlives a client default — so the wait
    // between attempts is collapsed rather than the attempts removed.
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
}

function renderLibrary(client = newClient()) {
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <AssetLibraryView kind="character" id="hash-main" view="held" />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

let restoreHeights;

afterEach(() => restoreHeights?.());

beforeEach(() => {
  restoreHeights = stubElementHeights();
  store.account = { characters: [MAIN, ALT], corporations: [] };
  esiCalls.length = 0;
  community.current = {};
  esiAnswers.current = {};
  publicNames.current = { [JITA]: "Jita IV-4" };
  characterRows.current = [];
});

// The whole ladder, from the rows ESI returns to the names a reader sees: a station from the bulk
// lookup, a structure only an alt can dock at, one nobody can but the community store knows, one
// nobody can name at all, and a ship that is not a place. Unit tests on either side of this cannot
// see the seam where a location id becomes a question.
describe("the names an asset view shows", () => {
  it("names a station from the bulk lookup", async () => {
    characterRows.current = [stack(1, JITA)];

    renderLibrary();

    expect(await screen.findByText("Jita IV-4")).toBeTruthy();
  });

  it("names a structure only an alt can dock at", async () => {
    characterRows.current = [stack(1, ALT_ONLY_STRUCTURE)];
    esiAnswers.current[ALT_ONLY_STRUCTURE] = (asker) =>
      asker === ALT.CharacterHash ? named("Alt's Raitaru")() : refused;

    renderLibrary();

    expect(await screen.findByText("Alt's Raitaru")).toBeTruthy();
  });

  it("takes a community name when every character is refused", async () => {
    characterRows.current = [stack(1, COMMUNITY_STRUCTURE)];
    esiAnswers.current[COMMUNITY_STRUCTURE] = () => refused;
    community.current[COMMUNITY_STRUCTURE] = { name: "Someone Else's Sotiyo" };

    renderLibrary();

    expect(await screen.findByText("Someone Else's Sotiyo")).toBeTruthy();
  });

  it("says so when nobody can name it", async () => {
    characterRows.current = [stack(1, CLOSED_STRUCTURE)];
    esiAnswers.current[CLOSED_STRUCTURE] = () => refused;

    renderLibrary();

    expect(await screen.findByText(/No Access To Location/)).toBeTruthy();
  });

  // The defect that spent an account's ESI error budget: a ship's item id read as a place, asked of
  // ESI once per character, refused every time.
  it("never asks about a ship that is in space", async () => {
    characterRows.current = [
      stack(1, JITA),
      stack(2, SHIP_IN_SPACE, "LoSlot0"),
    ];

    renderLibrary();

    await screen.findByText("Jita IV-4");
    expect(
      esiCalls.filter((call) => call.url.includes(String(SHIP_IN_SPACE))),
    ).toHaveLength(0);
  });

  // A moon is a place a starbase's modules sit at, and nothing can name it: the bulk lookup answers
  // for stations, systems, constellations and regions only, and a character's token answers for
  // structures. Asked either way it costs an error, and asked in a batch it costs every name beside
  // it.
  it("never asks about a moon, and names the station beside it", async () => {
    characterRows.current = [stack(1, JITA), stack(2, MOON)];

    renderLibrary();

    expect(await screen.findByText("Jita IV-4")).toBeTruthy();
    expect(
      esiCalls.filter((call) => call.url.includes(String(MOON))),
    ).toHaveLength(0);
    // Nor carried into the bulk call, where it would have refused the batch Jita was in.
    const bulk = esiCalls.filter((call) => call.url.includes("universe/names"));
    expect(bulk).toHaveLength(1);
  });

  // One id ESI cannot resolve used to cost every name on the page, on every attempt, because it is
  // in the batch every time.
  it("finds the one id ESI will not resolve, and names the rest", async () => {
    characterRows.current = [stack(1, JITA), stack(2, DEAD_STATION)];

    renderLibrary();

    expect(await screen.findByText("Jita IV-4")).toBeTruthy();
  });

  // What the whole package is for: a name resolved once is present wherever it is wanted next. The
  // defect this replaced kept a cache entry per set of ids a page happened to ask for, so the next
  // view asked again — and could settle differently.
  it("does not ask again for a structure a previous view already named", async () => {
    characterRows.current = [stack(1, ALT_ONLY_STRUCTURE)];
    esiAnswers.current[ALT_ONLY_STRUCTURE] = (asker) =>
      asker === ALT.CharacterHash ? named("Alt's Raitaru")() : refused;
    const shared = newClient();

    const first = renderLibrary(shared);
    expect(await screen.findByText("Alt's Raitaru")).toBeTruthy();
    const asksAfterFirst = esiCalls.filter((call) =>
      call.url.includes(String(ALT_ONLY_STRUCTURE)),
    ).length;
    first.unmount();
    // A tick, as a reader moving between pages takes: an entry kept only until the end of the
    // current task would be gone by the time the next view asks, and this would re-ask.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    renderLibrary(shared);

    expect(await screen.findByText("Alt's Raitaru")).toBeTruthy();
    expect(
      esiCalls.filter((call) => call.url.includes(String(ALT_ONLY_STRUCTURE)))
        .length,
    ).toBe(asksAfterFirst);
  });

  it("asks each character once, and only once, for a structure", async () => {
    characterRows.current = [stack(1, COMMUNITY_STRUCTURE)];
    esiAnswers.current[COMMUNITY_STRUCTURE] = () => refused;
    community.current[COMMUNITY_STRUCTURE] = { name: "Someone Else's Sotiyo" };

    renderLibrary();

    await screen.findByText("Someone Else's Sotiyo");
    const askers = esiCalls
      .filter((call) => call.url.includes(String(COMMUNITY_STRUCTURE)))
      .map((call) => call.asker);
    // Both characters, each once: a count alone would pass for one character asked twice.
    expect(askers.sort()).toEqual(
      [ALT.CharacterHash, MAIN.CharacterHash].sort(),
    );
  });

  // A lookup that did not settle is the case the whole project exists for. Here it is at the
  // rendered surface: ESI is unwell for a whole pass — every character, not just the first, or the
  // walk would simply move on and no retry would be involved — and the name arrives on the retry.
  it("asks again when a whole pass fails, and shows the name it then gets", async () => {
    characterRows.current = [stack(1, ALT_ONLY_STRUCTURE)];
    const unwell = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => null,
    };
    let asks = 0;
    esiAnswers.current[ALT_ONLY_STRUCTURE] = (asker) => {
      asks += 1;
      // One ask per character is a pass; the first pass fails outright.
      if (asks <= 2) return unwell;
      return asker === ALT.CharacterHash ? named("Alt's Raitaru")() : refused;
    };

    renderLibrary();

    expect(await screen.findByText("Alt's Raitaru")).toBeTruthy();
    expect(asks).toBeGreaterThan(2);
  });
});

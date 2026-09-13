import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const {
  store,
  characterRows,
  blueprintRows,
  failAssets,
  failItemList,
  resolved,
} = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  },
  characterRows: new Map(),
  blueprintRows: { current: [] },
  failAssets: { current: false },
  failItemList: { current: false },
  resolved: { current: {} },
}));

import { assetFixtureItemList } from "../../tests/assetFixtures";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../Hooks/React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: (characterHash) => ({
    queryKey: ["characterAssets", characterHash],
    queryFn: async () => {
      if (failAssets.current) throw new Error("access forbidden");
      return characterRows.get(characterHash) ?? [];
    },
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: () => ({
    queryKey: ["corporationAssets"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: () => ({
    queryKey: ["characterBlueprints"],
    // The blueprint fetchers wrap their rows, as the index expects.
    queryFn: async () => ({ data: blueprintRows.current }),
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Corporation/blueprints", () => ({
  corporationBlueprintsQueryKey: "corporationBlueprints",
  corporationBlueprintsQuery: () => ({
    queryKey: ["corporationBlueprints"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

// The one item list the asset views read, so a category the tree relies on cannot drift between
// this harness and the collection tests.
const itemList = {
  ...assetFixtureItemList,
  686: { name: "Rifter Blueprint", category_id: 9 },
};

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: (dataType) => ({
    isError: dataType === "FULL_ITEM_LIST" && failItemList.current,
    error:
      dataType === "FULL_ITEM_LIST" && failItemList.current
        ? new Error("item list unavailable")
        : null,
    data:
      dataType === "FULL_ITEM_LIST" && failItemList.current
        ? undefined
        : dataType === "SEARCH_INDEX"
          ? []
          : itemList,
    isLoading: false,
  }),
}));

vi.mock("../../Functions/EveESI/World/nameLoader", () => ({
  // Anything these tests do not seed an answer for is a location ESI has no name for, which is a
  // settled answer rather than a failure to retry.
  requestName: async (id) =>
    resolved.current[id] ?? { id, resolutionStatus: "unnamed" },
}));

vi.mock("../../Functions/EveESI/World/getAssetLocationNames", () => ({
  default: async () => new Map([[1002, { item_id: 1002, name: "Ore Crate" }]]),
}));

import AssetLibraryView from "./assetLibraryView";
import { stubElementHeights } from "../../tests/elementHeights";
import {
  ancientRelicAssetRow,
  assembledShipAssetRows,
  ANCIENT_RELIC_TYPE_ID,
  characterAssetRows,
  JITA_STATION_ID,
  RAITARU_STRUCTURE_ID,
} from "../../tests/assetFixtures";
import { testQueryClientKeepingCache } from "../../tests/queryClients.js";

const CHARACTER = { CharacterHash: "hash-a", CharacterID: 2114000001 };

/** A blueprint in the station hangar, and the blueprint row naming it as one. */
const BLUEPRINT_ASSET_ROW = {
  item_id: 1200,
  type_id: 686,
  quantity: 1,
  location_flag: "Hangar",
  location_id: JITA_STATION_ID,
  location_type: "station",
};
const BLUEPRINT_ROW = {
  item_id: 1200,
  type_id: 686,
  location_id: JITA_STATION_ID,
  location_flag: "Hangar",
  quantity: -1,
  material_efficiency: 10,
  time_efficiency: 20,
  runs: -1,
};
const theme = createTheme();

let client;

function renderPage(props) {
  client = testQueryClientKeepingCache();
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <AssetLibraryView kind="character" id="hash-a" view="held" {...props} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

let restoreHeights;

afterEach(() => restoreHeights?.());

beforeEach(() => {
  restoreHeights = stubElementHeights();
  store.account = { characters: [CHARACTER], corporations: [] };
  resolved.current = {
    [JITA_STATION_ID]: { id: JITA_STATION_ID, name: "Jita IV-4" },
    [RAITARU_STRUCTURE_ID]: {
      id: RAITARU_STRUCTURE_ID,
      name: "Abbey Raitaru",
    },
  };
  characterRows.clear();
  characterRows.set("hash-a", [...characterAssetRows, BLUEPRINT_ASSET_ROW]);
  blueprintRows.current = [BLUEPRINT_ROW];
  failAssets.current = false;
  failItemList.current = false;
});

// Every field these rows are drawn from was renamed by the collection cutover, and a miss shows as
// a blank row rather than an error.
describe("a character's assets", () => {
  it("lists the locations holding them", async () => {
    renderPage();

    expect(await screen.findByText("Jita IV-4")).toBeTruthy();
    expect(screen.getByText("Abbey Raitaru")).toBeTruthy();
  });

  it("shows what is at a location once it is opened, and what is inside a container", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.getByText("Tritanium")).toBeTruthy();
    // The container carries the name its owner gave it.
    const crate = screen.getByText("Large Secure Container - Ore Crate");
    expect(crate).toBeTruthy();
    expect(screen.getByText("1,000")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: /Expand Large Secure Container - Ore Crate/,
      }),
    );
    expect(screen.getByText("Pyerite")).toBeTruthy();
  });

  // Expansion belongs to the page, keyed on what a row is, so rows arriving again do not close it.
  it("keeps a location open when its assets are fetched again", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Expand Large Secure Container - Ore Crate/,
      }),
    );
    expect(screen.getByText("Pyerite")).toBeTruthy();

    // The same assets arrive again as new objects in a different order, as ESI delivers them.
    characterRows.set(
      "hash-a",
      [...characterAssetRows].reverse().map((row) => ({ ...row })),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["characterAssets", "hash-a"] });
    });

    expect(screen.getByText("Pyerite")).toBeTruthy();
  });

  // Blueprints have their own library; the asset views show materials and items.
  it("leaves blueprints out", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.getByText("Tritanium")).toBeTruthy();
    expect(screen.queryByText("Rifter Blueprint")).toBeNull();
  });

  // A refusal used to leave the page on its spinner for as long as it was open.
  it("says so when the assets cannot be read", async () => {
    failAssets.current = true;
    renderPage();

    expect(await screen.findByText(/Failed to load data/i)).toBeTruthy();
    expect(screen.queryByText("Gathering Location Data...")).toBeNull();
  });

  // A row cannot be drawn without the static list naming it, so its failure is the view's failure
  // rather than a slower load.
  it("says so when the item names cannot be read", async () => {
    failItemList.current = true;
    renderPage();

    expect(await screen.findByText(/Failed to load data/i)).toBeTruthy();
    expect(screen.queryByText("Gathering Location Data...")).toBeNull();
  });

  // A place holding nothing says so rather than offering to open onto nothing.
  it("says a location holds nothing rather than opening onto nothing", async () => {
    characterRows.set("hash-a", []);
    renderPage();

    expect(await screen.findByText("Nothing held in this view")).toBeTruthy();
  });

  it("says so when a search matches nothing", async () => {
    renderPage({ search: "nothing by this name" });

    expect(await screen.findByText("Nothing here matches that")).toBeTruthy();
  });

  it("counts the stacks a location holds, containers included", async () => {
    renderPage();

    await screen.findByText("Jita IV-4");
    // A stack, a container, the two things in it, and the one inside that.
    expect(screen.getByText("5")).toBeTruthy();
  });

  // A search is answered rather than browsed: no location has to be opened first.
  it("shows what a search matches without opening anything", async () => {
    renderPage({ search: "pyerite" });

    expect(await screen.findByText("Pyerite")).toBeTruthy();
    // Pyerite is inside the container, which is kept so its holder can be seen. The player's own
    // name for it arrives separately from the rows, so it is waited for rather than assumed.
    expect(
      await screen.findByText("Large Secure Container - Ore Crate"),
    ).toBeTruthy();
    expect(screen.queryByText("Tritanium")).toBeNull();
    expect(screen.queryByText("Abbey Raitaru")).toBeNull();
  });

  it("leaves out what the other tabs show", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    // At the station: a stack of 1,000 Tritanium and a container. The stack of 25 is in
    // Deliveries, the stack of 3 in asset safety, and both have their own tab.
    expect(screen.getByText("1,000")).toBeTruthy();
    expect(screen.queryByText("25")).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
  });
});

// A fitted ship brings its modules, drones and cargo into the tree with it, which is most of what
// makes a well-used hangar unreadable.
describe("with assembled ships hidden", () => {
  beforeEach(() => {
    characterRows.set("hash-a", assembledShipAssetRows);
  });

  it("shows the ship and what it holds until asked not to", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.getAllByText("Rifter").length).toBe(2);
    await user.click(screen.getByRole("button", { name: /Expand Rifter/ }));
    expect(screen.getByText("Damage Control II")).toBeTruthy();
  });

  it("takes the ship's fittings and cargo with it", async () => {
    const user = userEvent.setup();
    renderPage({ hideAssembledShips: true });

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );
    expect(screen.queryByRole("button", { name: /Expand Rifter/ })).toBeNull();
  });

  // A search opens onto whatever matches, so it reaches inside a ship that browsing cannot.
  it("leaves a hidden ship's contents out of a search", async () => {
    renderPage({ hideAssembledShips: true, search: "hobgoblin" });

    expect(await screen.findByText("Nothing here matches that")).toBeTruthy();
  });

  // A hull with nothing fitted and nothing aboard is what the fitting test alone could not see.
  it("takes a hull with nothing fitted and nothing aboard", async () => {
    const user = userEvent.setup();
    renderPage({ hideAssembledShips: true });

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.queryByText("Stabber")).toBeNull();
  });

  it("shows that hull when it is not asked to hide ships", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.getByText("Stabber")).toBeTruthy();
  });

  it("keeps the packaged hulls and the containers", async () => {
    const user = userEvent.setup();
    renderPage({ hideAssembledShips: true });

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    // The packaged hull remains, as the one assembled row is what goes.
    expect(screen.getAllByText("Rifter").length).toBe(1);
    expect(screen.getByText("Large Secure Container")).toBeTruthy();
  });
});

// ESI answers the blueprints endpoint with ancient relics, because they carry runs the way a copy
// does. They are invention materials a player buys and holds, so the blueprint exemption must not
// take them with it.
describe("an ancient relic", () => {
  beforeEach(() => {
    characterRows.set("hash-a", [ancientRelicAssetRow]);
    blueprintRows.current = [
      {
        item_id: ancientRelicAssetRow.item_id,
        type_id: ANCIENT_RELIC_TYPE_ID,
        location_id: JITA_STATION_ID,
        location_flag: "Hangar",
        quantity: -2,
        material_efficiency: 0,
        time_efficiency: 0,
        runs: 1,
      },
    ];
  });

  it("is still listed among the assets", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(screen.getByText("Intact Armor Nanobot")).toBeTruthy();
  });

  // Its icon variant is answered with a 400, which shows as a blank square.
  it("is drawn from the relic image variant", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    expect(
      // The assertion is about which artwork variant the image server is asked for, and an <img>
      // carrying a decorative alt has no accessible name to query by.
      container.querySelector(
        `img[src*="/types/${ANCIENT_RELIC_TYPE_ID}/relic"]`,
      ),
    ).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, corporationRows, officesSet, resolved } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [], actions: {} },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  },
  corporationRows: new Map(),
  officesSet: [],
  resolved: { current: {} },
}));

vi.mock("../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

vi.mock("../../Hooks/React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: () => ({
    queryKey: ["characterAssets"],
    queryFn: async () => [],
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: (memberHash) => ({
    queryKey: ["corporationAssets", memberHash],
    queryFn: async () => corporationRows.get(memberHash) ?? [],
    enabled: true,
  }),
}));

vi.mock("../../Hooks/React Query/Character/blueprints", () => ({
  characterBlueprintsQueryKey: "characterBlueprints",
  characterBlueprintsQuery: () => ({
    queryKey: ["characterBlueprints"],
    queryFn: async () => [],
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

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: {
      34: { name: "Tritanium" },
      35: { name: "Pyerite" },
      3465: { name: "Large Secure Container" },
      27: { name: "Office" },
    },
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
  default: async () => new Map(),
}));

import AssetLibraryView from "./assetLibraryView";
import {
  corporationAssetRows,
  JITA_STATION_ID,
} from "../../tests/assetFixtures";
import { stubElementHeights } from "../../tests/elementHeights";

const CORPORATION_ID = 98000001;
const EMPTY_OFFICE_ID = 60008494;
const theme = createTheme();

function corporation(officeLocations) {
  return {
    corporation_id: CORPORATION_ID,
    members: ["hash-a"],
    officeLocations,
    hangars: [
      { assetLocationRef: "CorpSAG1", name: "Division 1" },
      { assetLocationRef: "CorpSAG3", name: "Division 3" },
    ],
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <AssetLibraryView kind="corporation" id={CORPORATION_ID} view="held" />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

let restoreHeights;

beforeEach(() => {
  // The tree scrolls inside itself, so its scroller needs a size before any
  // row counts as being in view.
  restoreHeights = stubElementHeights();
  officesSet.length = 0;
  store.account = {
    characters: [{ CharacterHash: "hash-a", corporation_id: CORPORATION_ID }],
    corporations: [corporation([JITA_STATION_ID])],
    actions: {
      setCorporationOffices: (id, locationIds) =>
        officesSet.push([id, locationIds]),
    },
  };
  resolved.current = {
    [JITA_STATION_ID]: { id: JITA_STATION_ID, name: "Jita IV-4" },
    [EMPTY_OFFICE_ID]: { id: EMPTY_OFFICE_ID, name: "Amarr VIII" },
  };
  corporationRows.clear();
  corporationRows.set("hash-a", corporationAssetRows);
});

afterEach(() => restoreHeights?.());

describe("a corporation's offices", () => {
  it("files each division's assets under the division", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );

    // The office folder is read through rather than shown as a row of its own.
    expect(screen.queryByText("Office")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Expand Division 3, Jita IV-4/ }),
    );
    expect(screen.getByText("Large Secure Container")).toBeTruthy();
  });

  // A corporation renting an office it has emptied still rents it.
  it("shows an office holding nothing", async () => {
    store.account.corporations = [
      corporation([JITA_STATION_ID, EMPTY_OFFICE_ID]),
    ];
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Amarr VIII/ }),
    );

    // Only the empty office is open, so its divisions are the only ones showing, and each says
    // it holds nothing rather than offering to open onto nothing.
    expect(screen.getAllByText("Division 1")).toHaveLength(1);
    expect(screen.getAllByText("Empty").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /Expand Division 1/ }),
    ).toBeNull();
  });

  // Divisions are named the same at every office, so a name has to say which office it is in.
  it("tells two offices' divisions apart", async () => {
    store.account.corporations = [
      corporation([JITA_STATION_ID, EMPTY_OFFICE_ID]),
    ];
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Expand Jita IV-4/ }),
    );
    await user.click(screen.getByRole("button", { name: /Expand Amarr VIII/ }));

    expect(screen.getAllByText("Division 1")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Expand Division 1, Jita IV-4" }),
    ).toBeTruthy();
  });

  it("records the offices its assets show", async () => {
    renderPage();

    await screen.findByText("Jita IV-4");
    expect(officesSet.at(-1)).toEqual([CORPORATION_ID, [JITA_STATION_ID]]);
  });
});

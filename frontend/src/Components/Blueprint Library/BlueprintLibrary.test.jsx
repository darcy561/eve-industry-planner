import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { navigated, search, store } = vi.hoisted(() => ({
  navigated: [],
  search: { current: {} },
  store: {
    account: { characters: [], corporations: [] },
    applicationSettings: { enableCompactLayoutView: false },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (options) => navigated.push(options),
  useSearch: () => search.current,
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../Hooks/EveEsi/useBlueprintIndex", () => ({
  default: () => ({
    data: { rows: [], byItemId: new Map(), byTypeId: new Map() },
    isLoading: false,
  }),
  BLUEPRINT_SCOPE: { ALL: "all" },
}));

vi.mock("../../Hooks/EveEsi/useBlueprintLocations", () => ({
  default: () => ({
    names: new Map(),
    places: [],
    locationIds: new Map(),
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({ data: [], isLoading: false }),
}));

vi.mock("./LibrarySearch", () => ({ LibrarySearch: () => null }));
vi.mock("../Dialogues/Blueprint Archive", () => ({ default: () => null }));

import BlueprintLibrary from "./BlueprintLibrary";

const theme = createTheme();

beforeEach(() => {
  navigated.length = 0;
  search.current = { filter: "all", page: 1, pageSize: 16 };
});

describe("the blueprint library", () => {
  // The control moved out of the search row and onto the panel; its handler did not follow it.
  it("changes how many it shows at once", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={theme}>
        <BlueprintLibrary />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "32" }));

    expect(navigated).toHaveLength(1);
    expect(navigated[0].search({ filter: "all", page: 4 })).toEqual({
      filter: "all",
      page: 1,
      pageSize: 32,
    });
  });
});

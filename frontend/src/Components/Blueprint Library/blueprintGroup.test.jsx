import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { industryJobs, searchIndex } = vi.hoisted(() => ({
  industryJobs: { current: [] },
  searchIndex: { current: [] },
}));

vi.mock("../../Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  default: () => ({
    data: industryJobs.current,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: searchIndex.current,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: {
      actions: {
        findCharacterByHash: () => ({
          CharacterID: 2114000001,
          CharacterName: "Reginal Shardani",
        }),
        getCorporation: () => ({ corporationName: "Astral Acquisitions Inc." }),
      },
    },
  });
});

import BlueprintGroup from "./blueprintGroup";
import buildBlueprintRows from "../../Functions/Blueprints/buildBlueprintRows";
import {
  blueprintSearchIndex,
  characterBlueprintRows,
  identicalCopyRows,
  RIFTER_BLUEPRINT_TYPE_ID,
} from "../../tests/blueprintFixtures";
import { testQueryClient } from "../../tests/queryClients.js";

const theme = createTheme();

function renderGroup(rows, props = {}) {
  const { rows: built } = buildBlueprintRows(rows, blueprintSearchIndex);
  const client = testQueryClient();

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <BlueprintGroup
          bpID={RIFTER_BLUEPRINT_TYPE_ID}
          blueprintResults={{ blueprints: built }}
          {...props}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const activeJobOn = (itemId) => [
  {
    blueprint_id: itemId,
    blueprint_type_id: RIFTER_BLUEPRINT_TYPE_ID,
    status: "active",
    // A reaction job runs into the thousands, which is where a raw number loses its separators.
    runs: 12000,
    activity_id: 1,
    cost: 1000,
    end_date: "2099-01-01T00:00:00Z",
    facility_name: "Abbey Raitaru",
  },
];

const cards = (container) =>
  container.querySelectorAll('img[src*="/types/"]').length;

beforeEach(() => {
  industryJobs.current = [];
  searchIndex.current = blueprintSearchIndex;
});

// Both library views are this panel at two densities, so each case holds for both.
describe.each([
  ["roomy", false],
  ["compact", true],
])("a blueprint panel in the %s view", (unused, compact) => {
  it("shows interchangeable blueprints as one card", () => {
    const { container } = renderGroup(identicalCopyRows, { compact });

    expect(cards(container)).toBe(1);
    // The label carries a colon only where the figure sits beside it rather than under it.
    expect(screen.getByText(/^Held:?$/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows each distinct researched combination it holds", () => {
    renderGroup(characterBlueprintRows, { compact });

    // 7001 is ME 5 / TE 10; 7002 and 7003 are ME 10 / TE 20, an original and a copy.
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20").length).toBeGreaterThan(0);
  });

  // The one being built is unavailable until the job finishes, so it cannot stand for the others.
  it("takes a blueprint being built out of its stack", () => {
    industryJobs.current = activeJobOn(7021);
    const { container } = renderGroup(identicalCopyRows, { compact });

    expect(cards(container)).toBe(2);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("offers the job's own figures on the card that is building", async () => {
    const user = userEvent.setup();
    industryJobs.current = activeJobOn(7021);
    renderGroup(identicalCopyRows, { compact });

    await user.click(screen.getByRole("button", { name: /Job details/ }));

    expect(screen.getByText("Manufacturing Job")).toBeTruthy();
    expect(screen.getByText("Abbey Raitaru")).toBeTruthy();
    // Every figure the popover shows goes through the locale formatter.
    expect(screen.getByText("12,000")).toBeTruthy();
  });

  it("shows only what is building under the active filter", () => {
    industryJobs.current = activeJobOn(7021);
    const { container } = renderGroup(identicalCopyRows, {
      compact,
      currentFilter: "active",
    });

    expect(cards(container)).toBe(1);
  });

  it("says so when the type is one the account does not hold", () => {
    renderGroup([], { compact });

    expect(screen.getByText("No Blueprints Owned")).toBeTruthy();
  });

  it("names who holds a blueprint and where", () => {
    renderGroup(identicalCopyRows, {
      compact,
      locationNames: new Map([[7020, "Jita IV-4"]]),
    });

    expect(
      screen.getAllByLabelText(/Reginal Shardani — Jita IV-4/).length,
    ).toBeGreaterThan(0);
  });
});

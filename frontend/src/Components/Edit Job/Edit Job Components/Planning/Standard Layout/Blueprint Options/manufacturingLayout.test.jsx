import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const { collection, industryJobs, characters } = vi.hoisted(() => ({
  collection: { current: null },
  industryJobs: { current: [] },
  characters: [{ CharacterHash: "character-hash-a", CharacterID: 2114000001 }],
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(state));
});

vi.mock("../../../../../../Hooks/EveEsi/useBlueprintIndex", () => ({
  default: () => ({ data: collection.current, isLoading: false, error: null }),
  BLUEPRINT_SCOPE: { ALL: "all" },
}));

vi.mock("../../../../../../Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  default: () => ({
    data: industryJobs.current,
    isLoading: false,
    error: null,
  }),
}));

import { ManufacturingLayout_BlueprintPanel } from "./manufacturingLayout";
import buildBlueprintRows from "../../../../../../Functions/Blueprints/buildBlueprintRows";
import {
  blueprintSearchIndex,
  characterBlueprintRows,
  CHARACTER_HASH,
  RIFTER_BLUEPRINT_TYPE_ID,
} from "../../../../../../tests/blueprintFixtures";
import { testQueryClient } from "../../../../../../tests/queryClients.js";

const state = {
  activeJob: { blueprintTypeID: RIFTER_BLUEPRINT_TYPE_ID, selectedSetup: {} },
};

function renderPanel(withState = state) {
  const client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ManufacturingLayout_BlueprintPanel state={withState} actions={{}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  characters[0].CharacterHash = CHARACTER_HASH;
  industryJobs.current = [];
  collection.current = buildBlueprintRows(
    characterBlueprintRows,
    blueprintSearchIndex,
  );
});

describe("the blueprints a manufacturing job can be built from", () => {
  // The row shape renamed every field this panel renders. A miss shows as a blank cell rather than
  // an error, so the values are asserted rather than the presence of a row.
  it("shows each blueprint's researched values", () => {
    renderPanel();

    // 7002 is the ME 10 / TE 20 original, 7001 the ME 5 / TE 10 one, 7003 an ME 10 copy.
    expect(screen.getAllByText("ME:10")).toHaveLength(2);
    expect(screen.getAllByText("TE:20")).toHaveLength(2);
    expect(screen.getByText("ME:5")).toBeTruthy();
    expect(screen.getByText("TE:10")).toBeTruthy();
  });

  it("renders one row per blueprint of the type", () => {
    renderPanel();

    const held = characterBlueprintRows.filter(
      (row) => row.type_id === RIFTER_BLUEPRINT_TYPE_ID,
    );
    expect(screen.getAllByText(/^ME:/)).toHaveLength(held.length);
  });

  // A copy shows the runs it has left; an original has none to show.
  it("shows the runs left on a copy", () => {
    renderPanel();

    expect(screen.getByText("Runs: 300")).toBeTruthy();
  });

  it("shows nothing when the type is not held", () => {
    renderPanel({ activeJob: { blueprintTypeID: 123456, selectedSetup: {} } });

    expect(screen.queryByText(/^ME:/)).toBeNull();
  });

  it("does not write to the rows it renders", () => {
    const before = JSON.stringify(collection.current.rows);

    renderPanel();

    expect(JSON.stringify(collection.current.rows)).toBe(before);
  });
});

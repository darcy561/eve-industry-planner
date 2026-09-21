import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const { collection, industryJobs, characters } = vi.hoisted(() => ({
  collection: { current: null },
  industryJobs: { current: [] },
  characters: [{ CharacterHash: "character-hash-a", CharacterID: 2114000001 }],
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
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

import {
  BlueprintItem,
  ManufacturingLayout_BlueprintPanel,
} from "./manufacturingLayout";
import buildBlueprintRows from "../../../../../../Functions/Blueprints/buildBlueprintRows";
import {
  blueprintSearchIndex,
  characterBlueprintRows,
  CHARACTER_HASH,
  RIFTER_BLUEPRINT_TYPE_ID,
} from "../../../../../../tests/blueprintFixtures";
import { testQueryClient } from "../../../../../../tests/queryClients.js";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { act } from "@testing-library/react";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const session = () => useUsersStore.getState().editSession;

/** The job the panel reads, opened in the session it reads it from. */
function openJob(blueprintTypeID = RIFTER_BLUEPRINT_TYPE_ID) {
  session().actions.closeSession();
  session().actions.openJob("job-1", {
    jobID: "job-1",
    blueprintTypeID,
    build: { setup: { "setup-1": { id: "setup-1" } } },
    layout: { setupToEdit: "setup-1" },
  });
}

function renderPanel(blueprintTypeID) {
  openJob(blueprintTypeID);
  const client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ManufacturingLayout_BlueprintPanel />
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
    renderPanel(123456);

    expect(screen.queryByText(/^ME:/)).toBeNull();
  });

  it("does not write to the rows it renders", () => {
    const before = JSON.stringify(collection.current.rows);

    renderPanel();

    expect(JSON.stringify(collection.current.rows)).toBe(before);
  });
});

// A tile draws a blueprint, not the job: it reads the setup only when it is
// pressed. Subscribed to it instead, every tile on the page would be redrawn by
// every keystroke in the setup editor beside them.
describe("what redraws the blueprints", () => {
  it("leaves the list alone while the open setup is edited", async () => {
    const renders = renderCounts();
    const Counted = renders.watch("tile", BlueprintItem);
    openJob();
    const client = testQueryClient();
    render(
      <QueryClientProvider client={client}>
        <Counted print={{ itemId: 1, me: 10, te: 20, runs: -1 }} />
      </QueryClientProvider>,
    );
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "set run count",
        recipe: (job) => {
          job.build.setup["setup-1"].runCount = 40;
        },
      });
    });

    expect(renders.of("tile")).toBe(0);
  });
});

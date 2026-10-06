import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const { collection, industryJobs } = vi.hoisted(() => ({
  collection: { current: null },
  industryJobs: { current: [] },
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: {
      isLoggedIn: true,
      actions: {
        findCharacterByHash: () => ({
          CharacterName: "Vex Rollo",
          corporation_id: 98000001,
        }),
        getCorporation: () => ({ corporationName: "Kaalakiota Holdings" }),
      },
    },
    worldData: { actions: { addSystemIndex: () => {} } },
  });
});

vi.mock("../../../../../../Functions/System Indexes/findSystemIndex", () => ({
  default: async () => ({}),
}));

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

const { BlueprintLibraryPanel } = await import("./blueprintLibraryPanel.jsx");
const { default: BlueprintRows } = await import("./blueprintRows.jsx");
const { useBlueprintLibrary } = await import("./useBlueprintLibrary.js");
const { default: buildBlueprintRows } =
  await import("../../../../../../Functions/Blueprints/buildBlueprintRows");
const {
  blueprintSearchIndex,
  characterBlueprintRows,
  CHARACTER_HASH,
  CORPORATION_ID,
  POLYMER_REACTION_TYPE_ID,
  reactionFormulaStackRow,
  RIFTER_BLUEPRINT_TYPE_ID,
} = await import("../../../../../../tests/blueprintFixtures");
const { blueprintRawData, setupFixture } =
  await import("../../../../../../tests/editJobFixtures.js");
const { testQueryClient } =
  await import("../../../../../../tests/queryClients.js");
const { renderCounts } =
  await import("../../../../../../tests/renderCounts.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { jobDraftNow } = await import("../../../../Edit Job Hooks/useJobDraft");

const session = () => useUsersStore.getState().editSession;

function openJob({
  blueprintTypeID = RIFTER_BLUEPRINT_TYPE_ID,
  jobType = 1,
  setup = {},
} = {}) {
  session().actions.closeSession();
  session().actions.openJob("job-1", {
    jobID: "job-1",
    jobType,
    itemID: 587,
    blueprintTypeID,
    rawData: blueprintRawData(),
    build: {
      setup: { "setup-1": { ...setupFixture("setup-1"), ME: 0, ...setup } },
      materials: {},
    },
    layout: { setupToEdit: "setup-1" },
  });
}

const show = (Panel = BlueprintLibraryPanel) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Panel />
    </QueryClientProvider>,
  );

beforeEach(() => {
  industryJobs.current = [];
  collection.current = buildBlueprintRows(
    characterBlueprintRows,
    blueprintSearchIndex,
  );
});

describe("the blueprints a manufacturing job can be built from", () => {
  it("states each blueprint's research as a row, one per blueprint", () => {
    openJob();
    show();

    expect(screen.getByText("Blueprint Library")).toBeInTheDocument();
    expect(screen.getAllByText("ME 10 · TE 20")).toHaveLength(2);
    expect(screen.getByText("ME 5 · TE 10")).toBeInTheDocument();
    expect(screen.getByText("3 free to use")).toBeInTheDocument();
  });

  it("says in words whether a blueprint is an original or a copy, and its runs", () => {
    openJob();
    show();

    expect(screen.getAllByText(/^Original · Vex Rollo/)).toHaveLength(2);
    expect(screen.getByText("Copy · 300 runs · Vex Rollo")).toBeInTheDocument();
  });

  it("names what a running job does to a blueprint, with no legend to teach it", () => {
    industryJobs.current = [
      {
        blueprint_id: 7003,
        blueprint_type_id: RIFTER_BLUEPRINT_TYPE_ID,
        status: "active",
        runs: 300,
      },
      {
        blueprint_id: 7002,
        blueprint_type_id: RIFTER_BLUEPRINT_TYPE_ID,
        status: "active",
        runs: 10,
      },
    ];
    openJob();
    show();

    expect(screen.getByText("Runs out")).toBeInTheDocument();
    expect(screen.getByText("Running a job")).toBeInTheDocument();
    expect(screen.getByText(/0 runs left of 300/)).toBeInTheDocument();
    expect(screen.queryByText("Blueprint In Use")).not.toBeInTheDocument();
  });

  it("marks the blueprint the setup is already on and offers it no Use", () => {
    openJob({ setup: { ME: 5, TE: 5 } });
    show();

    expect(screen.getByText("In this setup")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(2);
  });

  it("applies a blueprint's research when Use is pressed, and says what changed", async () => {
    openJob();
    show();

    fireEvent.click(screen.getAllByRole("button", { name: "Use" })[0]);

    expect(
      await screen.findByText(/Setup now at ME 10 · TE 20, from the original/),
    ).toBeInTheDocument();
    expect(jobDraftNow().build.setup["setup-1"]).toMatchObject({
      ME: 10,
      TE: 10,
    });
  });

  it("puts the setup's research back when Undo is pressed", async () => {
    openJob({ setup: { ME: 2, TE: 1 } });
    show();

    fireEvent.click(screen.getAllByRole("button", { name: "Use" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await vi.waitFor(() =>
      expect(jobDraftNow().build.setup["setup-1"]).toMatchObject({
        ME: 2,
        TE: 1,
      }),
    );
    expect(screen.queryByText(/Setup now at/)).not.toBeInTheDocument();
  });

  it("says a single run left in the singular, and counts only idle blueprints as free", () => {
    industryJobs.current = [
      {
        blueprint_id: 7003,
        blueprint_type_id: RIFTER_BLUEPRINT_TYPE_ID,
        status: "active",
        runs: 299,
      },
    ];
    openJob();
    show();

    expect(screen.getByText(/Copy · 1 run left of 300/)).toBeInTheDocument();
    expect(screen.getByText("2 free to use")).toBeInTheDocument();
  });

  it("withdraws the Undo once the setup no longer holds what Use wrote", async () => {
    openJob();
    show();

    fireEvent.click(screen.getAllByRole("button", { name: "Use" })[0]);
    await screen.findByRole("button", { name: "Undo" });

    await act(async () => {
      session().actions.run({
        name: "set the material efficiency",
        recipe: (job) => {
          job.build.setup["setup-1"].ME = 4;
        },
      });
    });

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("says so when no blueprint of the type is held", () => {
    openJob({ blueprintTypeID: 123456 });
    show();

    expect(
      screen.getByText("No blueprints held for this item."),
    ).toBeInTheDocument();
  });

  it("does not write to the rows it renders", () => {
    const before = JSON.stringify(collection.current.rows);
    openJob();
    show();

    expect(JSON.stringify(collection.current.rows)).toBe(before);
  });

  it("says how many more blueprints match the setup when several do", () => {
    openJob({ setup: { ME: 10, TE: 10 } });
    show();

    expect(
      screen.getByText("In this setup · 1 more match"),
    ).toBeInTheDocument();
  });

  it("folds past six blueprints behind a line that counts them", () => {
    const original = characterBlueprintRows.find((row) => row.item_id === 7001);
    collection.current = buildBlueprintRows(
      Array.from({ length: 9 }, (_, n) => ({
        ...original,
        item_id: 9100 + n,
        material_efficiency: n,
      })),
      blueprintSearchIndex,
    );
    openJob();
    show();

    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(6);
    fireEvent.click(screen.getByText("Show 3 more"));
    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(9);
  });

  it("leaves the rows alone while the open setup's runs are edited", async () => {
    openJob();
    const renders = renderCounts();
    const Rows = renders.watch("library", BlueprintRows);
    function Watched() {
      const library = useBlueprintLibrary();
      return <Rows blueprints={library.blueprints} />;
    }
    show(Watched);
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "set run count",
        recipe: (job) => {
          job.build.setup["setup-1"].runCount = 40;
        },
      });
    });

    expect(renders.of("library")).toBe(0);
  });
});

describe("the formulas a reaction job can be built from", () => {
  const withRows = (rows) => {
    collection.current = buildBlueprintRows(rows, blueprintSearchIndex);
  };

  beforeEach(() => withRows([reactionFormulaStackRow]));

  it("is titled a formula library and counts every formula in a stack", () => {
    openJob({ blueprintTypeID: POLYMER_REACTION_TYPE_ID, jobType: 2 });
    show();

    expect(screen.getByText("Formula Library")).toBeInTheDocument();
    expect(screen.getByText(/^4 formulas ·/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use" })).toBeNull();
  });

  it("groups a character's and a corporation's formulas apart", () => {
    withRows([
      reactionFormulaStackRow,
      {
        ...reactionFormulaStackRow,
        item_id: 8500,
        quantity: -1,
        CharacterHash: undefined,
        is_corporation: true,
        corporation_id: CORPORATION_ID,
      },
    ]);
    openJob({ blueprintTypeID: POLYMER_REACTION_TYPE_ID, jobType: 2 });
    show();

    expect(screen.getByText("Kaalakiota Holdings")).toBeInTheDocument();
    expect(screen.getByText("Vex Rollo")).toBeInTheDocument();
  });

  it("reports the formulas already carrying an active job", () => {
    industryJobs.current = [
      {
        blueprint_id: reactionFormulaStackRow.item_id,
        blueprint_type_id: POLYMER_REACTION_TYPE_ID,
        status: "active",
      },
      {
        blueprint_id: reactionFormulaStackRow.item_id,
        blueprint_type_id: POLYMER_REACTION_TYPE_ID,
        status: "delivered",
      },
    ];
    openJob({ blueprintTypeID: POLYMER_REACTION_TYPE_ID, jobType: 2 });
    show();

    expect(screen.getByText(/1 running a job/)).toBeInTheDocument();
  });

  it("says so when no formula of the reaction is held", () => {
    withRows([]);
    openJob({ blueprintTypeID: POLYMER_REACTION_TYPE_ID, jobType: 2 });
    show();

    expect(
      screen.getByText("No formulas held for this reaction."),
    ).toBeInTheDocument();
  });

  it("does not write to the formula rows it renders", () => {
    const before = JSON.stringify(collection.current.rows);
    openJob({ blueprintTypeID: POLYMER_REACTION_TYPE_ID, jobType: 2 });
    show();

    expect(JSON.stringify(collection.current.rows)).toBe(before);
  });

  it("marks the corporation of the character building the open setup", () => {
    withRows([
      {
        ...reactionFormulaStackRow,
        CharacterHash: undefined,
        is_corporation: true,
        corporation_id: CORPORATION_ID,
      },
    ]);
    openJob({
      blueprintTypeID: POLYMER_REACTION_TYPE_ID,
      jobType: 2,
      setup: { selectedCharacter: CHARACTER_HASH },
    });
    show();

    expect(screen.getByText("This setup's")).toBeInTheDocument();
  });

  it("marks the holder building the open setup", () => {
    openJob({
      blueprintTypeID: POLYMER_REACTION_TYPE_ID,
      jobType: 2,
      setup: { selectedCharacter: CHARACTER_HASH },
    });
    show();

    expect(screen.getByText("This setup's")).toBeInTheDocument();
  });
});

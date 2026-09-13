import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The drawer that costs a build before the player commits to one.
 *
 * Its fetch branching is the part worth pinning: it decides between showing the
 * child jobs a material already has, a job the group already holds, and a
 * speculative one it has to build — and a failure there has to read as a failure
 * rather than as a build that costs nothing.
 *
 * The presentational children are stubbed; this is about which state the drawer
 * puts itself in.
 */

const buildSingleChildJobPreview = vi.fn();

// One stable identity across renders. The drawer's fetch effect lists this
// function in its dependencies, so a mock that returns a fresh closure each
// render re-fires the effect forever.
const buildActions = {
  buildSingleChildJobPreview: (...args) => buildSingleChildJobPreview(...args),
};

vi.mock("./Hooks/useChildJobBuildActions", () => ({
  useChildJobBuildActions: () => buildActions,
}));

vi.mock("./Child Job Drawer/childJobMaterials", () => ({
  ChildJobMaterials: ({ childJobObjects, jobDisplay }) => (
    <div data-testid="child-materials">
      {childJobObjects[jobDisplay]?.name ?? "none"}
    </div>
  ),
}));

vi.mock("./Child Job Drawer/childJobTotalCosts", () => ({
  ChildJobMaterialTotalCosts: ({ totalCostPerItem }) => (
    <div data-testid="totals">{String(totalCostPerItem)}</div>
  ),
}));

vi.mock("./Child Job Drawer/switchChildJob", () => ({
  ChildJobSwitcher: ({ childJobObjects }) => (
    <div data-testid="switcher">{childJobObjects.length}</div>
  ),
}));

vi.mock("./Child Job Drawer/misMatchedTotals", () => ({
  DisplayMismatchedChildTotals: () => null,
}));

vi.mock("./Child Job Drawer/openChildJobButton", () => ({
  OpenChildJobButton: () => <button type="button">Open job</button>,
}));

vi.mock("./planChip", () => ({
  default: () => <div data-testid="plan-chip" />,
}));

vi.mock("./rowPricingOverride", () => ({
  default: () => <div data-testid="row-pricing" />,
}));

vi.mock("../../../../../../Functions/Groups/findMaterialJobInGroup.js", () => ({
  findMaterialJobInGroup: () => null,
}));

let exempt = false;

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: {
      actions: { checkTypeIDisExempt: () => exempt },
    },
  });
});

const { default: MaterialDrawer } = await import("./materialDrawer");
const { jobFixture, materialFixture } =
  await import("../../../../../../tests/jobFixture");

const material = materialFixture({
  typeID: 35,
  name: "Pyerite",
  quantity: 100,
});

function renderDrawer(overrides = {}) {
  return render(
    <MaterialDrawer
      isOpen
      material={material}
      state={{
        activeJob: jobFixture({ childJobs: { 35: [] } }),
        temporaryChildJobs: {},
        speculativeChildJobs: {},
        parentChildToEdit: { childJobs: {} },
      }}
      actions={{ getCurrentMaterialChildJobs: () => [] }}
      currentMaterialPrice={5}
      matchedChildJobs={[]}
      marketSelect="jita"
      listingSelect="sell"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  exempt = false;
});

describe("the child job drawer", () => {
  it("costs a build the material has no job for", async () => {
    buildSingleChildJobPreview.mockResolvedValue({
      name: "Pyerite job",
      itemID: 35,
      build: { materials: [], costs: {} },
    });

    renderDrawer();

    expect(await screen.findByTestId("child-materials")).toHaveTextContent(
      "Pyerite job",
    );
    expect(buildSingleChildJobPreview).toHaveBeenCalledWith({ material });
  });

  // A build that could not be costed must say so. Falling through to the loaded
  // state would show a comparison against totals of zero, which reads as a
  // material that costs nothing to make.
  it("says so when the build could not be costed", async () => {
    buildSingleChildJobPreview.mockResolvedValue(null);

    renderDrawer();

    expect(
      await screen.findByText("Error Importing Job Data"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("child-materials")).not.toBeInTheDocument();
  });

  it("uses the jobs the material already has rather than costing another", async () => {
    const existing = {
      name: "Linked job",
      itemID: 35,
      build: { materials: [], costs: {} },
    };

    renderDrawer({ matchedChildJobs: [existing] });

    expect(await screen.findByTestId("child-materials")).toHaveTextContent(
      "Linked job",
    );
    expect(buildSingleChildJobPreview).not.toHaveBeenCalled();
  });

  it("stays shut until it is opened, so nothing is costed unasked", () => {
    renderDrawer({ isOpen: false });

    expect(buildSingleChildJobPreview).not.toHaveBeenCalled();
    expect(screen.queryByTestId("child-materials")).not.toBeInTheDocument();
  });

  it("warns when the account excludes the material from builds", async () => {
    exempt = true;
    buildSingleChildJobPreview.mockResolvedValue({
      name: "Pyerite job",
      itemID: 35,
      build: { materials: [], costs: {} },
    });

    renderDrawer();

    expect(
      await screen.findByText("Marked as exempt from builds."),
    ).toBeInTheDocument();
  });
});

// Opening a drawer on a row nobody has decided to build costs a job
// speculatively, so the drawer can show what building would take. That job
// carries an id but lives in this page's state alone — offering to open it would
// navigate to a job the planner does not hold.
describe("opening the job behind a row", () => {
  it("offers nothing for a row that is only being costed", async () => {
    renderDrawer();

    expect(await screen.findByTestId("child-materials")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open job" })).toBeNull();
  });

  it("offers the job once the row is actually built by one", async () => {
    const linked = { jobID: "child-1", name: "Tritanium", build: {} };

    renderDrawer({
      matchedChildJobs: [linked],
      state: {
        activeJob: jobFixture({ childJobs: { 35: ["child-1"] } }),
        temporaryChildJobs: {},
        speculativeChildJobs: {},
        parentChildToEdit: { childJobs: {} },
      },
    });

    expect(
      await screen.findByRole("button", { name: "Open job" }),
    ).toBeInTheDocument();
  });
});

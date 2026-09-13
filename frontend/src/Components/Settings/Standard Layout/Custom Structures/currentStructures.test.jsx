import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CurrentStructuresFrame from "./currentStructures";
import { jobTypes } from "../../../../Context/defaultValues";

const setDefaultCustomStructure = vi.fn();
const deleteCustomStructure = vi.fn();

let structures = [];
/** Which slot of the store the structures under test are held in. */
let lane = "manufacturing";

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        customStructures: { [lane]: structures },
        actions: { setDefaultCustomStructure, deleteCustomStructure },
      },
      worldData: {
        actions: { findSystemIndex: () => ({ manufacturing: 0.05 }) },
      },
    }),
  );
});

vi.mock("../../../../Hooks/useSolarSystemNames", () => ({
  UNKNOWN_SYSTEM_LABEL: "Unknown system",
  useSolarSystemNames: () => ({ 30000142: "Jita" }),
}));

vi.mock(
  "../../../../Functions/Debounce/userDocumentsPersistSchedule.js",
  () => ({
    scheduleDebouncedApplicationSettingsSave: vi.fn(),
  }),
);

function aStructure(overrides = {}) {
  return {
    id: "structure-1",
    name: "Jita Sotiyo",
    structureType: 0,
    rigType: 0,
    systemType: 0,
    systemID: 30000142,
    tax: 2.5,
    default: false,
    ...overrides,
  };
}

function renderFrame(props = {}) {
  return render(
    <CurrentStructuresFrame
      selectedJobType={jobTypes.manufacturing}
      isLoading={false}
      {...props}
    />,
  );
}

describe("the structures a reader has saved", () => {
  beforeEach(() => {
    lane = "manufacturing";
    structures = [aStructure()];
    setDefaultCustomStructure.mockClear();
    deleteCustomStructure.mockClear();
  });

  it("names each structure and what it is made of", () => {
    renderFrame();

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    // The system the structure sits in, resolved to a name rather than an id.
    expect(screen.getByText("Jita")).toBeInTheDocument();
  });

  it("waits rather than showing an empty list while loading", () => {
    renderFrame({ isLoading: true });

    expect(screen.queryByText("Jita Sotiyo")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("makes a structure the default for new jobs", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.click(screen.getByRole("button", { name: /make default/i }));

    expect(setDefaultCustomStructure).toHaveBeenCalledWith("structure-1");
  });

  it("offers no way to re-default the one that already is", () => {
    structures = [aStructure({ default: true })];
    renderFrame();

    expect(
      screen.getByRole("button", { name: /make default/i }),
    ).toBeDisabled();
  });

  it("removes a structure", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(deleteCustomStructure).toHaveBeenCalledWith("structure-1");
  });

  it("shows every structure it is given", () => {
    structures = [
      aStructure(),
      aStructure({ id: "structure-2", name: "Perimeter Azbel" }),
    ];
    renderFrame();

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("Perimeter Azbel")).toBeInTheDocument();
  });

  it("holds its shape when there is nothing saved", () => {
    structures = [];
    renderFrame();

    expect(
      screen.queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
  });
});

// A structure is described by different facts depending on what it does, and
// each job type used to have its own card body on each of two layouts. One body
// serves them all now, so what each type is owed is asserted rather than read.
describe("what a card says about each kind of structure", () => {
  beforeEach(() => {
    setDefaultCustomStructure.mockClear();
    deleteCustomStructure.mockClear();
  });

  it("gives a manufacturing structure its rig, tax, security and system", () => {
    lane = "manufacturing";
    structures = [aStructure()];
    renderFrame({ selectedJobType: jobTypes.manufacturing });

    expect(screen.getByText("Rig")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Jita")).toBeInTheDocument();
  });

  it("gives an invention structure both of its rig slots", () => {
    lane = "invention";
    structures = [aStructure({ rigSlot1: 0, rigSlot2: 0 })];
    renderFrame({ selectedJobType: jobTypes.invention });

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("Rigs")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    // Invention happens wherever the blueprint is, so no system is named.
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("gives a reprocessing structure its implant", () => {
    lane = "reprocessing";
    structures = [aStructure({ rigSlot1: 0, rigSlot2: 0, implant: 0 })];
    renderFrame({ selectedJobType: jobTypes.reprocessing });

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("Implant")).toBeInTheDocument();
    expect(screen.getByText("Rigs")).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CurrentStructuresFrame from "./currentStructures";
import { jobTypes, structureKinds } from "../../../../Context/defaultValues";

const setDefaultCustomStructure = vi.fn();
const deleteCustomStructure = vi.fn();

let structures = [];

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        customStructures: structures,
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
    jobType: jobTypes.manufacturing,
    name: "Jita Sotiyo",
    structureType: 0,
    rigSlot1: 0,
    rigSlot2: 0,
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

  it("gives a manufacturing structure its rigs, tax, security and system", () => {
    structures = [aStructure({ jobType: jobTypes.manufacturing })];
    renderFrame({ selectedJobType: jobTypes.manufacturing });

    expect(screen.getByText("Rigs")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Jita")).toBeInTheDocument();
  });

  // One list holds every kind now, so the frame has to pick out the kind it was
  // asked for rather than render whatever the store happens to hold.
  it("shows only the structures of the kind it was asked for", () => {
    structures = [
      aStructure({ jobType: jobTypes.manufacturing, name: "A manufacturer" }),
      aStructure({
        id: "structure-2",
        jobType: jobTypes.reprocessing,
        name: "A refinery",
        rigSlot1: 0,
        rigSlot2: 0,
        implant: 0,
      }),
    ];
    renderFrame({ selectedJobType: jobTypes.manufacturing });

    expect(screen.getByText("A manufacturer")).toBeInTheDocument();
    expect(screen.queryByText("A refinery")).not.toBeInTheDocument();
  });

  // Manufacturing was the last kind reading a single rig field, so a card that
  // names both fitted rigs is what proves it reads the slots like every other.
  it("names both rigs fitted to a manufacturing structure", () => {
    structures = [
      aStructure({ jobType: jobTypes.manufacturing, rigSlot1: 2, rigSlot2: 3 }),
    ];
    renderFrame({ selectedJobType: jobTypes.manufacturing });

    expect(
      screen.getByText("T2 - ME - All · T1 - TE - All"),
    ).toBeInTheDocument();
  });

  it("gives an invention structure both of its rig slots", () => {
    structures = [
      aStructure({ jobType: jobTypes.invention, rigSlot1: 0, rigSlot2: 0 }),
    ];
    renderFrame({ selectedJobType: jobTypes.invention });

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("Rigs")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    // Invention happens wherever the blueprint is, so no system is named.
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("gives a reprocessing structure its implant", () => {
    structures = [
      aStructure({
        jobType: jobTypes.reprocessing,
        rigSlot1: 0,
        rigSlot2: 0,
        implant: 0,
      }),
    ];
    renderFrame({ selectedJobType: jobTypes.reprocessing });

    expect(screen.getByText("Jita Sotiyo")).toBeInTheDocument();
    expect(screen.getByText("Implant")).toBeInTheDocument();
    expect(screen.getByText("Rigs")).toBeInTheDocument();
  });
});

// The card body falls through to the build fields for any kind that does not
// return early, so a market would be described as somewhere a job is installed:
// a structure type it has no bonuses from, rigs it cannot fit, an installation
// tax it does not charge, and a system index it has no cost to apply one to.
describe("what a card says about a market", () => {
  it("does not describe a citadel market as somewhere a job is built", () => {
    structures = [
      {
        id: "citadelMarket-1",
        jobType: structureKinds.citadelMarket,
        name: "Perimeter Azbel",
        brokerFee: 1.5,
        default: true,
      },
    ];
    renderFrame({ selectedJobType: structureKinds.citadelMarket });

    expect(screen.getByText("Perimeter Azbel")).toBeInTheDocument();
    for (const label of ["Rigs", "Tax", "Security", "System"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("does not describe an NPC station market as one either", () => {
    structures = [
      {
        id: "npcMarket-1",
        jobType: structureKinds.npcStation,
        name: "Jita IV-4",
        default: true,
      },
    ];
    renderFrame({ selectedJobType: structureKinds.npcStation });

    for (const label of ["Rigs", "Tax", "Security", "System"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
